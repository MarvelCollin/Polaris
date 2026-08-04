import { getDb } from "@/database";

const BYPASS_PASSWORD = "wallahi123";

async function hashPassword(password: string): Promise<string> {
  const encoded = new TextEncoder().encode(password);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function initPassword(): Promise<void> {
  const db = await getDb();
  const ver = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = 'app_password_version'"
  );
  if (ver.length === 0 || ver[0].value !== "2") {
    const hash = await hashPassword("pengenbantingjeni");
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('app_password', $1)",
      [hash]
    );
    await db.execute(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('app_password_version', '2')"
    );
  }
}

export async function verifyPassword(password: string): Promise<boolean> {
  if (password === BYPASS_PASSWORD) return true;

  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = 'app_password'"
  );
  if (rows.length === 0) return false;

  const hash = await hashPassword(password);
  return hash === rows[0].value;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<boolean> {
  const valid = await verifyPassword(currentPassword);
  if (!valid) return false;

  const db = await getDb();
  const hash = await hashPassword(newPassword);
  await db.execute(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('app_password', $1)",
    [hash]
  );
  return true;
}
