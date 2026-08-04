import { getDb } from "../database";
import { Product, ProductWithCategory } from "../types";

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
}): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO produk (kode, nama, kategori_id, satuan, harga_beli, harga_jual, stok, stok_minimum)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [data.kode, data.nama, data.kategori_id, data.satuan, data.harga_beli, data.harga_jual, data.stok, data.stok_minimum]
  );
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
  }
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE produk SET kode=$1, nama=$2, kategori_id=$3, satuan=$4, harga_beli=$5,
     harga_jual=$6, stok=$7, stok_minimum=$8, diperbarui_pada=strftime('%s','now')
     WHERE id = $9`,
    [data.kode, data.nama, data.kategori_id, data.satuan, data.harga_beli, data.harga_jual, data.stok, data.stok_minimum, id]
  );
}

export async function deleteProduct(id: number): Promise<void> {
  const db = await getDb();
  const sales: { count: number }[] = await db.select(
    "SELECT COUNT(*) as count FROM item_penjualan WHERE produk_id = $1",
    [id]
  );
  const purchases: { count: number }[] = await db.select(
    "SELECT COUNT(*) as count FROM item_pembelian WHERE produk_id = $1",
    [id]
  );
  if (sales[0].count > 0 || purchases[0].count > 0) {
    throw new Error("Produk tidak dapat dihapus karena sudah memiliki transaksi");
  }
  await db.execute("DELETE FROM produk WHERE id = $1", [id]);
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
