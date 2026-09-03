import { getDb } from "../database";
import { ProductWithCategory, Sale } from "../types";
import { type ChartGroupBy, GROUP_SQL, formatGroupLabel } from "./sales";
import { toLocalDateKey, toUnixTimestamp } from "../lib/utils";

export async function getDashboardStats() {
  const db = await getDb();
  const now = new Date();
  const startOfDay = toUnixTimestamp(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const endOfDay = startOfDay + 86400;
  const startOfMonth = toUnixTimestamp(new Date(now.getFullYear(), now.getMonth(), 1));
  const endOfMonth = toUnixTimestamp(new Date(now.getFullYear(), now.getMonth() + 1, 1));

  const salesWithRetur = `FROM penjualan p LEFT JOIN (SELECT penjualan_id, SUM(total) as total_retur FROM retur_penjualan GROUP BY penjualan_id) ret ON ret.penjualan_id = p.id`;
  const purchasesWithRetur = `FROM pembelian p LEFT JOIN (SELECT pembelian_id, SUM(total) as total_retur FROM retur_pembelian GROUP BY pembelian_id) ret ON ret.pembelian_id = p.id`;
  const profitJoin = `FROM item_penjualan ip LEFT JOIN (SELECT r.penjualan_id, ir.produk_id, SUM(ir.jumlah) as jumlah_retur, SUM(ir.subtotal) as total_retur FROM item_retur_penjualan ir JOIN retur_penjualan r ON ir.retur_id = r.id GROUP BY r.penjualan_id, ir.produk_id) ret ON ret.penjualan_id = ip.penjualan_id AND ret.produk_id = ip.produk_id`;
  const profitExpr = `COALESCE(SUM((ip.subtotal - COALESCE(ret.total_retur, 0)) - ((ip.jumlah - COALESCE(ret.jumlah_retur, 0)) * ip.hpp)), 0)`;

  const [counts, todaySales, todayPurchases, monthlySales, monthlyPurchases, allTimeSales, allTimePurchases, allTimeGrossProfit, monthlyGrossProfit] = await Promise.all([
    db.select<{ totalProducts: number; lowStockCount: number; totalCustomers: number }[]>(
      `SELECT (SELECT COUNT(*) FROM produk) as totalProducts, (SELECT COUNT(*) FROM produk WHERE stok <= stok_minimum) as lowStockCount, (SELECT COUNT(*) FROM pelanggan) as totalCustomers`
    ),
    db.select<{ v: number }[]>(`SELECT COALESCE(SUM(p.total - COALESCE(ret.total_retur, 0)), 0) as v ${salesWithRetur} WHERE p.dibuat_pada >= $1 AND p.dibuat_pada < $2`, [startOfDay, endOfDay]),
    db.select<{ v: number }[]>(`SELECT COALESCE(SUM(p.total - COALESCE(ret.total_retur, 0)), 0) as v ${purchasesWithRetur} WHERE p.dibuat_pada >= $1 AND p.dibuat_pada < $2`, [startOfDay, endOfDay]),
    db.select<{ v: number }[]>(`SELECT COALESCE(SUM(p.total - COALESCE(ret.total_retur, 0)), 0) as v ${salesWithRetur} WHERE p.dibuat_pada >= $1 AND p.dibuat_pada < $2`, [startOfMonth, endOfMonth]),
    db.select<{ v: number }[]>(`SELECT COALESCE(SUM(p.total - COALESCE(ret.total_retur, 0)), 0) as v ${purchasesWithRetur} WHERE p.dibuat_pada >= $1 AND p.dibuat_pada < $2`, [startOfMonth, endOfMonth]),
    db.select<{ v: number }[]>(`SELECT COALESCE(SUM(p.total - COALESCE(ret.total_retur, 0)), 0) as v ${salesWithRetur}`),
    db.select<{ v: number }[]>(`SELECT COALESCE(SUM(p.total - COALESCE(ret.total_retur, 0)), 0) as v ${purchasesWithRetur}`),
    db.select<{ v: number }[]>(`SELECT ${profitExpr} as v ${profitJoin} WHERE ip.hpp > 0`),
    db.select<{ v: number }[]>(`SELECT ${profitExpr} as v ${profitJoin} JOIN penjualan p ON ip.penjualan_id = p.id WHERE ip.hpp > 0 AND p.dibuat_pada >= $1 AND p.dibuat_pada < $2`, [startOfMonth, endOfMonth]),
  ]);

  const c = counts[0];
  const ats = allTimeSales[0].v;
  const atp = allTimePurchases[0].v;
  return {
    totalProducts: c.totalProducts,
    todaySales: todaySales[0].v,
    todayPurchases: todayPurchases[0].v,
    lowStockCount: c.lowStockCount,
    monthlySales: monthlySales[0].v,
    monthlyPurchases: monthlyPurchases[0].v,
    monthlyGrossProfit: monthlyGrossProfit[0].v,
    totalCustomers: c.totalCustomers,
    allTimeSales: ats,
    allTimePurchases: atp,
    allTimeProfit: ats - atp,
    allTimeGrossProfit: allTimeGrossProfit[0].v,
  };
}

export async function getDailySales(days: number = 30, groupBy: ChartGroupBy = "day"): Promise<{ tanggal: string; total: number }[]> {
  const db = await getDb();
  const groupExpr = GROUP_SQL[groupBy];

  if (groupBy === "all") {
    const rows: { grp: string; total: number }[] = await db.select(
      `SELECT ${groupExpr} as grp, COALESCE(SUM(p.total - COALESCE(ret.total_retur, 0)), 0) as total
       FROM penjualan p
       LEFT JOIN (SELECT penjualan_id, SUM(total) as total_retur FROM retur_penjualan GROUP BY penjualan_id) ret
         ON ret.penjualan_id = p.id
       GROUP BY grp
       ORDER BY grp`
    );
    return rows.map((r) => ({ tanggal: formatGroupLabel(r.grp, groupBy), total: r.total }));
  }

  const now = new Date();
  const startDate = toUnixTimestamp(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1));

  const rows: { grp: string; total: number }[] = await db.select(
    `SELECT ${groupExpr} as grp, COALESCE(SUM(p.total - COALESCE(ret.total_retur, 0)), 0) as total
     FROM penjualan p
     LEFT JOIN (SELECT penjualan_id, SUM(total) as total_retur FROM retur_penjualan GROUP BY penjualan_id) ret
       ON ret.penjualan_id = p.id
     WHERE p.dibuat_pada >= $1
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
    const key = toLocalDateKey(d);
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
    `SELECT strftime('%Y-%m', dibuat_pada, 'unixepoch', 'localtime') as grp, COALESCE(SUM(p.total - COALESCE(ret.total_retur, 0)), 0) as total
     FROM penjualan p
     LEFT JOIN (SELECT penjualan_id, SUM(total) as total_retur FROM retur_penjualan GROUP BY penjualan_id) ret
       ON ret.penjualan_id = p.id
     WHERE p.dibuat_pada >= $1 GROUP BY grp ORDER BY grp`,
    [startTs]
  );
  const purchaseRows: { grp: string; total: number }[] = await db.select(
    `SELECT strftime('%Y-%m', dibuat_pada, 'unixepoch', 'localtime') as grp, COALESCE(SUM(p.total - COALESCE(ret.total_retur, 0)), 0) as total
     FROM pembelian p
     LEFT JOIN (SELECT pembelian_id, SUM(total) as total_retur FROM retur_pembelian GROUP BY pembelian_id) ret
       ON ret.pembelian_id = p.id
     WHERE p.dibuat_pada >= $1 GROUP BY grp ORDER BY grp`,
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
    `SELECT k.nama as kategori, COALESCE(SUM(ip.subtotal - COALESCE(ret.total_retur, 0)), 0) as total
     FROM item_penjualan ip
     JOIN produk p ON ip.produk_id = p.id
     JOIN kategori k ON p.kategori_id = k.id
     LEFT JOIN (
       SELECT r.penjualan_id, ir.produk_id, SUM(ir.subtotal) as total_retur
       FROM item_retur_penjualan ir
       JOIN retur_penjualan r ON ir.retur_id = r.id
       GROUP BY r.penjualan_id, ir.produk_id
     ) ret ON ret.penjualan_id = ip.penjualan_id AND ret.produk_id = ip.produk_id
     GROUP BY k.id
     ORDER BY total DESC`
  );
}

export async function getTopProducts(limit: number = 5): Promise<{ nama: string; jumlah: number; total: number }[]> {
  const db = await getDb();
  return await db.select(
    `SELECT ip.nama_produk as nama,
       SUM(ip.jumlah - COALESCE(ret.jumlah_retur, 0)) as jumlah,
       SUM(ip.subtotal - COALESCE(ret.total_retur, 0)) as total
     FROM item_penjualan ip
     LEFT JOIN (
       SELECT r.penjualan_id, ir.produk_id, SUM(ir.jumlah) as jumlah_retur, SUM(ir.subtotal) as total_retur
       FROM item_retur_penjualan ir
       JOIN retur_penjualan r ON ir.retur_id = r.id
       GROUP BY r.penjualan_id, ir.produk_id
     ) ret ON ret.penjualan_id = ip.penjualan_id AND ret.produk_id = ip.produk_id
     GROUP BY ip.produk_id
     HAVING jumlah > 0
     ORDER BY total DESC
     LIMIT $1`,
    [limit]
  );
}

export async function getTopCustomers(limit: number = 5): Promise<{ nama: string; total: number; transaksi: number }[]> {
  const db = await getDb();
  return await db.select(
    `SELECT COALESCE(p.nama_pelanggan, 'Umum') as nama,
       SUM(p.total - COALESCE(ret.total_retur, 0)) as total,
       COUNT(*) as transaksi
     FROM penjualan p
     LEFT JOIN (SELECT penjualan_id, SUM(total) as total_retur FROM retur_penjualan GROUP BY penjualan_id) ret
       ON ret.penjualan_id = p.id
     WHERE p.nama_pelanggan IS NOT NULL
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
    `SELECT ip.nama_produk,
       SUM(ip.jumlah - COALESCE(ret.jumlah_retur, 0)) as jumlah,
       SUM(ip.subtotal - COALESCE(ret.total_retur, 0)) as total
     FROM item_penjualan ip
     JOIN penjualan p ON ip.penjualan_id = p.id
     LEFT JOIN (
       SELECT r.penjualan_id, ir.produk_id, SUM(ir.jumlah) as jumlah_retur, SUM(ir.subtotal) as total_retur
       FROM item_retur_penjualan ir
       JOIN retur_penjualan r ON ir.retur_id = r.id
       GROUP BY r.penjualan_id, ir.produk_id
     ) ret ON ret.penjualan_id = p.id AND ret.produk_id = ip.produk_id
     WHERE p.dibuat_pada >= $1
     GROUP BY ip.produk_id
     HAVING jumlah > 0
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
    `SELECT ip.nama_produk,
       SUM(ip.jumlah - COALESCE(ret.jumlah_retur, 0)) as jumlah,
       SUM(ip.subtotal - COALESCE(ret.total_retur, 0)) as total
     FROM item_pembelian ip
     JOIN pembelian p ON ip.pembelian_id = p.id
     LEFT JOIN (
       SELECT r.pembelian_id, ir.produk_id, SUM(ir.jumlah) as jumlah_retur, SUM(ir.subtotal) as total_retur
       FROM item_retur_pembelian ir
       JOIN retur_pembelian r ON ir.retur_id = r.id
       GROUP BY r.pembelian_id, ir.produk_id
     ) ret ON ret.pembelian_id = p.id AND ret.produk_id = ip.produk_id
     WHERE p.dibuat_pada >= $1
     GROUP BY ip.produk_id
     HAVING jumlah > 0
     ORDER BY total DESC`,
    [startTs]
  );
}

export async function getLowStockProducts(): Promise<ProductWithCategory[]> {
  const db = await getDb();
  return await db.select(
    `SELECT p.id, p.kode, p.nama, p.kategori_id, p.satuan, p.harga_beli, p.harga_jual, p.stok, p.stok_minimum, p.dibuat_pada, p.diperbarui_pada, k.nama as kategori_nama
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
    `SELECT p.id, p.nomor_faktur,
       (p.total - COALESCE(ret.total_retur, 0)) as total,
       p.dibayar, p.kembalian, p.dibuat_pada, p.pelanggan_id, p.nama_pelanggan, p.diskon
     FROM penjualan p
     LEFT JOIN (SELECT penjualan_id, SUM(total) as total_retur FROM retur_penjualan GROUP BY penjualan_id) ret
       ON ret.penjualan_id = p.id
     ORDER BY dibuat_pada DESC LIMIT 5`
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
       SUM(ip.jumlah - COALESCE(ret.jumlah_retur, 0)) as jumlah,
       SUM(ip.subtotal - COALESCE(ret.total_retur, 0)) as pendapatan,
       SUM((ip.jumlah - COALESCE(ret.jumlah_retur, 0)) * ip.hpp) as modal
     FROM item_penjualan ip
     LEFT JOIN (
       SELECT r.penjualan_id, ir.produk_id, SUM(ir.jumlah) as jumlah_retur, SUM(ir.subtotal) as total_retur
       FROM item_retur_penjualan ir
       JOIN retur_penjualan r ON ir.retur_id = r.id
       GROUP BY r.penjualan_id, ir.produk_id
     ) ret ON ret.penjualan_id = ip.penjualan_id AND ret.produk_id = ip.produk_id
     WHERE ip.hpp > 0
     GROUP BY ip.produk_id
     HAVING jumlah > 0
     ORDER BY (SUM(ip.subtotal - COALESCE(ret.total_retur, 0)) - SUM((ip.jumlah - COALESCE(ret.jumlah_retur, 0)) * ip.hpp)) DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    ...r,
    laba: r.pendapatan - r.modal,
    margin: r.pendapatan > 0 ? Math.round(((r.pendapatan - r.modal) / r.pendapatan) * 100) : 0,
  }));
}
