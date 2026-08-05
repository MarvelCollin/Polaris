import { getDb } from "../database";
import { ProductWithCategory, Sale } from "../types";
import { type ChartGroupBy, GROUP_SQL, formatGroupLabel } from "./sales";
import { toUnixTimestamp } from "../lib/utils";

export async function getDashboardStats() {
  const db = await getDb();
  const now = new Date();
  const startOfDay = toUnixTimestamp(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const endOfDay = startOfDay + 86400;
  const startOfMonth = toUnixTimestamp(new Date(now.getFullYear(), now.getMonth(), 1));
  const endOfMonth = toUnixTimestamp(new Date(now.getFullYear(), now.getMonth() + 1, 1));

  const rows: {
    totalProducts: number;
    todaySales: number;
    todayPurchases: number;
    lowStockCount: number;
    monthlySales: number;
    monthlyPurchases: number;
    totalCustomers: number;
  }[] = await db.select(
    `SELECT
       (SELECT COUNT(*) FROM produk) as totalProducts,
       (SELECT COALESCE(SUM(total), 0) FROM penjualan WHERE dibuat_pada >= $1 AND dibuat_pada < $2) as todaySales,
       (SELECT COALESCE(SUM(total), 0) FROM pembelian WHERE dibuat_pada >= $1 AND dibuat_pada < $2) as todayPurchases,
       (SELECT COUNT(*) FROM produk WHERE stok <= stok_minimum) as lowStockCount,
       (SELECT COALESCE(SUM(total), 0) FROM penjualan WHERE dibuat_pada >= $3 AND dibuat_pada < $4) as monthlySales,
       (SELECT COALESCE(SUM(total), 0) FROM pembelian WHERE dibuat_pada >= $3 AND dibuat_pada < $4) as monthlyPurchases,
       (SELECT COUNT(*) FROM pelanggan) as totalCustomers`,
    [startOfDay, endOfDay, startOfMonth, endOfMonth]
  );

  const r = rows[0];
  return {
    totalProducts: r.totalProducts,
    todaySales: r.todaySales,
    todayPurchases: r.todayPurchases,
    lowStockCount: r.lowStockCount,
    monthlySales: r.monthlySales,
    monthlyPurchases: r.monthlyPurchases,
    monthlyProfit: r.monthlySales - r.monthlyPurchases,
    totalCustomers: r.totalCustomers,
  };
}

export async function getDailySales(days: number = 30, groupBy: ChartGroupBy = "day"): Promise<{ tanggal: string; total: number }[]> {
  const db = await getDb();
  const now = new Date();
  const startDate = toUnixTimestamp(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1));

  const groupExpr = GROUP_SQL[groupBy];
  const rows: { grp: string; total: number }[] = await db.select(
    `SELECT ${groupExpr} as grp, COALESCE(SUM(total), 0) as total
     FROM penjualan
     WHERE dibuat_pada >= $1
     GROUP BY grp
     ORDER BY grp`,
    [startDate]
  );

  if (groupBy !== "day") {
    return rows.map((r) => ({ tanggal: formatGroupLabel(r.grp, groupBy), total: r.total }));
  }

  const rowMap = new Map(rows.map((r) => [r.grp, r.total]));
  const result: { tanggal: string; total: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1 + i);
    const key = d.toISOString().slice(0, 10);
    const label = `${d.getDate()}/${d.getMonth() + 1}`;
    result.push({ tanggal: label, total: rowMap.get(key) ?? 0 });
  }
  return result;
}

export async function getMonthlySalesVsPurchases(months: number = 6): Promise<{ bulan: string; penjualan: number; pembelian: number }[]> {
  const db = await getDb();
  const now = new Date();
  const startTs = toUnixTimestamp(new Date(now.getFullYear(), now.getMonth() - months + 1, 1));

  const salesRows: { grp: string; total: number }[] = await db.select(
    `SELECT strftime('%Y-%m', dibuat_pada, 'unixepoch', 'localtime') as grp, COALESCE(SUM(total), 0) as total
     FROM penjualan WHERE dibuat_pada >= $1 GROUP BY grp ORDER BY grp`,
    [startTs]
  );
  const purchaseRows: { grp: string; total: number }[] = await db.select(
    `SELECT strftime('%Y-%m', dibuat_pada, 'unixepoch', 'localtime') as grp, COALESCE(SUM(total), 0) as total
     FROM pembelian WHERE dibuat_pada >= $1 GROUP BY grp ORDER BY grp`,
    [startTs]
  );

  const salesMap = new Map(salesRows.map((r) => [r.grp, r.total]));
  const purchaseMap = new Map(purchaseRows.map((r) => [r.grp, r.total]));

  const result: { bulan: string; penjualan: number; pembelian: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const bulanLabel = d.toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
    result.push({
      bulan: bulanLabel,
      penjualan: salesMap.get(key) ?? 0,
      pembelian: purchaseMap.get(key) ?? 0,
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

export async function getSalesRecap(period: "day" | "week" | "month"): Promise<{ nama_produk: string; jumlah: number; total: number }[]> {
  const db = await getDb();
  const now = new Date();
  let startTs: number;

  if (period === "day") {
    startTs = toUnixTimestamp(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  } else if (period === "week") {
    const dayOfWeek = now.getDay() || 7;
    startTs = toUnixTimestamp(new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1));
  } else {
    startTs = toUnixTimestamp(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  return await db.select(
    `SELECT ip.nama_produk, SUM(ip.jumlah) as jumlah, SUM(ip.subtotal) as total
     FROM item_penjualan ip
     JOIN penjualan p ON ip.penjualan_id = p.id
     WHERE p.dibuat_pada >= $1
     GROUP BY ip.produk_id
     ORDER BY total DESC`,
    [startTs]
  );
}

export async function getPurchasesRecap(period: "day" | "week" | "month"): Promise<{ nama_produk: string; jumlah: number; total: number }[]> {
  const db = await getDb();
  const now = new Date();
  let startTs: number;

  if (period === "day") {
    startTs = toUnixTimestamp(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  } else if (period === "week") {
    const dayOfWeek = now.getDay() || 7;
    startTs = toUnixTimestamp(new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1));
  } else {
    startTs = toUnixTimestamp(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  return await db.select(
    `SELECT ip.nama_produk, SUM(ip.jumlah) as jumlah, SUM(ip.subtotal) as total
     FROM item_pembelian ip
     JOIN pembelian p ON ip.pembelian_id = p.id
     WHERE p.dibuat_pada >= $1
     GROUP BY ip.produk_id
     ORDER BY total DESC`,
    [startTs]
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

export async function getGrossProfitByProduct(limit: number = 10): Promise<{
  nama: string;
  jumlah: number;
  pendapatan: number;
  modal: number;
  laba: number;
  margin: number;
}[]> {
  const db = await getDb();
  const rows: { nama: string; jumlah: number; pendapatan: number; modal: number }[] = await db.select(
    `SELECT ip.nama_produk as nama,
       SUM(ip.jumlah) as jumlah,
       SUM(ip.subtotal) as pendapatan,
       SUM(ip.jumlah * ip.hpp) as modal
     FROM item_penjualan ip
     WHERE ip.hpp > 0
     GROUP BY ip.produk_id
     ORDER BY (SUM(ip.subtotal) - SUM(ip.jumlah * ip.hpp)) DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    ...r,
    laba: r.pendapatan - r.modal,
    margin: r.pendapatan > 0 ? Math.round(((r.pendapatan - r.modal) / r.pendapatan) * 100) : 0,
  }));
}
