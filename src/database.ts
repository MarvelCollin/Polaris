import { Database } from "tauri-plugin-libsql-api";
import { invoke } from "@tauri-apps/api/core";

let db: Database | null = null;

interface TursoConfig {
  url: string;
  token: string;
}

export async function getDb(): Promise<Database> {
  if (!db) {
    const config: TursoConfig | null = await invoke("get_turso_config");

    if (config) {
      db = await Database.load({
        path: "sqlite:polaris.db",
        syncUrl: config.url,
        authToken: config.token,
      });
    } else {
      db = await Database.load("sqlite:polaris.db");
    }

    await db.execute("PRAGMA journal_mode = WAL");
    await db.execute("PRAGMA synchronous = NORMAL");
    await db.execute("PRAGMA cache_size = -8000");
    await db.execute("PRAGMA temp_store = MEMORY");
    await db.execute("PRAGMA foreign_keys = ON");
  }
  return db;
}

export async function syncDb() {
  if (db) {
    try {
      await db.sync();
    } catch (_) {}
  }
}

export async function initDb() {
  const database = await getDb();

  await database.execute(`
    CREATE TABLE IF NOT EXISTS kategori (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL UNIQUE,
      dibuat_pada INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS produk (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kode TEXT NOT NULL UNIQUE,
      nama TEXT NOT NULL,
      kategori_id INTEGER NOT NULL,
      satuan TEXT NOT NULL,
      harga_beli REAL NOT NULL,
      harga_jual REAL NOT NULL,
      stok REAL NOT NULL DEFAULT 0,
      stok_minimum REAL NOT NULL DEFAULT 0,
      gambar TEXT,
      dibuat_pada INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      diperbarui_pada INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (kategori_id) REFERENCES kategori(id)
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS penjualan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nomor_faktur TEXT NOT NULL UNIQUE,
      total REAL NOT NULL,
      dibayar REAL NOT NULL,
      kembalian REAL NOT NULL,
      dibuat_pada INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS item_penjualan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      penjualan_id INTEGER NOT NULL,
      produk_id INTEGER NOT NULL,
      nama_produk TEXT NOT NULL,
      jumlah REAL NOT NULL,
      harga_satuan REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (penjualan_id) REFERENCES penjualan(id),
      FOREIGN KEY (produk_id) REFERENCES produk(id)
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS pembelian (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier TEXT NOT NULL,
      referensi_faktur TEXT,
      total REAL NOT NULL,
      dibuat_pada INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS item_pembelian (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pembelian_id INTEGER NOT NULL,
      produk_id INTEGER NOT NULL,
      nama_produk TEXT NOT NULL,
      jumlah REAL NOT NULL,
      harga_satuan REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (pembelian_id) REFERENCES pembelian(id),
      FOREIGN KEY (produk_id) REFERENCES produk(id)
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS pelanggan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      telepon TEXT,
      alamat TEXT,
      dibuat_pada INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS harga_pelanggan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pelanggan_id INTEGER NOT NULL,
      produk_id INTEGER NOT NULL,
      harga REAL NOT NULL,
      FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id) ON DELETE CASCADE,
      FOREIGN KEY (produk_id) REFERENCES produk(id) ON DELETE CASCADE,
      UNIQUE(pelanggan_id, produk_id)
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  const pembelianColumns: { name: string }[] = await database.select("PRAGMA table_info(pembelian)");
  const hasDibayarColumn = pembelianColumns.some((column) => column.name === "dibayar");

  try { await database.execute("ALTER TABLE produk ADD COLUMN gambar TEXT"); } catch (_) {}
  try { await database.execute("ALTER TABLE penjualan ADD COLUMN pelanggan_id INTEGER REFERENCES pelanggan(id)"); } catch (_) {}
  try { await database.execute("ALTER TABLE penjualan ADD COLUMN nama_pelanggan TEXT"); } catch (_) {}

  try { await database.execute("ALTER TABLE pembelian ADD COLUMN dibayar REAL NOT NULL DEFAULT 0"); } catch (_) {}
  try { await database.execute("ALTER TABLE penjualan ADD COLUMN diskon REAL NOT NULL DEFAULT 0"); } catch (_) {}
  try { await database.execute("ALTER TABLE item_penjualan ADD COLUMN hpp REAL NOT NULL DEFAULT 0"); } catch (_) {}

  if (!hasDibayarColumn) {
    await database.execute(`
      UPDATE pembelian SET dibayar = total WHERE dibayar = 0 AND total > 0
    `);
  }

  await database.execute(`
    CREATE TABLE IF NOT EXISTS pembayaran_pembelian (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pembelian_id INTEGER NOT NULL,
      jumlah REAL NOT NULL,
      catatan TEXT,
      dibuat_pada INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (pembelian_id) REFERENCES pembelian(id)
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS pembayaran_penjualan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      penjualan_id INTEGER NOT NULL,
      jumlah REAL NOT NULL,
      catatan TEXT,
      dibuat_pada INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (penjualan_id) REFERENCES penjualan(id)
    )
  `);

  await database.batch([
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
  ]);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS retur_penjualan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      penjualan_id INTEGER NOT NULL,
      total REAL NOT NULL,
      alasan TEXT,
      dibuat_pada INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (penjualan_id) REFERENCES penjualan(id)
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS item_retur_penjualan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      retur_id INTEGER NOT NULL,
      produk_id INTEGER NOT NULL,
      nama_produk TEXT NOT NULL,
      jumlah REAL NOT NULL,
      harga_satuan REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (retur_id) REFERENCES retur_penjualan(id),
      FOREIGN KEY (produk_id) REFERENCES produk(id)
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS retur_pembelian (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pembelian_id INTEGER NOT NULL,
      total REAL NOT NULL,
      alasan TEXT,
      dibuat_pada INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (pembelian_id) REFERENCES pembelian(id)
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS item_retur_pembelian (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      retur_id INTEGER NOT NULL,
      produk_id INTEGER NOT NULL,
      nama_produk TEXT NOT NULL,
      jumlah REAL NOT NULL,
      harga_satuan REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (retur_id) REFERENCES retur_pembelian(id),
      FOREIGN KEY (produk_id) REFERENCES produk(id)
    )
  `);

  await database.batch([
    "CREATE INDEX IF NOT EXISTS idx_retur_penjualan ON retur_penjualan(penjualan_id)",
    "CREATE INDEX IF NOT EXISTS idx_retur_pembelian ON retur_pembelian(pembelian_id)",
    "CREATE INDEX IF NOT EXISTS idx_item_retur_penjualan_retur ON item_retur_penjualan(retur_id)",
    "CREATE INDEX IF NOT EXISTS idx_item_retur_pembelian_retur ON item_retur_pembelian(retur_id)",
    "CREATE INDEX IF NOT EXISTS idx_item_retur_penjualan_produk ON item_retur_penjualan(produk_id)",
    "CREATE INDEX IF NOT EXISTS idx_item_retur_pembelian_produk ON item_retur_pembelian(produk_id)",
    "CREATE INDEX IF NOT EXISTS idx_pembelian_supplier ON pembelian(supplier)",
    "CREATE INDEX IF NOT EXISTS idx_produk_stok ON produk(stok, stok_minimum)",
  ]);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS alamat_pelanggan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pelanggan_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      alamat TEXT NOT NULL,
      FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id) ON DELETE CASCADE
    )
  `);

  await database.execute("CREATE INDEX IF NOT EXISTS idx_alamat_pelanggan ON alamat_pelanggan(pelanggan_id)");

  try { await database.execute("ALTER TABLE penjualan ADD COLUMN alamat_pengiriman TEXT"); } catch (_) {}

  await syncDb();
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
  await syncDb();
}
