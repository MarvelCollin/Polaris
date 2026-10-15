import { Database } from "tauri-plugin-libsql-api";
import { invoke } from "@tauri-apps/api/core";

export type ConnectionMode = "online" | "offline";

export interface FailedOp {
  name: string;
  error: string;
}

export interface ConnectionStatus {
  mode: ConnectionMode;
  pending: number;
  failed: FailedOp[];
}

export interface QueuedOp {
  id: string;
  name: string;
  args: string;
  kept: string;
  at: number;
  result: number;
  remoteResult?: unknown;
  status: "pending" | "applied" | "failed";
  error?: string;
}

interface Outbox {
  nextTempId: number;
  ops: QueuedOp[];
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

interface CacheEntry {
  sql: string;
  rows: unknown[];
  at: number;
}

interface OpOptions<A extends unknown[]> {
  offline?: (args: A, kept: Record<string, unknown>, tempId: number, at: number) => void;
  onlineOnly?: boolean;
}

type AnyOp = (...args: any[]) => Promise<any>;

export const OFFLINE_ID_BASE = 9_000_000_000_000;
export const REMOTE_TIMEOUT_MS = 15000;
export const RECONNECT_INTERVAL_MS = 30000;
export const CACHE_FRESH_MS = 20000;
export const CACHE_MAX_ENTRIES = 400;
export const CACHE_SAVE_DELAY_MS = 5000;
export const ONLINE_ONLY_MESSAGE = "Fitur ini butuh koneksi internet. Coba lagi saat sudah online.";
export const NOT_CACHED_MESSAGE = "Sedang offline dan data ini belum pernah dibuka sebelumnya. Coba lagi saat sudah online.";
export const NOT_CONFIGURED_MESSAGE = "Koneksi server belum diatur. Hubungi admin aplikasi.";

const UNDEFINED = "__polaris_undefined__";
const APPLIED_OPS_RETENTION_DAYS = 90;
const FAILED_KEY = "polaris:failed-ops";
const APPLIED_OPS_TABLE =
  "CREATE TABLE IF NOT EXISTS _applied_ops (id TEXT PRIMARY KEY, result TEXT, dibuat_pada INTEGER NOT NULL DEFAULT (strftime('%s', 'now')))";

let remote: Database | null = null;
let config: TursoConfig | null = null;
let mode: ConnectionMode = "offline";
let replaying = false;
let context: OpContext | null = null;
let dbPromise: Promise<Database> | null = null;
let switching: Promise<void> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let opQueue: Promise<unknown> = Promise.resolve();
let outbox: Outbox = { nextTempId: OFFLINE_ID_BASE + 1, ops: [] };
let outboxWrite: Promise<unknown> = Promise.resolve();
const cache = new Map<string, CacheEntry>();
let cacheTimer: ReturnType<typeof setTimeout> | null = null;
let touched = new Set<string>();
const listeners = new Set<(status: ConnectionStatus) => void>();
const registry = new Map<string, AnyOp>();
const offlineHooks = new Map<string, OpOptions<any>>();

function savedFailures(): FailedOp[] {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(FAILED_KEY);
    return raw ? (JSON.parse(raw) as FailedOp[]) : [];
  } catch (_) {
    return [];
  }
}

let status: ConnectionStatus = { mode: "offline", pending: 0, failed: savedFailures() };

export function connectionStatus(): ConnectionStatus {
  return status;
}

export function isOffline(): boolean {
  return mode === "offline";
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

function pendingCount(): number {
  return outbox.ops.filter((entry) => entry.status === "pending").length;
}

export function dismissFailedOps() {
  publish({ failed: [] });
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

async function readStore<T>(name: string): Promise<T | null> {
  try {
    const raw = await invoke<string | null>("app_store_read", { name });
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (_) {
    return null;
  }
}

function writeStore(name: string, value: unknown): Promise<void> {
  return invoke<void>("app_store_write", { name, content: JSON.stringify(value) });
}

function saveOutbox(): Promise<void> {
  const snapshot = JSON.parse(JSON.stringify(outbox)) as Outbox;
  const run = outboxWrite.then(() => writeStore("outbox", snapshot));
  outboxWrite = run.catch(() => {});
  return run;
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

function decode(text: string | null | undefined): any {
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

function cacheKey(sql: string, params?: unknown[]): string {
  return `${sql}\u0000${JSON.stringify(params ?? [])}`;
}

function cloneRows<T>(rows: unknown[]): T {
  return rows.map((row) => (row && typeof row === "object" ? { ...(row as object) } : row)) as T;
}

function isRead(sql: string): boolean {
  return /^\s*(SELECT|WITH)\b/i.test(sql);
}

function writtenTables(sql: string): string[] {
  const names = new Set<string>();
  for (const match of sql.matchAll(/\b(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO|ALTER\s+TABLE|CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|DROP\s+TABLE(?:\s+IF\s+EXISTS)?)\s+["`]?(\w+)/gi)) {
    names.add(match[1].toLowerCase());
  }
  return [...names];
}

function scheduleCacheSave() {
  if (cacheTimer) return;
  cacheTimer = setTimeout(() => {
    cacheTimer = null;
    writeStore("cache", [...cache.entries()]).catch(() => {});
  }, CACHE_SAVE_DELAY_MS);
}

function remember(key: string, sql: string, rows: unknown[]) {
  cache.delete(key);
  cache.set(key, { sql, rows, at: Date.now() });
  while (cache.size > CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  scheduleCacheSave();
}

function invalidate(tables: Iterable<string>) {
  const patterns = [...tables].map((table) => new RegExp(`\\b${table}\\b`, "i"));
  if (patterns.length === 0) return;
  let changed = false;
  for (const [key, entry] of cache) {
    if (patterns.some((pattern) => pattern.test(entry.sql))) {
      cache.delete(key);
      changed = true;
    }
  }
  if (changed) scheduleCacheSave();
}

export function clearCache() {
  cache.clear();
  scheduleCacheSave();
}

async function loadCache() {
  const saved = await readStore<[string, CacheEntry][]>("cache");
  if (!Array.isArray(saved)) return;
  for (const [key, entry] of saved) {
    if (entry && typeof entry.sql === "string" && Array.isArray(entry.rows)) cache.set(key, entry);
  }
}

async function connectRemote(settings: TursoConfig): Promise<Database | null> {
  if (!(await tursoReachable())) return null;
  let database: Database | null = null;
  try {
    database = await Database.load({ path: settings.url, authToken: settings.token });
    await withTimeout(database.execute(APPLIED_OPS_TABLE), REMOTE_TIMEOUT_MS);
    return database;
  } catch (_) {
    await closeQuietly(database);
    return null;
  }
}

async function connectionLost(): Promise<boolean> {
  return mode !== "online" || !(await tursoReachable());
}

function target(): Database {
  const database = context?.pinned ?? remote;
  if (!database) throw new Error(ONLINE_ONLY_MESSAGE);
  return database;
}

async function read<T>(sql: string, params: unknown[] | undefined, work: (database: Database) => Promise<T>): Promise<T> {
  const cacheable = !context && !replaying && isRead(sql);
  const key = cacheKey(sql, params);
  const hit = cacheable ? cache.get(key) : undefined;
  if (mode === "offline" && !context) {
    if (hit) return cloneRows<T>(hit.rows);
    throw new Error(NOT_CACHED_MESSAGE);
  }
  if (hit && Date.now() - hit.at < CACHE_FRESH_MS) return cloneRows<T>(hit.rows);
  try {
    const rows = await withTimeout(work(target()), REMOTE_TIMEOUT_MS);
    if (cacheable && Array.isArray(rows)) remember(key, sql, cloneRows<unknown[]>(rows));
    return rows;
  } catch (e) {
    if (context?.tx || !(await connectionLost())) throw e;
    await goOffline();
    if (hit) return cloneRows<T>(hit.rows);
    throw new Error(NOT_CACHED_MESSAGE);
  }
}

async function write<T>(sql: string, work: (database: Database) => Promise<T>, timeout = REMOTE_TIMEOUT_MS): Promise<T> {
  const tables = writtenTables(sql);
  if (mode === "offline" && !context?.pinned && !replaying) throw new Error(ONLINE_ONLY_MESSAGE);
  try {
    const result = await withTimeout(work(target()), timeout);
    if (context?.tx) tables.forEach((table) => touched.add(table));
    invalidate(tables);
    return result;
  } catch (e) {
    if (!context?.tx && (await connectionLost())) {
      await goOffline();
      throw new Error(ONLINE_ONLY_MESSAGE);
    }
    throw e;
  }
}

const router = {
  get path() {
    return remote?.path ?? "";
  },
  execute: (...args: [string, unknown[]?]) => write(args[0], (database) => database.execute(...args)),
  select: <T>(...args: [string, unknown[]?]) => read<T>(args[0], args[1], (database) => database.select<T>(...args)),
  batch: async (queries: string[]) => {
    if (context?.tx) {
      for (const query of queries) await router.execute(query);
      return;
    }
    await write(queries.join(";\n"), (database) => database.batch(queries), REMOTE_TIMEOUT_MS * 4);
  },
  sync: async () => {},
  close: async () => true,
} as unknown as Database;

function goOffline(): Promise<void> {
  if (mode === "offline") return Promise.resolve();
  switching ??= (async () => {
    const stale = remote;
    remote = null;
    mode = "offline";
    publish({ mode, pending: pendingCount() });
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

async function enqueue(id: string, name: string, args: unknown[], at: number): Promise<number> {
  const options = offlineHooks.get(name);
  if (options?.onlineOnly) throw new Error(ONLINE_ONLY_MESSAGE);
  const tempId = outbox.nextTempId++;
  const kept: Record<string, unknown> = {};
  options?.offline?.(args, kept, tempId, at);
  outbox.ops.push({ id, name, args: encode(args), kept: encode(kept), at, result: tempId, status: "pending" });
  try {
    await saveOutbox();
  } catch (e) {
    outbox.ops.pop();
    throw new Error(`Gagal menyimpan transaksi offline: ${message(e)}`);
  }
  publish({ pending: pendingCount() });
  return tempId;
}

export function queuedOp(tempId: number): { name: string; args: any[]; kept: Record<string, unknown>; at: number } | null {
  const entry = outbox.ops.find((item) => item.result === tempId && item.status !== "failed");
  if (!entry) return null;
  return { name: entry.name, args: decode(entry.args) ?? [], kept: decode(entry.kept) ?? {}, at: entry.at };
}

async function replay(database: Database): Promise<FailedOp[]> {
  await import("./db/writes");
  const ids = new Map<number, number>();
  const failed: FailedOp[] = [];
  replaying = true;
  try {
    for (const entry of outbox.ops) {
      if (entry.status === "applied") {
        learn(ids, entry.result, entry.remoteResult);
        continue;
      }
      if (entry.status === "failed") continue;
      let remoteResult: unknown;
      try {
        const done = await withTimeout(
          database.select<{ result: string | null }[]>("SELECT result FROM _applied_ops WHERE id = $1", [entry.id]),
          REMOTE_TIMEOUT_MS
        );
        if (done.length > 0) {
          remoteResult = decode(done[0].result);
        } else {
          const work = registry.get(entry.name);
          if (!work) throw new Error(`Jenis transaksi tidak dikenal: ${entry.name}`);
          const args = remap(decode(entry.args), ids) as unknown[];
          const kept = (decode(entry.kept) ?? {}) as Record<string, unknown>;
          remoteResult = await applyRemote(entry.id, () => work(...args), { at: entry.at, kept, replay: true, tx: false });
        }
      } catch (e) {
        if (!(await tursoReachable())) throw e;
        entry.status = "failed";
        entry.error = message(e);
        failed.push({ name: entry.name, error: entry.error });
        await saveOutbox();
        continue;
      }
      learn(ids, entry.result, remoteResult);
      entry.status = "applied";
      entry.remoteResult = remoteResult;
      await saveOutbox();
    }
  } finally {
    replaying = false;
  }
  outbox.ops = [];
  await saveOutbox();
  return failed;
}

async function enterOnline(database: Database) {
  remote = database;
  if (outbox.ops.length > 0) {
    let failed: FailedOp[];
    try {
      failed = await replay(database);
    } catch (e) {
      remote = null;
      throw e;
    }
    if (failed.length > 0) publish({ failed: [...status.failed, ...failed] });
    clearCache();
  }
  mode = "online";
  publish({ mode, pending: pendingCount() });
  database
    .execute("DELETE FROM _applied_ops WHERE dibuat_pada < $1", [nowSeconds() - APPLIED_OPS_RETENTION_DAYS * 86400])
    .catch(() => {});
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
    const database = await connectRemote(settings);
    if (!database) return false;
    try {
      await enterOnline(database);
      return true;
    } catch (_) {
      await closeQuietly(database);
      return false;
    }
  });
  return attempt.then((ok) => {
    if (!ok) scheduleReconnect();
    return ok;
  });
}

let watching = false;

function watchNetwork() {
  if (watching || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  watching = true;
  window.addEventListener("online", () => void reconnect());
}

async function openDb(): Promise<Database> {
  config = await tursoConfig();
  if (!config) throw new Error(NOT_CONFIGURED_MESSAGE);
  const saved = await readStore<Outbox>("outbox");
  if (saved && Array.isArray(saved.ops)) outbox = saved;
  await loadCache();
  watchNetwork();
  const database = await connectRemote(config);
  if (database) {
    try {
      await enterOnline(database);
      return router;
    } catch (_) {
      await closeQuietly(database);
    }
  }
  mode = "offline";
  publish({ mode, pending: pendingCount() });
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

export function op<A extends unknown[], R>(
  name: string,
  work: (...args: A) => Promise<R>,
  options: OpOptions<A> = {}
): (...args: A) => Promise<R> {
  registry.set(name, work as AnyOp);
  offlineHooks.set(name, options);
  return async (...args: A) => {
    await getDb();
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
      return (await enqueue(id, name, args, at)) as R;
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

export async function requireSynced() {
  await getDb();
  requireOnline();
  if (pendingCount() > 0) {
    throw new Error("Masih ada transaksi offline yang belum terkirim ke server. Tunggu sampai terkirim, lalu coba lagi.");
  }
}

let transactionQueue: Promise<unknown> = Promise.resolve();

export function withTransaction<T>(work: (tx: Database) => Promise<T>): Promise<T> {
  if (context?.tx) return work(router);
  const owner = context;
  const run = transactionQueue.then(async () => {
    const database = await getDb();
    if (owner) owner.pinned = remote;
    touched = new Set();
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
      invalidate(touched);
      touched = new Set();
    }
  });
  transactionQueue = run.catch(() => {});
  return run;
}

export async function connectTurso(): Promise<void> {
  await getDb();
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
  if (isOffline()) return;

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

export const resetTransactionData = op(
  "resetTransactionData",
  async () => {
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
  },
  { onlineOnly: true }
);
