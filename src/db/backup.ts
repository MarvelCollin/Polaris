import { invoke } from "@tauri-apps/api/core";

export interface DriveFile {
  id: string;
  name: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
}

export async function gdriveAuth(): Promise<void> {
  return invoke<void>("gdrive_auth");
}

export async function gdriveIsConnected(): Promise<boolean> {
  return invoke<boolean>("gdrive_is_connected");
}

export async function gdriveDisconnect(): Promise<void> {
  return invoke<void>("gdrive_disconnect");
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
  last_backup_ts?: number;
}

export async function getAutoBackupStatus(): Promise<AutoBackupStatus> {
  return invoke<AutoBackupStatus>("gdrive_get_auto_backup_status");
}
