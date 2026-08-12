import { invoke } from "@tauri-apps/api/core";

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

export async function restoreBackup(fileId: string): Promise<void> {
  return invoke<void>("gdrive_restore", { fileId });
}

export async function deleteBackup(fileId: string): Promise<void> {
  return invoke<void>("gdrive_delete_backup", { fileId });
}

export interface AutoBackupStatus {
  enabled: boolean;
  last_backup_date?: string;
}

export async function getAutoBackupStatus(): Promise<AutoBackupStatus> {
  return invoke<AutoBackupStatus>("gdrive_get_auto_backup_status");
}

export async function setAutoBackup(enabled: boolean): Promise<void> {
  return invoke("gdrive_set_auto_backup", { enabled });
}
