import { describe, it, expect, beforeEach, vi } from "vitest";

const mockCheck = vi.fn();
const mockRelaunch = vi.fn();

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: (...args: unknown[]) => mockCheck(...args),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: (...args: unknown[]) => mockRelaunch(...args),
}));

import type { Update } from "@tauri-apps/plugin-updater";
import { checkForUpdate, downloadAndInstallUpdate } from "@/hooks/useUpdate";

function createMockUpdate(version: string, available: boolean) {
  return {
    available,
    version,
    currentVersion: "0.1.0",
    date: "2026-08-12",
    body: "Bug fixes",
    rawJson: {},
    downloadAndInstall: vi.fn(),
    download: vi.fn(),
    install: vi.fn(),
    close: vi.fn(),
  } as unknown as Update & { downloadAndInstall: ReturnType<typeof vi.fn> };
}

describe("update system", () => {
  beforeEach(() => {
    mockCheck.mockReset();
    mockRelaunch.mockReset();
  });

  describe("checkForUpdate", () => {
    it("should return update when available", async () => {
      const update = createMockUpdate("0.2.0", true);
      mockCheck.mockResolvedValueOnce(update);

      const result = await checkForUpdate();

      expect(mockCheck).toHaveBeenCalledOnce();
      expect(result).not.toBeNull();
      expect(result!.version).toBe("0.2.0");
      expect(result!.available).toBe(true);
    });

    it("should return null when no update available", async () => {
      mockCheck.mockResolvedValueOnce({ available: false, version: "0.1.0" });

      const result = await checkForUpdate();

      expect(result).toBeNull();
    });

    it("should return null when check returns null", async () => {
      mockCheck.mockResolvedValueOnce(null);

      const result = await checkForUpdate();

      expect(result).toBeNull();
    });

    it("should propagate network errors", async () => {
      mockCheck.mockRejectedValueOnce(new Error("Network unreachable"));

      await expect(checkForUpdate()).rejects.toThrow("Network unreachable");
    });

    it("should propagate endpoint errors", async () => {
      mockCheck.mockRejectedValueOnce(new Error("404 Not Found"));

      await expect(checkForUpdate()).rejects.toThrow("404 Not Found");
    });
  });

  describe("downloadAndInstallUpdate", () => {
    it("should call downloadAndInstall and relaunch", async () => {
      const update = createMockUpdate("0.2.0", true);
      update.downloadAndInstall.mockResolvedValueOnce(undefined);
      mockRelaunch.mockResolvedValueOnce(undefined);

      await downloadAndInstallUpdate(update);

      expect(update.downloadAndInstall).toHaveBeenCalledOnce();
      expect(mockRelaunch).toHaveBeenCalledOnce();
    });

    it("should report progress through callback", async () => {
      const update = createMockUpdate("0.2.0", true);
      const progressValues: string[] = [];

      update.downloadAndInstall.mockImplementation(async (cb: Function) => {
        cb({ event: "Started", data: { contentLength: 5120 } });
        cb({ event: "Progress", data: { chunkLength: 1024 } });
        cb({ event: "Finished", data: {} });
      });
      mockRelaunch.mockResolvedValueOnce(undefined);

      await downloadAndInstallUpdate(update, (p) => progressValues.push(p));

      expect(progressValues).toEqual([
        "Downloading... 0/5KB",
        "Downloading...",
        "Installing...",
      ]);
    });

    it("should report progress without content length", async () => {
      const update = createMockUpdate("0.2.0", true);
      const progressValues: string[] = [];

      update.downloadAndInstall.mockImplementation(async (cb: Function) => {
        cb({ event: "Started", data: {} });
        cb({ event: "Progress", data: { chunkLength: 512 } });
        cb({ event: "Finished", data: {} });
      });
      mockRelaunch.mockResolvedValueOnce(undefined);

      await downloadAndInstallUpdate(update, (p) => progressValues.push(p));

      expect(progressValues).toEqual(["Downloading...", "Installing..."]);
    });

    it("should propagate download errors", async () => {
      const update = createMockUpdate("0.2.0", true);
      update.downloadAndInstall.mockRejectedValueOnce(new Error("Download failed: disk full"));

      await expect(downloadAndInstallUpdate(update)).rejects.toThrow("disk full");
    });

    it("should not relaunch if download fails", async () => {
      const update = createMockUpdate("0.2.0", true);
      update.downloadAndInstall.mockRejectedValueOnce(new Error("Signature mismatch"));

      await expect(downloadAndInstallUpdate(update)).rejects.toThrow();
      expect(mockRelaunch).not.toHaveBeenCalled();
    });
  });

  describe("full update flow", () => {
    it("should complete check -> download -> install -> relaunch", async () => {
      const update = createMockUpdate("0.3.0", true);
      mockCheck.mockResolvedValueOnce(update);
      update.downloadAndInstall.mockResolvedValueOnce(undefined);
      mockRelaunch.mockResolvedValueOnce(undefined);

      const found = await checkForUpdate();
      expect(found).not.toBeNull();
      expect(found!.version).toBe("0.3.0");

      await downloadAndInstallUpdate(found!);

      expect(update.downloadAndInstall).toHaveBeenCalledOnce();
      expect(mockRelaunch).toHaveBeenCalledOnce();
    });

    it("should handle skip then resume flow", async () => {
      const update = createMockUpdate("0.3.0", true);
      mockCheck.mockResolvedValue(update);

      const first = await checkForUpdate();
      expect(first).not.toBeNull();

      const second = await checkForUpdate();
      expect(second).not.toBeNull();
      expect(second!.version).toBe("0.3.0");

      update.downloadAndInstall.mockResolvedValueOnce(undefined);
      mockRelaunch.mockResolvedValueOnce(undefined);
      await downloadAndInstallUpdate(second!);

      expect(mockRelaunch).toHaveBeenCalledOnce();
    });

    it("should handle no update gracefully in full flow", async () => {
      mockCheck.mockResolvedValueOnce({ available: false, version: "0.1.0" });

      const found = await checkForUpdate();
      expect(found).toBeNull();
    });

    it("should handle update becoming available after initial no-update", async () => {
      mockCheck.mockResolvedValueOnce({ available: false, version: "0.1.0" });
      const first = await checkForUpdate();
      expect(first).toBeNull();

      const update = createMockUpdate("0.2.0", true);
      mockCheck.mockResolvedValueOnce(update);
      const second = await checkForUpdate();
      expect(second).not.toBeNull();
      expect(second!.version).toBe("0.2.0");
    });

    it("should verify signature via downloadAndInstall (mismatch rejects)", async () => {
      const update = createMockUpdate("0.2.0", true);
      mockCheck.mockResolvedValueOnce(update);
      update.downloadAndInstall.mockRejectedValueOnce(new Error("Signature verification failed"));

      const found = await checkForUpdate();
      await expect(downloadAndInstallUpdate(found!)).rejects.toThrow("Signature verification failed");
      expect(mockRelaunch).not.toHaveBeenCalled();
    });
  });
});
