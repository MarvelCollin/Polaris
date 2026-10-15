import { Database } from "tauri-plugin-libsql-api";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";

export type ConnectionMode = "online" | "offline" | "local";

export interface FailedOp {
  name: string;
  error: string;
}

export interface ConnectionStatus {
  mode: ConnectionMode;
  pending: number;
  failed: FailedOp[];
}

interface TursoConfig {
  url: string;
  token: string;
}

interface OpContext {
  at: number;
  kept: Record<string, unknown>;
  replay: boolean;
  tx: boolean;
  pinned?: Database | null;
}

interface OutboxRow {
  seq: number;
  id: string;
  name: string;
  args: string;
  kept: string | null;
  result: string | null;
  remote_result: string | null;
  status: number;
  dibuat_pada: number;
}

type AnyOp = (...args: any[]) => Promise<any>;

export const OFFLINE_ID_BASE = 9_000_000_000_000;
export const REMOTE_TIMEOUT_MS = 15000;
export const RECONNECT_INTERVAL_MS = 30000;
export const SYNC_DELAY_MS = 2000;
export const SYNC_MAX_DELAY_MS = 10000;
export const ONLINE_ONLY_MESSAGE = "Fitur ini butuh koneksi internet. Coba lagi saat sudah online.";

const PENDING = 0;
const APPLIED = 1;
const FAILED = 2;
const UNDEFINED = "__polaris_undefined__";
const APPLIED_OPS_RETENTION_DAYS = 90;

const OUTBOX_TABLE =
  "CREATE TABLE IF NOT EXISTS _outbox (seq INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, args TEXT NOT NULL, kept TEXT, result TEXT, remote_result TEXT, status INTEGER NOT NULL DEFAULT 0, error TEXT, dibuat_pada INTEGER NOT NULL)";
const APPLIED_OPS_TABLE =
  "CREATE TABLE IF NOT EXISTS _applied_ops (id TEXT PRIMARY KEY, result TEXT, dibuat_pada INTEGER NOT NULL DEFAULT (strftime('%s', 'now')))";

let backend: Database | null = null;
let remote: Database | null = null;
let offline: Database | null = null;
let config: TursoConfig | null = null;
let mode: ConnectionMode = "local";
let replaying = false;
let context: OpContext | null = null;
let dbPromise: Promise<Database> | null = null;
let dbFile: string | null = null;
let switching: Promise<void> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let opQueue: Promise<unknown> = Promise.resolve();
const FAILED_KEY = "polaris:failed-ops";

function savedFailures(): FailedOp[] {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(FAILED_KEY);
    return raw ? (JSON.parse(raw) as FailedOp[]) : [];
  } catch (_) {
    return [];
  }
}

let status: ConnectionStatus = { mode: "local", pending: 0, failed: savedFailures() };
const listeners = new Set<(status: ConnectionStatus) => void>();
const registry = new Map<string, AnyOp>();

export async function databasePath(): Promise<string> {
  if (!dbFile) dbFile = `sqlite:${await join(await appDataDir(), "polaris.db")}`;
  return dbFile;
}

export function connectionStatus(): ConnectionStatus {
  return status;
}

export function onConnectionChange(listener: (status: ConnectionStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next: Partial<ConnectionStatus>) {
  status = { ...status, ...next };
  if (next.failed) {
    try {
      if (next.failed.length > 0) localStorage.setItem(FAILED_KEY, JSON.stringify(next.failed));
      else localStorage.removeItem(FAILED_KEY);
    } catch (_) {}
  }
  for (const listener of listeners) listener(status);
}

export function dismissFailedOps() {
  publish({ failed: [] });
}

async function tune(database: Database): Promise<Database> {
  try { await database.execute("PRAGMA journal_mode = WAL"); } catch (_) {}
  try { await database.execute("PRAGMA synchronous = NORMAL"); } catch (_) {}
  try { await database.execute("PRAGMA cache_size = -8000"); } catch (_) {}
  try { await database.execute("PRAGMA temp_store = MEMORY"); } catch (_) {}
  try { await database.execute("PRAGMA foreign_keys = ON"); } catch (_) {}
  return database;
}

async function tursoConfig(): Promise<TursoConfig | null> {
  try {
    const value = await invoke<TursoConfig | null>("get_turso_config");
    return value?.url && value?.token ? value : null;
  } catch (_) {
    return null;
  }
}

async function tursoReachable(): Promise<boolean> {
  try {
    return (await invoke<boolean>("turso_reachable")) === true;
  } catch (_) {
    return false;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Koneksi ke server terlalu lama")), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

async function closeQuietly(database: Database | null) {
  if (!database) return;
  try { await database.close(database.path); } catch (_) {}
}

function encode(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (v === undefined ? UNDEFINED : v));
}

function decode(text: string | null): any {
  if (text == null) return undefined;
  return JSON.parse(text, (_key, v) => (v === UNDEFINED ? undefined : v));
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function opId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

async function connectRemote(settings: TursoConfig): Promise<Database | null> {
  if (!(await tursoReachable())) return null;
  let database: Database | null = null;
  try {
    database = await Database.load({ path: settings.url, authToken: settings.token });
    await withTimeout(database.select("SELECT 1"), REMOTE_TIMEOUT_MS);
    await withTimeout(database.execute(APPLIED_OPS_TABLE), REMOTE_TIMEOUT_MS);
    return database;
  } catch (_) {
    await closeQuietly(database);
    return null;
  }
}

async function openOffline(): Promise<Database> {
  const file = await invoke<string>("prepare_offline_db");
  const database = await tune(await Database.load(`sqlite:${file}`));
  await database.batch([
    OUTBOX_TABLE,
    `UPDATE sqlite_sequence SET seq = ${OFFLINE_ID_BASE} WHERE seq < ${OFFLINE_ID_BASE}`,
    `INSERT INTO sqlite_sequence (name, seq) SELECT name, ${OFFLINE_ID_BASE} FROM sqlite_master WHERE type = 'table' AND sql LIKE '%AUTOINCREMENT%' AND name NOT IN (SELECT name FROM sqlite_sequence)`,
  ]);
  return database;
}

async function countPending(database: Database): Promise<number> {
  const rows = await database.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM _outbox WHERE status = $1",
    [PENDING]
  );
  return Number(rows[0]?.count ?? 0);
}

async function connectionLost(): Promise<boolean> {
  return mode !== "online" || !(await tursoReachable());
}

async function route<T>(work: (database: Database) => Promise<T>, timeout = REMOTE_TIMEOUT_MS): Promise<T> {
  const database = context?.pinned ?? backend;
  if (!database) throw new Error("Database belum siap");
  if (database !== remote || replaying) return work(database);
  try {
    return await withTimeout(work(database), timeout);
  } catch (e) {
    if (context?.tx || !(await connectionLost())) throw e;
    await goOffline();
    return work(backend!);
  }
}

const router = {
  get path() {
    return backend?.path ?? "";
  },
  execute: (...args: [string, unknown[]?]) => route((database) => database.execute(...args)),
  select: <T>(...args: [string, unknown[]?]) => route((database) => database.select<T>(...args)),
  batch: (queries: string[]) =>
    route(async (database) => {
      if (!context?.tx) return database.batch(queries);
      for (const query of queries) await database.execute(query);
    }, REMOTE_TIMEOUT_MS * 4),
  sync: async () => {
    if (mode === "online") await invoke("mirror_sync");
  },
  close: async () => true,
} as unknown as Database;

function goOffline(): Promise<void> {
  if (mode === "offline") return Promise.resolve();
  switching ??= (async () => {
    offline ??= await openOffline();
    const stale = remote;
    remote = null;
    backend = offline;
    mode = "offline";
    cancelSync();
    publish({ mode, pending: await countPending(offline) });
    await closeQuietly(stale);
    scheduleReconnect();
  })().finally(() => {
    switching = null;
  });
  return switching;
}

function learn(ids: Map<number, number>, local: unknown, remoteValue: unknown) {
  if (typeof local === "number" && local >= OFFLINE_ID_BASE && typeof remoteValue === "number") {
    ids.set(local, remoteValue);
  }
}

function remap(value: unknown, ids: Map<number, number>): any {
  if (typeof value === "number" && value >= OFFLINE_ID_BASE) {
    const mapped = ids.get(value);
    if (mapped === undefined) throw new Error("Data offline yang dirujuk gagal dikirim lebih dulu");
    return mapped;
  }
  if (Array.isArray(value)) return value.map((item) => remap(item, ids));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remap(item, ids)]));
  }
  return value;
}

async function within<T>(next: OpContext, work: () => Promise<T>): Promise<T> {
  context = next;
  try {
    return await work();
  } finally {
    context = null;
  }
}

function applyRemote<R>(id: string, work: () => Promise<R>, next: OpContext): Promise<R> {
  return within(next, () =>
    withTransaction(async (tx) => {
      const result = await work();
      await tx.execute("INSERT INTO _applied_ops (id, result, dibuat_pada) VALUES ($1, $2, $3)", [id, encode(result), nowSeconds()]);
      return result;
    })
  );
}

async function applyOffline<R>(id: string, name: string, args: unknown[], work: () => Promise<R>, at: number): Promise<R> {
  const next: OpContext = { at, kept: {}, replay: false, tx: false };
  const result = await within(next, () =>
    withTransaction(async (tx) => {
      const value = await work();
      await tx.execute(
        "INSERT INTO _outbox (id, name, args, kept, result, status, dibuat_pada) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [id, name, encode(args), encode(next.kept), encode(value), PENDING, at]
      );
      return value;
    })
  );
  publish({ pending: status.pending + 1 });
  return result;
}

async function replay(local: Database, target: Database): Promise<FailedOp[]> {
  await import("./db/writes");
  const rows = await local.select<OutboxRow[]>("SELECT * FROM _outbox ORDER BY seq");
  const ids = new Map<number, number>();
  const failed: FailedOp[] = [];
  backend = target;
  replaying = true;
  try {
    for (const row of rows) {
      if (row.status === APPLIED) {
        learn(ids, decode(row.result), decode(row.remote_result));
        continue;
      }
      if (row.status === FAILED) continue;
      let remoteResult: unknown;
      try {
        const done = await target.select<{ result: string | null }[]>("SELECT result FROM _applied_ops WHERE id = $1", [row.id]);
        if (done.length > 0) {
          remoteResult = decode(done[0].result);
        } else {
          const work = registry.get(row.name);
          if (!work) throw new Error(`Jenis transaksi tidak dikenal: ${row.name}`);
          const args = remap(decode(row.args), ids) as unknown[];
          const kept = (decode(row.kept) ?? {}) as Record<string, unknown>;
          remoteResult = await applyRemote(row.id, () => work(...args), { at: row.dibuat_pada, kept, replay: true, tx: false });
        }
      } catch (e) {
        if (!(await tursoReachable())) throw e;
        await local.execute("UPDATE _outbox SET status = $1, error = $2 WHERE seq = $3", [FAILED, message(e), row.seq]);
        failed.push({ name: row.name, error: message(e) });
        continue;
      }
      learn(ids, decode(row.result), remoteResult);
      await local.execute("UPDATE _outbox SET status = $1, remote_result = $2 WHERE seq = $3", [APPLIED, encode(remoteResult), row.seq]);
    }
  } finally {
    replaying = false;
  }
  return failed;
}

async function enterOnline(target: Database) {
  if (await invoke<boolean>("offline_db_exists")) {
    offline ??= await openOffline();
    try {
      const failed = await replay(offline, target);
      if (failed.length > 0) publish({ failed: [...status.failed, ...failed] });
    } catch (e) {
      backend = offline;
      throw e;
    }
    const done = offline;
    offline = null;
    await closeQuietly(done);
    await invoke("discard_offline_db").catch(() => {});
  }
  remote = target;
  backend = target;
  mode = "online";
  publish({ mode, pending: 0 });
  target
    .execute("DELETE FROM _applied_ops WHERE dibuat_pada < $1", [nowSeconds() - APPLIED_OPS_RETENTION_DAYS * 86400])
    .catch(() => {});
  syncDb();
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void reconnect();
  }, RECONNECT_INTERVAL_MS);
}

export function reconnect(): Promise<boolean> {
  if (mode !== "offline" || !config) return Promise.resolve(mode === "online");
  const settings = config;
  const attempt = exclusive(async () => {
    if (mode !== "offline") return mode === "online";
    const target = await connectRemote(settings);
    if (!target) return false;
    try {
      await enterOnline(target);
      return true;
    } catch (_) {
      await closeQuietly(target);
      return false;
    }
  });
  return attempt.then((ok) => {
    if (!ok) scheduleReconnect();
    return ok;
  });
}

async function openDb(): Promise<Database> {
  config = await tursoConfig();
  if (!config) {
    backend = await tune(await Database.load(await databasePath()));
    mode = "local";
    publish({ mode });
    return router;
  }
  const target = await connectRemote(config);
  if (target) {
    try {
      await enterOnline(target);
      return router;
    } catch (_) {
      await closeQuietly(target);
    }
  }
  offline ??= await openOffline();
  backend = offline;
  mode = "offline";
  publish({ mode, pending: await countPending(offline) });
  scheduleReconnect();
  return router;
}

export function getDb(): Promise<Database> {
  if (replaying) return Promise.resolve(router);
  if (!dbPromise) {
    dbPromise = openDb().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const run = opQueue.then(work);
  opQueue = run.catch(() => {});
  return run;
}

export function op<A extends unknown[], R>(name: string, work: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  registry.set(name, work as AnyOp);
  return async (...args: A) => {
    await getDb();
    if (mode === "local") return work(...args);
    return exclusive(async () => {
      if (switching) await switching.catch(() => {});
      const id = opId();
      const at = nowSeconds();
      if (mode === "online") {
        try {
          return await applyRemote(id, () => work(...args), { at, kept: {}, replay: false, tx: false });
        } catch (e) {
          if (!(await connectionLost())) throw e;
          await goOffline();
        }
      }
      return applyOffline(id, name, args, () => work(...args), at);
    });
  };
}

export function opTime(): number {
  return context?.at ?? nowSeconds();
}

export async function keep<T>(key: string, compute: () => Promise<T>, usable?: (value: T) => Promise<boolean>): Promise<T> {
  const hint = context?.replay ? (context.kept[key] as T | undefined) : undefined;
  const value = hint !== undefined && (!usable || (await usable(hint))) ? hint : await compute();
  if (context) context.kept[key] = value;
  return value;
}

export function requireOnline() {
  if (mode === "offline") throw new Error(ONLINE_ONLY_MESSAGE);
}

let transactionQueue: Promise<unknown> = Promise.resolve();

export function withTransaction<T>(work: (tx: Database) => Promise<T>): Promise<T> {
  if (context?.tx) return work(router);
  const owner = context;
  const run = transactionQueue.then(async () => {
    const database = await getDb();
    if (owner) owner.pinned = backend;
    try {
      await database.execute("BEGIN IMMEDIATE");
    } catch (e) {
      if (owner) owner.pinned = null;
      throw e;
    }
    if (owner) owner.tx = true;
    try {
      const result = await work(database);
      await database.execute("COMMIT");
      return result;
    } catch (e) {
      await database.execute("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      if (owner) {
        owner.tx = false;
        owner.pinned = null;
      }
    }
  });
  transactionQueue = run.catch(() => {});
  return run;
}

export async function connectTurso(): Promise<void> {
  await getDb();
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncDeadline = 0;

function cancelSync() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = null;
  syncDeadline = 0;
}

function runSync() {
  syncTimer = null;
  syncDeadline = 0;
  if (mode === "online") invoke("mirror_sync").catch(() => {});
}

export function syncDb() {
  if (mode !== "online") return;
  const now = Date.now();
  if (!syncDeadline) syncDeadline = now + SYNC_MAX_DELAY_MS;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, Math.max(0, Math.min(SYNC_DELAY_MS, syncDeadline - now)));
}

export const SCHEMA_VERSION = 1;

const SCHEMA_KEY = "schema_version";

async function readSchemaVersion(database: Database): Promise<number> {
  try {
    const rows = await database.select<{ value: string }[]>(
      "SELECT value FROM settings WHERE key = $1",
      [SCHEMA_KEY]
    );
    return Number(rows[0]?.value ?? 0);
  } catch (_) {
    return 0;
  }
}

async function stampSchemaVersion(database: Database): Promise<void> {
  try {
    await database.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)", [
      SCHEMA_KEY,
      String(SCHEMA_VERSION),
    ]);
  } catch (_) {}
}

export async function initDb() {
  const database = await getDb();

  if ((await readSchemaVersion(database)) === SCHEMA_VERSION) return;

  await database.batch([
    "CREATE TABLE IF NOT EXISTS kategori (id INTEGER PRIMARY KEY AUTOINCREMENT, nama TEXT NOT NULL UNIQUE, dibuat_pada INTEGER NOT NULL DEFAULT (strftime('%s', 'now')))",
    "CREATE TABLE IF NOT EXISTS produk (id INTEGER PRIMARY KEY AUTOINCREMENT, kode TEXT NOT NULL UNIQUE, nama TEXT NOT NULL, kategori_id INTEGER NOT NULL, satuan TEXT NOT NULL, harga_beli REAL NOT NULL, harga_jual REAL NOT NULL, stok REAL NOT NULL DEFAULT 0, stok_minimum REAL NOT NULL DEFAULT 0, gambar TEXT, dibuat_pada INTEGER NOT NULL DEFAULT (strftime('%s', 'now')), diperbarui_pada INTEGER NOT NULL DEFAULT (strftime('%s', 'now')), FOREIGN KEY (kategori_id) REFERENCES kategori(id))",
    "CREATE TABLE IF NOT EXISTS penjualan (id INTEGER PRIMARY KEY AUTOINCREMENT, nomor_faktur TEXT NOT NULL UNIQUE, total REAL NOT NULL, dibayar REAL NOT NULL, kembalian REAL NOT NULL, pelanggan_id INTEGER REFERENCES pelanggan(id), nama_pelanggan TEXT, diskon REAL NOT NULL DEFAULT 0, alamat_pengiriman TEXT, dibuat_pada INTEGER NOT NULL DEFAULT (strftime('%s', 'now')))",
    "CREATE TABLE IF NOT EXISTS item_penjualan (id INTEGER PRIMARY KEY AUTOINCREMENT, penjualan_id INTEGER NOT NULL, produk_id INTEGER NOT NULL, nama_produk TEXT NOT NULL, jumlah REAL NOT NULL, harga_satuan REAL NOT NULL, subtotal REAL NOT NULL, hpp REAL NOT NULL DEFAULT 0, FOREIGN KEY (penjualan_id) REFERENCES penjualan(id), FOREIGN KEY (produk_id) REFERENCES produk(id))",
    "CREATE TABLE IF NOT EXISTS pembelian (id INTEGER PRIMARY KEY AUTOINCREMENT, supplier TEXT NOT NULL, referensi_faktur TEXT, total REAL NOT NULL, dibayar REAL NOT NULL DEFAULT 0, dibuat_pada INTEGER NOT NULL DEFAULT (strftime('%s', 'now')))",
    "CREATE TABLE IF NOT EXISTS item_pembelian (id INTEGER PRIMARY KEY AUTOINCREMENT, pembelian_id INTEGER NOT NULL, produk_id INTEGER NOT NULL, nama_produk TEXT NOT NULL, jumlah REAL NOT NULL, harga_satuan REAL NOT NULL, subtotal REAL NOT NULL, FOREIGN KEY (pembelian_id) REFERENCES pembelian(id), FOREIGN KEY (produk_id) REFERENCES produk(id))",
    "CREATE TABLE IF NOT EXISTS pelanggan (id INTEGER PRIMARY KEY AUTOINCREMENT, nama TEXT NOT NULL, telepon TEXT, alamat TEXT, dibuat_pada INTEGER NOT NULL DEFAULT (strftime('%s', 'now')))",
    "CREATE TABLE IF NOT EXISTS harga_pelanggan (id INTEGER PRIMARY KEY AUTOINCREMENT, pelanggan_id INTEGER NOT NULL, produk_id INTEGER NOT NULL, harga REAL NOT NULL, FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id) ON DELETE CASCADE, FOREIGN KEY (produk_id) REFERENCES produk(id) ON DELETE CASCADE, UNIQUE(pelanggan_id, produk_id))",
    "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS pembayaran_pembelian (id INTEGER PRIMARY KEY AUTOINCREMENT, pembelian_id INTEGER NOT NULL, jumlah REAL NOT NULL, catatan TEXT, dibuat_pada INTEGER NOT NULL DEFAULT (strftime('%s', 'now')), FOREIGN KEY (pembelian_id) REFERENCES pembelian(id))",
    "CREATE TABLE IF NOT EXISTS pembayaran_penjualan (id INTEGER PRIMARY KEY AUTOINCREMENT, penjualan_id INTEGER NOT NULL, jumlah REAL NOT NULL, catatan TEXT, dibuat_pada INTEGER NOT NULL DEFAULT (strftime('%s', 'now')), FOREIGN KEY (penjualan_id) REFERENCES penjualan(id))",
    "CREATE TABLE IF NOT EXISTS retur_penjualan (id INTEGER PRIMARY KEY AUTOINCREMENT, penjualan_id INTEGER NOT NULL, total REAL NOT NULL, alasan TEXT, dibuat_pada INTEGER NOT NULL DEFAULT (strftime('%s', 'now')), FOREIGN KEY (penjualan_id) REFERENCES penjualan(id))",
    "CREATE TABLE IF NOT EXISTS item_retur_penjualan (id INTEGER PRIMARY KEY AUTOINCREMENT, retur_id INTEGER NOT NULL, produk_id INTEGER NOT NULL, nama_produk TEXT NOT NULL, jumlah REAL NOT NULL, harga_satuan REAL NOT NULL, subtotal REAL NOT NULL, FOREIGN KEY (retur_id) REFERENCES retur_penjualan(id), FOREIGN KEY (produk_id) REFERENCES produk(id))",
    "CREATE TABLE IF NOT EXISTS retur_pembelian (id INTEGER PRIMARY KEY AUTOINCREMENT, pembelian_id INTEGER NOT NULL, total REAL NOT NULL, alasan TEXT, dibuat_pada INTEGER NOT NULL DEFAULT (strftime('%s', 'now')), FOREIGN KEY (pembelian_id) REFERENCES pembelian(id))",
    "CREATE TABLE IF NOT EXISTS item_retur_pembelian (id INTEGER PRIMARY KEY AUTOINCREMENT, retur_id INTEGER NOT NULL, produk_id INTEGER NOT NULL, nama_produk TEXT NOT NULL, jumlah REAL NOT NULL, harga_satuan REAL NOT NULL, subtotal REAL NOT NULL, FOREIGN KEY (retur_id) REFERENCES retur_pembelian(id), FOREIGN KEY (produk_id) REFERENCES produk(id))",
    "CREATE TABLE IF NOT EXISTS alamat_pelanggan (id INTEGER PRIMARY KEY AUTOINCREMENT, pelanggan_id INTEGER NOT NULL, label TEXT NOT NULL, alamat TEXT NOT NULL, FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id) ON DELETE CASCADE)",
    "CREATE INDEX IF NOT EXISTS idx_pembayaran_pembelian ON pembayaran_pembelian(pembelian_id)",
    "CREATE INDEX IF NOT EXISTS idx_pembayaran_penjualan ON pembayaran_penjualan(penjualan_id)",
    "CREATE INDEX IF NOT EXISTS idx_produk_kategori ON produk(kategori_id)",
    "CREATE INDEX IF NOT EXISTS idx_produk_kode ON produk(kode)",
    "CREATE INDEX IF NOT EXISTS idx_produk_nama ON produk(nama)",
    "CREATE INDEX IF NOT EXISTS idx_item_penjualan_penjualan ON item_penjualan(penjualan_id)",
    "CREATE INDEX IF NOT EXISTS idx_item_penjualan_produk ON item_penjualan(produk_id)",
    "CREATE INDEX IF NOT EXISTS idx_item_pembelian_pembelian ON item_pembelian(pembelian_id)",
    "CREATE INDEX IF NOT EXISTS idx_item_pembelian_produk ON item_pembelian(produk_id)",
    "CREATE INDEX IF NOT EXISTS idx_penjualan_dibuat ON penjualan(dibuat_pada)",
    "CREATE INDEX IF NOT EXISTS idx_penjualan_faktur ON penjualan(nomor_faktur)",
    "CREATE INDEX IF NOT EXISTS idx_pembelian_dibuat ON pembelian(dibuat_pada)",
    "CREATE INDEX IF NOT EXISTS idx_harga_pelanggan_pelanggan ON harga_pelanggan(pelanggan_id)",
    "CREATE INDEX IF NOT EXISTS idx_harga_pelanggan_produk ON harga_pelanggan(produk_id)",
    "CREATE INDEX IF NOT EXISTS idx_penjualan_pelanggan ON penjualan(pelanggan_id)",
    "CREATE INDEX IF NOT EXISTS idx_retur_penjualan ON retur_penjualan(penjualan_id)",
    "CREATE INDEX IF NOT EXISTS idx_retur_pembelian ON retur_pembelian(pembelian_id)",
    "CREATE INDEX IF NOT EXISTS idx_item_retur_penjualan_retur ON item_retur_penjualan(retur_id)",
    "CREATE INDEX IF NOT EXISTS idx_item_retur_pembelian_retur ON item_retur_pembelian(retur_id)",
    "CREATE INDEX IF NOT EXISTS idx_item_retur_penjualan_produk ON item_retur_penjualan(produk_id)",
    "CREATE INDEX IF NOT EXISTS idx_item_retur_pembelian_produk ON item_retur_pembelian(produk_id)",
    "CREATE INDEX IF NOT EXISTS idx_pembelian_supplier ON pembelian(supplier)",
    "CREATE INDEX IF NOT EXISTS idx_produk_stok ON produk(stok, stok_minimum)",
    "CREATE INDEX IF NOT EXISTS idx_alamat_pelanggan ON alamat_pelanggan(pelanggan_id)",
    "CREATE INDEX IF NOT EXISTS idx_pelanggan_nama ON pelanggan(nama)",
    "CREATE INDEX IF NOT EXISTS idx_pembelian_faktur ON pembelian(referensi_faktur)",
  ]);

  const [pembelianCols, penjualanCols, produkCols, itemPenjualanCols] = await Promise.all([
    database.select("PRAGMA table_info(pembelian)") as Promise<{ name: string }[]>,
    database.select("PRAGMA table_info(penjualan)") as Promise<{ name: string }[]>,
    database.select("PRAGMA table_info(produk)") as Promise<{ name: string }[]>,
    database.select("PRAGMA table_info(item_penjualan)") as Promise<{ name: string }[]>,
  ]);

  const pembelianSet = new Set(pembelianCols.map(c => c.name));
  const penjualanSet = new Set(penjualanCols.map(c => c.name));
  const produkSet = new Set(produkCols.map(c => c.name));
  const itemPenjualanSet = new Set(itemPenjualanCols.map(c => c.name));

  if (!produkSet.has("gambar")) await database.execute("ALTER TABLE produk ADD COLUMN gambar TEXT");
  if (!penjualanSet.has("pelanggan_id")) await database.execute("ALTER TABLE penjualan ADD COLUMN pelanggan_id INTEGER REFERENCES pelanggan(id)");
  if (!penjualanSet.has("nama_pelanggan")) await database.execute("ALTER TABLE penjualan ADD COLUMN nama_pelanggan TEXT");
  if (!pembelianSet.has("dibayar")) {
    await database.execute("ALTER TABLE pembelian ADD COLUMN dibayar REAL NOT NULL DEFAULT 0");
    await database.execute("UPDATE pembelian SET dibayar = total WHERE dibayar = 0 AND total > 0");
  }
  if (!penjualanSet.has("diskon")) await database.execute("ALTER TABLE penjualan ADD COLUMN diskon REAL NOT NULL DEFAULT 0");
  if (!itemPenjualanSet.has("hpp")) await database.execute("ALTER TABLE item_penjualan ADD COLUMN hpp REAL NOT NULL DEFAULT 0");
  if (!penjualanSet.has("alamat_pengiriman")) await database.execute("ALTER TABLE penjualan ADD COLUMN alamat_pengiriman TEXT");

  await stampSchemaVersion(database);
}

export async function resetTransactionData() {
  await clearTransactions();
  cancelSync();
  if (mode === "online") await invoke("mirror_sync").catch(() => {});
}

const clearTransactions = op("resetTransactionData", async () => {
  requireOnline();
  const database = await getDb();
  await database.batch([
    "DELETE FROM item_retur_penjualan",
    "DELETE FROM item_retur_pembelian",
    "DELETE FROM retur_penjualan",
    "DELETE FROM retur_pembelian",
    "DELETE FROM pembayaran_penjualan",
    "DELETE FROM pembayaran_pembelian",
    "DELETE FROM item_penjualan",
    "DELETE FROM item_pembelian",
    "DELETE FROM penjualan",
    "DELETE FROM pembelian",
  ]);
});
