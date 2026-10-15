import { invoke } from "@tauri-apps/api/core";
import { requireOnline } from "@/database";

export interface DriveFile {
  id: string;
  name: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
}

export async function createBackup(): Promise<DriveFile> {
  return invoke<DriveFile>("gdrive_backup");
}

export async function listBackups(): Promise<DriveFile[]> {
  return invoke<DriveFile[]>("gdrive_list_backups");
}

export type RestoreTarget = "server" | "local";

export async function restoreBackup(fileId: string): Promise<RestoreTarget> {
  requireOnline();
  return invoke<RestoreTarget>("gdrive_restore", { fileId });
}

export async function deleteBackup(fileId: string): Promise<void> {
  return invoke<void>("gdrive_delete_backup", { fileId });
}

export interface AutoBackupStatus {
  last_backup_ts?: number;
}

export async function getAutoBackupStatus(): Promise<AutoBackupStatus> {
  return invoke<AutoBackupStatus>("gdrive_get_auto_backup_status");
}
