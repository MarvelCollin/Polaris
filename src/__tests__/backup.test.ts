import { describe, it, expect, beforeEach, vi } from "vitest";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import {
  createBackup,
  listBackups,
  restoreBackup,
  deleteBackup,
  getAutoBackupStatus,
} from "@/db/backup";

describe("backup", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  describe("backup operations", () => {
    it("should invoke gdrive_backup", async () => {
      const mockFile = { id: "file1", name: "backup.db" };
      mockInvoke.mockResolvedValueOnce(mockFile);

      const result = await createBackup();

      expect(mockInvoke).toHaveBeenCalledWith("gdrive_backup");
      expect(result).toEqual(mockFile);
    });

    it("should invoke gdrive_list_backups", async () => {
      const mockFiles = [{ id: "f1", name: "b1.db" }, { id: "f2", name: "b2.db" }];
      mockInvoke.mockResolvedValueOnce(mockFiles);

      const result = await listBackups();

      expect(mockInvoke).toHaveBeenCalledWith("gdrive_list_backups");
      expect(result).toHaveLength(2);
    });

    it("should invoke gdrive_restore with file id", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await restoreBackup("file_id_123");

      expect(mockInvoke).toHaveBeenCalledWith("gdrive_restore", {
        fileId: "file_id_123",
      });
    });

    it("should invoke gdrive_delete_backup with file id", async () => {
      mockInvoke.mockResolvedValueOnce(undefined);

      await deleteBackup("file_id_456");

      expect(mockInvoke).toHaveBeenCalledWith("gdrive_delete_backup", {
        fileId: "file_id_456",
      });
    });
  });

  describe("auto backup", () => {
    it("should get auto backup status", async () => {
      const mockStatus = { last_backup_ts: 1722787200 };
      mockInvoke.mockResolvedValueOnce(mockStatus);

      const result = await getAutoBackupStatus();

      expect(mockInvoke).toHaveBeenCalledWith("gdrive_get_auto_backup_status");
      expect(result.last_backup_ts).toBe(1722787200);
    });
  });
});
