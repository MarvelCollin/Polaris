import { describe, it, expect, beforeEach, vi } from "vitest";

const mockCheck = vi.fn();
const mockInvoke = vi.fn();

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: (...args: unknown[]) => mockCheck(...args),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(async () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

async function freshModule() {
  vi.resetModules();
  return import("@/hooks/useUpdate");
}

function fakeUpdate() {
  return {
    available: true,
    version: "9.9.9",
    currentVersion: "1.0.0",
    rawJson: {},
    downloadAndInstall: vi.fn(),
    download: vi.fn(),
    install: vi.fn(),
    close: vi.fn(),
  };
}

describe("authenticated updater", () => {
  beforeEach(() => {
    mockCheck.mockReset();
    mockInvoke.mockReset();
  });

  it("asks the backend for the updater token", async () => {
    mockInvoke.mockResolvedValue("ghp_example");
    mockCheck.mockResolvedValue(fakeUpdate());
    const { checkForUpdate } = await freshModule();
    await checkForUpdate();
    expect(mockInvoke).toHaveBeenCalledWith("get_updater_token");
  });

  it("sends a bearer token and the raw accept header when checking", async () => {
    mockInvoke.mockResolvedValue("ghp_example");
    mockCheck.mockResolvedValue(fakeUpdate());
    const { checkForUpdate } = await freshModule();
    await checkForUpdate();
    expect(mockCheck).toHaveBeenCalledWith({
      headers: { Authorization: "Bearer ghp_example", Accept: "application/vnd.github.raw" },
    });
  });

  it("sends the octet stream accept header when downloading", async () => {
    mockInvoke.mockResolvedValue("ghp_example");
    const update = fakeUpdate();
    const { downloadAndInstallUpdate } = await freshModule();
    await downloadAndInstallUpdate(update as never);
    const options = update.downloadAndInstall.mock.calls[0][1];
    expect(options).toEqual({
      headers: { Authorization: "Bearer ghp_example", Accept: "application/octet-stream" },
    });
  });

  it("uses different accept headers for check and download", async () => {
    mockInvoke.mockResolvedValue("ghp_example");
    mockCheck.mockResolvedValue(fakeUpdate());
    const update = fakeUpdate();
    const { checkForUpdate, downloadAndInstallUpdate } = await freshModule();
    await checkForUpdate();
    await downloadAndInstallUpdate(update as never);
    const checkAccept = mockCheck.mock.calls[0][0].headers.Accept;
    const downloadAccept = update.downloadAndInstall.mock.calls[0][1].headers.Accept;
    expect(checkAccept).not.toBe(downloadAccept);
  });

  it("still works with no token so a public repo keeps updating", async () => {
    mockInvoke.mockResolvedValue(null);
    mockCheck.mockResolvedValue(fakeUpdate());
    const update = fakeUpdate();
    const { checkForUpdate, downloadAndInstallUpdate } = await freshModule();
    await checkForUpdate();
    await downloadAndInstallUpdate(update as never);
    expect(mockCheck).toHaveBeenCalledWith({ headers: undefined });
    expect(update.downloadAndInstall.mock.calls[0][1]).toEqual({ headers: undefined });
  });

  it("does not crash when the backend command is missing", async () => {
    mockInvoke.mockRejectedValue(new Error("no such command"));
    mockCheck.mockResolvedValue(fakeUpdate());
    const { checkForUpdate } = await freshModule();
    await expect(checkForUpdate()).resolves.not.toBeNull();
  });

  it("fetches the token once and reuses it", async () => {
    mockInvoke.mockResolvedValue("ghp_example");
    mockCheck.mockResolvedValue(fakeUpdate());
    const { checkForUpdate } = await freshModule();
    await checkForUpdate();
    await checkForUpdate();
    await checkForUpdate();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
});
