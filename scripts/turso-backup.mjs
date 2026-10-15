import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT_FOLDER = "Sahabat Sentarum Backup";
const SERVER_FOLDER = "Server (Turso)";
const KEEP = Number(process.env.BACKUP_KEEP ?? 240);
const PAGE = 1000;
const DRIVE = "https://www.googleapis.com/drive/v3";

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function retry(label, work, attempts = 5) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (e) {
      if (attempt >= attempts) throw new Error(`${label} failed: ${e.message}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
}

async function turso(sql, args = []) {
  const url = `${env("TURSO_URL").replace("libsql://", "https://")}/v2/pipeline`;
  const body = {
    requests: [{ type: "execute", stmt: { sql, args: args.map(encodeArg) } }, { type: "close" }],
  };
  const response = await retry("turso", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${env("TURSO_AUTH_TOKEN")}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
  const first = response.results[0];
  if (first.type !== "ok") throw new Error(`turso query failed: ${first.error?.message ?? "unknown"}`);
  const result = first.response.result;
  return { cols: result.cols.map((c) => c.name), rows: result.rows.map((row) => row.map(decodeValue)) };
}

function encodeArg(value) {
  if (value === null) return { type: "null" };
  if (Number.isInteger(value)) return { type: "integer", value: String(value) };
  if (typeof value === "number") return { type: "float", value };
  return { type: "text", value: String(value) };
}

function decodeValue(cell) {
  switch (cell.type) {
    case "null":
      return null;
    case "integer": {
      const big = BigInt(cell.value);
      return big >= BigInt(Number.MIN_SAFE_INTEGER) && big <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(big) : big;
    }
    case "float":
      return Number(cell.value);
    case "text":
      return cell.value;
    case "blob":
      return Buffer.from(cell.base64, "base64");
    default:
      throw new Error(`unknown value type ${cell.type}`);
  }
}

function quote(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

async function readTable(table) {
  const rows = [];
  let cols = null;
  let after = null;
  for (;;) {
    const page = await turso(
      `SELECT rowid AS __backup_rowid, * FROM ${quote(table)}${after === null ? "" : " WHERE rowid > ?"} ORDER BY rowid LIMIT ${PAGE}`,
      after === null ? [] : [after]
    );
    cols ??= page.cols.slice(1);
    for (const row of page.rows) rows.push(row.slice(1));
    if (page.rows.length < PAGE) break;
    after = page.rows[page.rows.length - 1][0];
  }
  return { cols, rows };
}

async function exportTurso(file) {
  const schema = await turso(
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_%' ESCAPE '\\' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name"
  );
  const db = new DatabaseSync(file, { enableForeignKeyConstraints: false });
  try {
    const counts = {};
    db.exec("BEGIN");
    for (const [, , sql] of schema.rows) db.exec(sql);
    for (const [type, name] of schema.rows) {
      if (type !== "table") continue;
      const { cols, rows } = await readTable(name);
      counts[name] = rows.length;
      if (rows.length === 0) continue;
      const insert = db.prepare(
        `INSERT INTO ${quote(name)} (${cols.map(quote).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`
      );
      for (const row of rows) insert.run(...row);
    }
    db.exec("COMMIT");
    const check = db.prepare("PRAGMA integrity_check").get();
    if (Object.values(check)[0] !== "ok") throw new Error("exported backup failed the integrity check");
    const orphans = db.prepare("PRAGMA foreign_key_check").all().length;
    return { counts, orphans };
  } finally {
    db.close();
  }
}

async function googleToken() {
  const res = await retry("google token", async () => {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env("GDRIVE_CLIENT_ID"),
        client_secret: env("GDRIVE_CLIENT_SECRET"),
        refresh_token: env("GDRIVE_REFRESH_TOKEN"),
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
  return res.access_token;
}

async function drive(token, path, init = {}) {
  return retry("drive", async () => {
    const r = await fetch(path.startsWith("http") ? path : `${DRIVE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(120000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.status === 204 ? null : r.json();
  });
}

async function folder(token, name, parent) {
  const q = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    parent ? `'${parent}' in parents` : null,
  ]
    .filter(Boolean)
    .join(" and ");
  const found = await drive(token, `/files?${new URLSearchParams({ q, fields: "files(id)", pageSize: "10" })}`);
  if (found.files.length > 0) return found.files[0].id;
  const created = await drive(token, "/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", ...(parent ? { parents: [parent] } : {}) }),
  });
  return created.id;
}

async function upload(token, parent, name, bytes) {
  const boundary = `polaris${Date.now()}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parent] })}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--`);
  return drive(token, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size", {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body: Buffer.concat([head, bytes, tail]),
  });
}

async function prune(token, parent) {
  const listed = await drive(
    token,
    `/files?${new URLSearchParams({ q: `'${parent}' in parents and trashed = false`, fields: "files(id,createdTime)", orderBy: "createdTime desc", pageSize: "1000" })}`
  );
  const old = listed.files.slice(KEEP);
  for (const file of old) await drive(token, `/files/${file.id}`, { method: "DELETE" });
  return { kept: Math.min(listed.files.length, KEEP), removed: old.length };
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "polaris-backup-"));
  const stamp = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  const file = join(dir, `turso_backup_${stamp}.db`);
  try {
    const { counts, orphans } = await exportTurso(file);
    const bytes = readFileSync(file);
    const token = await googleToken();
    const root = await folder(token, ROOT_FOLDER, null);
    const target = await folder(token, SERVER_FOLDER, root);
    const uploaded = await upload(token, target, `turso_backup_${stamp}.db`, bytes);
    const kept = await prune(token, target);
    console.log(`backup ${uploaded.name}: ${Math.round(statSync(file).size / 1024)} KB`);
    console.log(`rows ${JSON.stringify(counts)}`);
    console.log(`rows pointing at deleted parents: ${orphans}`);
    console.log(`server backups kept ${kept.kept}, removed ${kept.removed}`);
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
