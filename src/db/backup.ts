import { getDb } from "@/database";
import { invoke } from "@tauri-apps/api/core";

export interface DriveFile {
  id: string;
  name: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
}

async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = $1",
    [key]
  );
  return rows.length > 0 ? rows[0].value : null;
}

async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)",
    [key, value]
  );
}

async function deleteSetting(key: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM settings WHERE key = $1", [key]);
}

export async function getStoredRefreshToken(): Promise<string | null> {
  return getSetting("gdrive_refresh_token");
}

export async function storeTokens(
  access: string,
  refresh?: string
): Promise<void> {
  await setSetting("gdrive_access_token", access);
  if (refresh) {
    await setSetting("gdrive_refresh_token", refresh);
  }
}

export async function clearTokens(): Promise<void> {
  await deleteSetting("gdrive_access_token");
  await deleteSetting("gdrive_refresh_token");
}

export async function authenticate(): Promise<void> {
  const result = await invoke<TokenResponse>("gdrive_authenticate");
  await storeTokens(result.access_token, result.refresh_token);
}

export async function getValidAccessToken(): Promise<string> {
  const refresh = await getStoredRefreshToken();
  if (!refresh) throw new Error("Belum terhubung ke Google Drive");

  const result = await invoke<TokenResponse>("gdrive_refresh", {
    refreshToken: refresh,
  });
  await setSetting("gdrive_access_token", result.access_token);
  return result.access_token;
}

export async function createBackup(accessToken: string): Promise<DriveFile> {
  return invoke<DriveFile>("gdrive_backup", { accessToken });
}

export async function listBackups(accessToken: string): Promise<DriveFile[]> {
  return invoke<DriveFile[]>("gdrive_list_backups", { accessToken });
}

export async function restoreBackup(
  accessToken: string,
  fileId: string
): Promise<void> {
  return invoke<void>("gdrive_restore", { accessToken, fileId });
}

export async function deleteBackup(
  accessToken: string,
  fileId: string
): Promise<void> {
  return invoke<void>("gdrive_delete_backup", { accessToken, fileId });
}
