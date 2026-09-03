import { getDb, syncDb } from "../database";
import { Product, ProductWithCategory } from "../types";

export async function generateProductCode(): Promise<string> {
  const db = await getDb();
  const rows: { max_id: number | null }[] = await db.select(
    "SELECT MAX(id) as max_id FROM produk"
  );
  const next = (rows[0].max_id ?? 0) + 1;
  return `PRD-${String(next).padStart(4, "0")}`;
}

export async function getProducts(
  search?: string,
  categoryId?: number
): Promise<ProductWithCategory[]> {
  const db = await getDb();
  let query = `
    SELECT p.*, k.nama as kategori_nama
    FROM produk p
    JOIN kategori k ON p.kategori_id = k.id
  `;
  const params: (string | number)[] = [];
  const conditions: string[] = [];

  if (search) {
    conditions.push("(p.nama LIKE $1 OR p.kode LIKE $1)");
    params.push(`%${search}%`);
  }

  if (categoryId) {
    conditions.push(`p.kategori_id = $${params.length + 1}`);
    params.push(categoryId);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY p.nama";
  return await db.select(query, params);
}

export async function getProduct(id: number): Promise<Product | null> {
  const db = await getDb();
  const rows: Product[] = await db.select("SELECT * FROM produk WHERE id = $1", [id]);
  return rows[0] || null;
}

export async function createProduct(data: {
  kode: string;
  nama: string;
  kategori_id: number;
  satuan: string;
  harga_beli: number;
  harga_jual: number;
  stok: number;
  stok_minimum: number;
  gambar?: string | null;
}): Promise<number> {
  const db = await getDb();
  const kode = data.kode.trim() || (await generateProductCode());
  const result = await db.execute(
    `INSERT INTO produk (kode, nama, kategori_id, satuan, harga_beli, harga_jual, stok, stok_minimum, gambar)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [kode, data.nama, data.kategori_id, data.satuan, data.harga_beli, data.harga_jual, data.stok, data.stok_minimum, data.gambar ?? null]
  );
  syncDb();
  return result.lastInsertId ?? 0;
}

export async function updateProduct(
  id: number,
  data: {
    kode: string;
    nama: string;
    kategori_id: number;
    satuan: string;
    harga_beli: number;
    harga_jual: number;
    stok: number;
    stok_minimum: number;
    gambar?: string | null;
  }
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE produk SET kode=$1, nama=$2, kategori_id=$3, satuan=$4, harga_beli=$5,
     harga_jual=$6, stok=$7, stok_minimum=$8, gambar=$9, diperbarui_pada=strftime('%s','now')
     WHERE id = $10`,
    [data.kode, data.nama, data.kategori_id, data.satuan, data.harga_beli, data.harga_jual, data.stok, data.stok_minimum, data.gambar ?? null, id]
  );
  syncDb();
}

export async function updateStock(id: number, stok: number): Promise<void> {
  if (stok < 0) throw new Error("Stok tidak boleh negatif");
  const db = await getDb();
  await db.execute(
    "UPDATE produk SET stok=$1, diperbarui_pada=strftime('%s','now') WHERE id=$2",
    [stok, id]
  );
  syncDb();
}

export async function deleteProduct(id: number): Promise<void> {
  const db = await getDb();
  const rows: { count: number }[] = await db.select(
    `SELECT (SELECT COUNT(*) FROM item_penjualan WHERE produk_id = $1)
          + (SELECT COUNT(*) FROM item_pembelian WHERE produk_id = $1) as count`,
    [id]
  );
  if (rows[0].count > 0) {
    throw new Error("Produk tidak dapat dihapus karena sudah memiliki transaksi");
  }
  await db.execute("DELETE FROM produk WHERE id = $1", [id]);
  syncDb();
}

export async function getFrequentProductIds(limit: number = 8): Promise<number[]> {
  const db = await getDb();
  const rows: { produk_id: number }[] = await db.select(
    `SELECT produk_id, SUM(jumlah) as total_qty
     FROM item_penjualan
     GROUP BY produk_id
     ORDER BY total_qty DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => r.produk_id);
}

export async function getDistinctSatuan(): Promise<string[]> {
  const db = await getDb();
  const rows: { satuan: string }[] = await db.select(
    "SELECT satuan FROM produk GROUP BY UPPER(satuan) ORDER BY satuan"
  );
  return rows.map((r) => r.satuan);
}

export async function getLowStockProducts(): Promise<ProductWithCategory[]> {
  const db = await getDb();
  return await db.select(
    `SELECT p.*, k.nama as kategori_nama
     FROM produk p
     JOIN kategori k ON p.kategori_id = k.id
     WHERE p.stok <= p.stok_minimum
     ORDER BY p.stok ASC
     LIMIT 10`
  );
}
