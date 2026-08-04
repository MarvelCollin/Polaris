import { getDb } from "../database";
import { ProductWithCategory, Sale } from "../types";

export async function getDashboardStats() {
  const db = await getDb();
  const now = new Date();
  const startOfDay = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000);
  const endOfDay = startOfDay + 86400;

  const totalProducts: { count: number }[] = await db.select(
    "SELECT COUNT(*) as count FROM produk"
  );

  const todaySales: { total: number }[] = await db.select(
    "SELECT COALESCE(SUM(total), 0) as total FROM penjualan WHERE dibuat_pada >= $1 AND dibuat_pada < $2",
    [startOfDay, endOfDay]
  );

  const todayPurchases: { total: number }[] = await db.select(
    "SELECT COALESCE(SUM(total), 0) as total FROM pembelian WHERE dibuat_pada >= $1 AND dibuat_pada < $2",
    [startOfDay, endOfDay]
  );

  const lowStock: { count: number }[] = await db.select(
    "SELECT COUNT(*) as count FROM produk WHERE stok <= stok_minimum"
  );

  return {
    totalProducts: totalProducts[0].count,
    todaySales: todaySales[0].total,
    todayPurchases: todayPurchases[0].total,
    lowStockCount: lowStock[0].count,
  };
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

export async function getRecentSales(): Promise<Sale[]> {
  const db = await getDb();
  return await db.select(
    "SELECT * FROM penjualan ORDER BY dibuat_pada DESC LIMIT 5"
  );
}
