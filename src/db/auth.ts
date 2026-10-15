import { getDb, op, isOffline } from "@/database";
import { invoke } from "@tauri-apps/api/core";

async function hashPassword(password: string): Promise<string> {
  const encoded = new TextEncoder().encode(password);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function initPassword(): Promise<void> {
  const db = await getDb();
  if (isOffline()) return;
  const ver = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = 'app_password_version'"
  );
  if (ver.length === 0 || ver[0].value !== "3") {
    const hash = await invoke<string>("get_default_hash");
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('app_password', $1)",
      [hash]
    );
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('app_password_version', '3')"
    );
  }
}

export async function readPasswordHash(): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = 'app_password'"
  );
  return rows[0]?.value ?? null;
}

export async function verifyPassword(password: string): Promise<boolean> {
  const stored = await readPasswordHash();
  if (stored === null) return false;

  const hash = await hashPassword(password);
  return hash === stored;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<boolean> {
  const valid = await verifyPassword(currentPassword);
  if (!valid) return false;

  await savePasswordHash(await hashPassword(newPassword));
  return true;
}

const savePasswordHash = op("savePasswordHash", async (hash: string): Promise<void> => {
  const db = await getDb();
  await db.execute(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('app_password', $1)",
    [hash]
  );
});
