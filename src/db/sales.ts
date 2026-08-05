import { getDb } from "../database";
import { Sale, SaleItem, CartEntry, SaleDebt, Payment, ReturPenjualan, ReturItem } from "../types";
import { toUnixTimestamp } from "../lib/utils";

async function generateInvoiceNumber(): Promise<string> {
  const db = await getDb();
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const startOfDay = toUnixTimestamp(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const endOfDay = startOfDay + 86400;

  const rows: { count: number }[] = await db.select(
    "SELECT COUNT(*) as count FROM penjualan WHERE dibuat_pada >= $1 AND dibuat_pada < $2",
    [startOfDay, endOfDay]
  );
  const seq = (rows[0].count + 1).toString().padStart(4, "0");
  return `INV-${dateStr}-${seq}`;
}

export async function createSale(
  items: CartEntry[],
  dibayar: number,
  pelangganId?: number | null,
  namaPelanggan?: string | null,
  diskon: number = 0
): Promise<number> {
  const db = await getDb();
  const subtotal = items.reduce((sum, item) => sum + item.jumlah * item.harga, 0);
  const total = subtotal - diskon;
  const kembalian = Math.max(0, dibayar - total);
  const nomor = await generateInvoiceNumber();

  const result = await db.execute(
    "INSERT INTO penjualan (nomor_faktur, total, dibayar, kembalian, pelanggan_id, nama_pelanggan, diskon) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [nomor, total, dibayar, kembalian, pelangganId ?? null, namaPelanggan ?? null, diskon]
  );
  const saleId = result.lastInsertId ?? 0;

  for (const item of items) {
    const produk: { harga_beli: number }[] = await db.select(
      "SELECT harga_beli FROM produk WHERE id = $1",
      [item.produk_id]
    );
    const hpp = produk.length > 0 ? produk[0].harga_beli : 0;

    await db.execute(
      `INSERT INTO item_penjualan (penjualan_id, produk_id, nama_produk, jumlah, harga_satuan, subtotal, hpp)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [saleId, item.produk_id, item.nama, item.jumlah, item.harga, item.jumlah * item.harga, hpp]
    );
    await db.execute(
      "UPDATE produk SET stok = stok - $1, diperbarui_pada = strftime('%s','now') WHERE id = $2",
      [item.jumlah, item.produk_id]
    );
  }

  return saleId;
}

export async function getSales(
  startDate?: number,
  endDate?: number,
  limit: number = 50,
  offset: number = 0,
  search?: string
): Promise<{ data: Sale[]; total: number }> {
  const db = await getDb();
  const conditions: string[] = [];
  const params: (number | string)[] = [];

  if (startDate && endDate) {
    conditions.push(`dibuat_pada >= $${params.length + 1} AND dibuat_pada <= $${params.length + 2}`);
    params.push(startDate, endDate);
  }
  if (search) {
    conditions.push(`(nomor_faktur LIKE $${params.length + 1} OR nama_pelanggan LIKE $${params.length + 1})`);
    params.push(`%${search}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRows: { count: number }[] = await db.select(
    `SELECT COUNT(*) as count FROM penjualan ${where}`,
    params
  );

  const data: Sale[] = await db.select(
    `SELECT * FROM penjualan ${where} ORDER BY dibuat_pada DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { data, total: countRows[0].count };
}

export async function getSaleItems(saleId: number): Promise<SaleItem[]> {
  const db = await getDb();
  return await db.select(
    "SELECT * FROM item_penjualan WHERE penjualan_id = $1",
    [saleId]
  );
}

export async function getSaleDebts(): Promise<SaleDebt[]> {
  const db = await getDb();
  return await db.select(
    `SELECT p.id, p.nomor_faktur, p.nama_pelanggan, p.total, p.dibayar,
       COALESCE(pay.total_bayar, 0) as total_pembayaran,
       (p.total - p.dibayar - COALESCE(pay.total_bayar, 0)) as sisa,
       p.dibuat_pada
     FROM penjualan p
     LEFT JOIN (SELECT penjualan_id, SUM(jumlah) as total_bayar FROM pembayaran_penjualan GROUP BY penjualan_id) pay
       ON pay.penjualan_id = p.id
     WHERE (p.total - p.dibayar - COALESCE(pay.total_bayar, 0)) > 0
     ORDER BY p.dibuat_pada DESC`
  );
}

export async function getSalePayments(saleId: number): Promise<Payment[]> {
  const db = await getDb();
  return await db.select(
    "SELECT * FROM pembayaran_penjualan WHERE penjualan_id = $1 ORDER BY dibuat_pada DESC",
    [saleId]
  );
}

export async function addSalePayment(saleId: number, jumlah: number, catatan?: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO pembayaran_penjualan (penjualan_id, jumlah, catatan) VALUES ($1, $2, $3)",
    [saleId, jumlah, catatan || null]
  );
}

export async function getSaleHistoryStats(startDate?: number, endDate?: number) {
  const db = await getDb();
  let where = "";
  const params: number[] = [];

  if (startDate && endDate) {
    where = "WHERE dibuat_pada >= $1 AND dibuat_pada <= $2";
    params.push(startDate, endDate);
  }

  const rows: { count: number; total: number; avg: number }[] = await db.select(
    `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total, COALESCE(AVG(total), 0) as avg FROM penjualan ${where}`,
    params
  );

  return { count: rows[0].count, total: rows[0].total, avg: Math.round(rows[0].avg) };
}

export type ChartGroupBy = "day" | "week" | "month" | "year";

export const GROUP_SQL: Record<ChartGroupBy, string> = {
  day: "date(dibuat_pada, 'unixepoch', 'localtime')",
  week: "strftime('%Y-W%W', dibuat_pada, 'unixepoch', 'localtime')",
  month: "strftime('%Y-%m', dibuat_pada, 'unixepoch', 'localtime')",
  year: "strftime('%Y', dibuat_pada, 'unixepoch', 'localtime')",
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export function formatGroupLabel(key: string, groupBy: ChartGroupBy): string {
  if (groupBy === "day") {
    const d = new Date(key);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  }
  if (groupBy === "week") {
    return `W${key.split("W")[1]}`;
  }
  if (groupBy === "month") {
    const [y, m] = key.split("-");
    return `${MONTH_NAMES[parseInt(m) - 1]} ${y.slice(2)}`;
  }
  return key;
}

export async function getSaleHistoryDaily(startDate?: number, endDate?: number, groupBy: ChartGroupBy = "day"): Promise<{ tanggal: string; total: number }[]> {
  const db = await getDb();
  let where = "";
  const params: number[] = [];

  if (startDate && endDate) {
    where = "WHERE dibuat_pada >= $1 AND dibuat_pada <= $2";
    params.push(startDate, endDate);
  }

  const groupExpr = GROUP_SQL[groupBy];
  const rows: { grp: string; total: number }[] = await db.select(
    `SELECT ${groupExpr} as grp, COALESCE(SUM(total), 0) as total
     FROM penjualan ${where}
     GROUP BY grp ORDER BY grp`,
    params
  );

  return rows.map((r) => ({ tanggal: formatGroupLabel(r.grp, groupBy), total: r.total }));
}

export async function getSaleHistoryTopProducts(startDate?: number, endDate?: number, limit: number = 5): Promise<{ nama: string; jumlah: number; total: number }[]> {
  const db = await getDb();
  let where = "";
  const params: number[] = [];

  if (startDate && endDate) {
    where = "WHERE p.dibuat_pada >= $1 AND p.dibuat_pada <= $2";
    params.push(startDate, endDate);
  }

  return await db.select(
    `SELECT ip.nama_produk as nama, SUM(ip.jumlah) as jumlah, SUM(ip.subtotal) as total
     FROM item_penjualan ip
     JOIN penjualan p ON ip.penjualan_id = p.id
     ${where}
     GROUP BY ip.produk_id
     ORDER BY total DESC
     LIMIT $${params.length + 1}`,
    [...params, limit]
  );
}

export async function getReturnedQtyMap(saleId: number): Promise<Record<number, number>> {
  const db = await getDb();
  const rows: { produk_id: number; total_qty: number }[] = await db.select(
    `SELECT ir.produk_id, SUM(ir.jumlah) as total_qty
     FROM item_retur_penjualan ir
     JOIN retur_penjualan r ON ir.retur_id = r.id
     WHERE r.penjualan_id = $1
     GROUP BY ir.produk_id`,
    [saleId]
  );
  const map: Record<number, number> = {};
  for (const r of rows) map[r.produk_id] = r.total_qty;
  return map;
}

export async function createSaleReturn(
  saleId: number,
  items: { produk_id: number; nama_produk: string; jumlah: number; harga_satuan: number }[],
  alasan?: string
): Promise<number> {
  const db = await getDb();
  const total = items.reduce((sum, i) => sum + i.jumlah * i.harga_satuan, 0);

  const result = await db.execute(
    "INSERT INTO retur_penjualan (penjualan_id, total, alasan) VALUES ($1, $2, $3)",
    [saleId, total, alasan || null]
  );
  const returId = result.lastInsertId ?? 0;

  for (const item of items) {
    await db.execute(
      `INSERT INTO item_retur_penjualan (retur_id, produk_id, nama_produk, jumlah, harga_satuan, subtotal)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [returId, item.produk_id, item.nama_produk, item.jumlah, item.harga_satuan, item.jumlah * item.harga_satuan]
    );
    await db.execute(
      "UPDATE produk SET stok = stok + $1, diperbarui_pada = strftime('%s','now') WHERE id = $2",
      [item.jumlah, item.produk_id]
    );
  }

  return returId;
}

export async function getSaleReturns(saleId: number): Promise<ReturPenjualan[]> {
  const db = await getDb();
  return await db.select(
    "SELECT * FROM retur_penjualan WHERE penjualan_id = $1 ORDER BY dibuat_pada DESC",
    [saleId]
  );
}

export async function getReturItems(returId: number): Promise<ReturItem[]> {
  const db = await getDb();
  return await db.select(
    "SELECT * FROM item_retur_penjualan WHERE retur_id = $1",
    [returId]
  );
}
