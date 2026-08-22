import { Database } from "tauri-plugin-libsql-api";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";

let db: Database | null = null;
let dbPromise: Promise<Database> | null = null;
let tursoConnected = false;
let dbFile: string | null = null;

interface TursoConfig {
  url: string;
  token: string;
}

export async function databasePath(): Promise<string> {
  if (!dbFile) dbFile = `sqlite:${await appDataDir()}polaris.db`;
  return dbFile;
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
    return await invoke<TursoConfig | null>("get_turso_config");
  } catch (_) {
    return null;
  }
}

async function openDb(): Promise<Database> {
  const path = await databasePath();
  const config = await tursoConfig();

  if (config) {
    try {
      const replica = await Database.load({ path, syncUrl: config.url, authToken: config.token });
      tursoConnected = true;
      db = await tune(replica);
      void replica.sync().catch(() => {});
      return db;
    } catch (_) {}
  }

  db = await tune(await Database.load(path));
  return db;
}

export function getDb(): Promise<Database> {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

export async function connectTurso(): Promise<void> {
  if (tursoConnected) return;
  await getDb();
  if (tursoConnected) return;

  const config = await tursoConfig();
  if (!config) return;

  try {
    const path = await databasePath();
    const replica = await Database.load({ path, syncUrl: config.url, authToken: config.token });
    await tune(replica);
    await replica.sync();
    db = replica;
    dbPromise = Promise.resolve(replica);
    tursoConnected = true;
  } catch (_) {}
}

export const SYNC_DELAY_MS = 2000;
export const SYNC_MAX_DELAY_MS = 10000;

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
  db?.sync().catch(() => {});
}

export function syncDb() {
  if (!db || !tursoConnected) return;
  const now = Date.now();
  if (!syncDeadline) syncDeadline = now + SYNC_MAX_DELAY_MS;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, Math.max(0, Math.min(SYNC_DELAY_MS, syncDeadline - now)));
}

async function syncDbImmediate() {
  cancelSync();
  if (db && tursoConnected) {
    try { await db.sync(); } catch (_) {}
  }
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
  await syncDbImmediate();
}
