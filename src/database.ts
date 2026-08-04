import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:polaris.db");
  }
  return db;
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
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  await database.execute(`CREATE INDEX IF NOT EXISTS idx_produk_kategori ON produk(kategori_id)`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_produk_kode ON produk(kode)`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_item_penjualan_penjualan ON item_penjualan(penjualan_id)`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_item_pembelian_pembelian ON item_pembelian(pembelian_id)`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_penjualan_dibuat ON penjualan(dibuat_pada)`);
  await database.execute(`CREATE INDEX IF NOT EXISTS idx_pembelian_dibuat ON pembelian(dibuat_pada)`);
}
