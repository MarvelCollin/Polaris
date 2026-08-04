import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMock, mockDb } from "./setup";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import {
  getStoredRefreshToken,
  storeTokens,
  clearTokens,
  authenticate,
  getValidAccessToken,
  createBackup,
  listBackups,
  restoreBackup,
  deleteBackup,
  getAutoBackupStatus,
  setAutoBackup,
} from "@/db/backup";

describe("backup", () => {
  beforeEach(() => {
    resetMock();
    mockInvoke.mockReset();
  });

  describe("token storage", () => {
    it("should return null when no refresh token stored", async () => {
      mockDb.select.mockResolvedValueOnce([]);
      const token = await getStoredRefreshToken();
      expect(token).toBeNull();
    });

    it("should return stored refresh token", async () => {
      mockDb.select.mockResolvedValueOnce([{ value: "refresh_abc" }]);
      const token = await getStoredRefreshToken();
      expect(token).toBe("refresh_abc");
    });

    it("should store both access and refresh tokens", async () => {
      await storeTokens("access_123", "refresh_456");

      const calls = mockDb.execute.mock.calls;
      const accessCall = calls.find(
        (c: unknown[]) => (c[0] as string).includes("settings") && (c[1] as unknown[])?.includes("gdrive_access_token")
      );
      const refreshCall = calls.find(
        (c: unknown[]) => (c[0] as string).includes("settings") && (c[1] as unknown[])?.includes("gdrive_refresh_token")
      );
      expect(accessCall).toBeDefined();
      expect(refreshCall).toBeDefined();
      expect(accessCall![1]).toContain("access_123");
      expect(refreshCall![1]).toContain("refresh_456");
    });

    it("should store only access token when no refresh provided", async () => {
      await storeTokens("access_only");

      const calls = mockDb.execute.mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toContain("gdrive_access_token");
      expect(calls[0][1]).toContain("access_only");
    });

    it("should clear both tokens on disconnect", async () => {
      await clearTokens();

      const calls = mockDb.execute.mock.calls;
      const deleteAccess = calls.find(
        (c: unknown[]) => (c[1] as unknown[])?.includes("gdrive_access_token")
      );
      const deleteRefresh = calls.find(
        (c: unknown[]) => (c[1] as unknown[])?.includes("gdrive_refresh_token")
      );
      expect(deleteAccess).toBeDefined();
      expect(deleteRefresh).toBeDefined();
    });
  });

  describe("authenticate", () => {
    it("should invoke gdrive_authenticate and store tokens", async () => {
      mockInvoke.mockResolvedValueOnce({
        access_token: "new_access",
        refresh_token: "new_refresh",
      });

      await authenticate();

      expect(mockInvoke).toHaveBeenCalledWith("gdrive_authenticate");
      const calls = mockDb.execute.mock.calls;
      expect(calls.some((c: unknown[]) => (c[1] as unknown[])?.includes("new_access"))).toBe(true);
      expect(calls.some((c: unknown[]) => (c[1] as unknown[])?.includes("new_refresh"))).toBe(true);
    });
  });

  describe("getValidAccessToken", () => {
    it("should throw when no refresh token exists", async () => {
      mockDb.select.mockResolvedValueOnce([]);
      await expect(getValidAccessToken()).rejects.toThrow("Belum terhubung ke Google Drive");
    });

    it("should refresh and return new access token", async () => {
      mockDb.select.mockResolvedValueOnce([{ value: "refresh_token_xyz" }]);
      mockInvoke.mockResolvedValueOnce({ access_token: "fresh_access" });

      const token = await getValidAccessToken();

      expect(token).toBe("fresh_access");
      expect(mockInvoke).toHaveBeenCalledWith("gdrive_refresh", {
        refreshToken: "refresh_token_xyz",
      });
    });
  });

  describe("backup operations", () => {
    it("should invoke gdrive_backup with access token", async () => {
      const mockFile = { id: "file1", name: "backup.db" };
      mockInvoke.mockResolvedValueOnce(mockFile);

      const result = await createBackup("token_abc");

      expect(mockInvoke).toHaveBeenCalledWith("gdrive_backup", {
        accessToken: "token_abc",
      });
      expect(result).toEqual(mockFile);
    });

    it("should invoke gdrive_list_backups with access token", async () => {
      const mockFiles = [{ id: "f1", name: "b1.db" }, { id: "f2", name: "b2.db" }];
      mockInvoke.mockResolvedValueOnce(mockFiles);

      const result = await listBackups("token_abc");

      expect(mockInvoke).toHaveBeenCalledWith("gdrive_list_backups", {
        accessToken: "token_abc",
      });
      expect(result).toHaveLength(2);
    });

    it("should invoke gdrive_restore with token and file id", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await restoreBackup("token_abc", "file_id_123");

      expect(mockInvoke).toHaveBeenCalledWith("gdrive_restore", {
        accessToken: "token_abc",
        fileId: "file_id_123",
      });
    });

    it("should invoke gdrive_delete_backup with token and file id", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await deleteBackup("token_abc", "file_id_456");

      expect(mockInvoke).toHaveBeenCalledWith("gdrive_delete_backup", {
        accessToken: "token_abc",
        fileId: "file_id_456",
      });
    });
  });

  describe("auto backup", () => {
    it("should get auto backup status", async () => {
      const mockStatus = { enabled: true, last_backup_date: "2026-08-04" };
      mockInvoke.mockResolvedValueOnce(mockStatus);

      const result = await getAutoBackupStatus();

      expect(mockInvoke).toHaveBeenCalledWith("gdrive_get_auto_backup_status");
      expect(result.enabled).toBe(true);
      expect(result.last_backup_date).toBe("2026-08-04");
    });

    it("should enable auto backup with refresh token", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await setAutoBackup(true, "refresh_xyz");

      expect(mockInvoke).toHaveBeenCalledWith("gdrive_set_auto_backup", {
        enabled: true,
        refreshToken: "refresh_xyz",
      });
    });

    it("should disable auto backup", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await setAutoBackup(false);

      expect(mockInvoke).toHaveBeenCalledWith("gdrive_set_auto_backup", {
        enabled: false,
        refreshToken: undefined,
      });
    });
  });
});
