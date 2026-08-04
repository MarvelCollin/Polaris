import { getDb } from "../database";
import { ProductWithCategory, Sale } from "../types";

export async function getDashboardStats() {
  const db = await getDb();
  const now = new Date();
  const startOfDay = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000);
  const endOfDay = startOfDay + 86400;
  const startOfMonth = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
  const endOfMonth = Math.floor(new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime() / 1000);

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

  const monthlySales: { total: number }[] = await db.select(
    "SELECT COALESCE(SUM(total), 0) as total FROM penjualan WHERE dibuat_pada >= $1 AND dibuat_pada < $2",
    [startOfMonth, endOfMonth]
  );

  const monthlyPurchases: { total: number }[] = await db.select(
    "SELECT COALESCE(SUM(total), 0) as total FROM pembelian WHERE dibuat_pada >= $1 AND dibuat_pada < $2",
    [startOfMonth, endOfMonth]
  );

  const totalCustomers: { count: number }[] = await db.select(
    "SELECT COUNT(*) as count FROM pelanggan"
  );

  return {
    totalProducts: totalProducts[0].count,
    todaySales: todaySales[0].total,
    todayPurchases: todayPurchases[0].total,
    lowStockCount: lowStock[0].count,
    monthlySales: monthlySales[0].total,
    monthlyPurchases: monthlyPurchases[0].total,
    monthlyProfit: monthlySales[0].total - monthlyPurchases[0].total,
    totalCustomers: totalCustomers[0].count,
  };
}

export async function getDailySales(days: number = 30): Promise<{ tanggal: string; total: number }[]> {
  const db = await getDb();
  const now = new Date();
  const startDate = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1).getTime() / 1000);

  const rows: { day: string; total: number }[] = await db.select(
    `SELECT date(dibuat_pada, 'unixepoch', 'localtime') as day, COALESCE(SUM(total), 0) as total
     FROM penjualan
     WHERE dibuat_pada >= $1
     GROUP BY day
     ORDER BY day`,
    [startDate]
  );

  const result: { tanggal: string; total: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1 + i);
    const key = d.toISOString().slice(0, 10);
    const label = `${d.getDate()}/${d.getMonth() + 1}`;
    const found = rows.find((r) => r.day === key);
    result.push({ tanggal: label, total: found?.total ?? 0 });
  }
  return result;
}

export async function getMonthlySalesVsPurchases(months: number = 6): Promise<{ bulan: string; penjualan: number; pembelian: number }[]> {
  const db = await getDb();
  const result: { bulan: string; penjualan: number; pembelian: number }[] = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const startTs = Math.floor(start.getTime() / 1000);
    const endTs = Math.floor(end.getTime() / 1000);

    const bulanLabel = start.toLocaleDateString("id-ID", { month: "short", year: "2-digit" });

    const sales: { total: number }[] = await db.select(
      "SELECT COALESCE(SUM(total), 0) as total FROM penjualan WHERE dibuat_pada >= $1 AND dibuat_pada < $2",
      [startTs, endTs]
    );
    const purchases: { total: number }[] = await db.select(
      "SELECT COALESCE(SUM(total), 0) as total FROM pembelian WHERE dibuat_pada >= $1 AND dibuat_pada < $2",
      [startTs, endTs]
    );

    result.push({
      bulan: bulanLabel,
      penjualan: sales[0].total,
      pembelian: purchases[0].total,
    });
  }
  return result;
}

export async function getSalesByCategory(): Promise<{ kategori: string; total: number }[]> {
  const db = await getDb();
  return await db.select(
    `SELECT k.nama as kategori, COALESCE(SUM(ip.subtotal), 0) as total
     FROM item_penjualan ip
     JOIN produk p ON ip.produk_id = p.id
     JOIN kategori k ON p.kategori_id = k.id
     GROUP BY k.id
     ORDER BY total DESC`
  );
}

export async function getTopProducts(limit: number = 5): Promise<{ nama: string; jumlah: number; total: number }[]> {
  const db = await getDb();
  return await db.select(
    `SELECT ip.nama_produk as nama, SUM(ip.jumlah) as jumlah, SUM(ip.subtotal) as total
     FROM item_penjualan ip
     GROUP BY ip.produk_id
     ORDER BY total DESC
     LIMIT $1`,
    [limit]
  );
}

export async function getTopCustomers(limit: number = 5): Promise<{ nama: string; total: number; transaksi: number }[]> {
  const db = await getDb();
  return await db.select(
    `SELECT COALESCE(nama_pelanggan, 'Umum') as nama, SUM(total) as total, COUNT(*) as transaksi
     FROM penjualan
     WHERE nama_pelanggan IS NOT NULL
     GROUP BY pelanggan_id
     ORDER BY total DESC
     LIMIT $1`,
    [limit]
  );
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
