import { getDb } from "../database";
import { Purchase, PurchaseItem, PurchaseEntry } from "../types";

export async function createPurchase(
  supplier: string,
  referensiFaktur: string | null,
  items: PurchaseEntry[]
): Promise<number> {
  const db = await getDb();
  const total = items.reduce((sum, item) => sum + item.jumlah * item.harga, 0);

  const result = await db.execute(
    "INSERT INTO pembelian (supplier, referensi_faktur, total) VALUES ($1, $2, $3)",
    [supplier, referensiFaktur, total]
  );
  const purchaseId = result.lastInsertId ?? 0;

  for (const item of items) {
    await db.execute(
      `INSERT INTO item_pembelian (pembelian_id, produk_id, nama_produk, jumlah, harga_satuan, subtotal)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [purchaseId, item.produk_id, item.nama, item.jumlah, item.harga, item.jumlah * item.harga]
    );
    await db.execute(
      "UPDATE produk SET stok = stok + $1, diperbarui_pada = strftime('%s','now') WHERE id = $2",
      [item.jumlah, item.produk_id]
    );
  }

  return purchaseId;
}

export async function getPurchases(
  startDate?: number,
  endDate?: number,
  limit: number = 50,
  offset: number = 0
): Promise<{ data: Purchase[]; total: number }> {
  const db = await getDb();
  let where = "";
  const params: number[] = [];

  if (startDate && endDate) {
    where = "WHERE dibuat_pada >= $1 AND dibuat_pada <= $2";
    params.push(startDate, endDate);
  }

  const countRows: { count: number }[] = await db.select(
    `SELECT COUNT(*) as count FROM pembelian ${where}`,
    params
  );

  const data: Purchase[] = await db.select(
    `SELECT * FROM pembelian ${where} ORDER BY dibuat_pada DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { data, total: countRows[0].count };
}

export async function getPurchaseItems(purchaseId: number): Promise<PurchaseItem[]> {
  const db = await getDb();
  return await db.select(
    "SELECT * FROM item_pembelian WHERE pembelian_id = $1",
    [purchaseId]
  );
}

export async function getPurchaseHistoryStats(startDate?: number, endDate?: number) {
  const db = await getDb();
  let where = "";
  const params: number[] = [];

  if (startDate && endDate) {
    where = "WHERE dibuat_pada >= $1 AND dibuat_pada <= $2";
    params.push(startDate, endDate);
  }

  const rows: { count: number; total: number; avg: number }[] = await db.select(
    `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total, COALESCE(AVG(total), 0) as avg FROM pembelian ${where}`,
    params
  );

  return { count: rows[0].count, total: rows[0].total, avg: Math.round(rows[0].avg) };
}

export async function getPurchaseHistoryDaily(startDate?: number, endDate?: number): Promise<{ tanggal: string; total: number }[]> {
  const db = await getDb();
  let where = "WHERE 1=1";
  const params: number[] = [];

  if (startDate && endDate) {
    where = "WHERE dibuat_pada >= $1 AND dibuat_pada <= $2";
    params.push(startDate, endDate);
  }

  const rows: { day: string; total: number }[] = await db.select(
    `SELECT date(dibuat_pada, 'unixepoch', 'localtime') as day, COALESCE(SUM(total), 0) as total
     FROM pembelian ${where}
     GROUP BY day ORDER BY day`,
    params
  );

  return rows.map((r) => {
    const d = new Date(r.day);
    return { tanggal: `${d.getDate()}/${d.getMonth() + 1}`, total: r.total };
  });
}

export async function getPurchaseHistoryTopProducts(startDate?: number, endDate?: number, limit: number = 5): Promise<{ nama: string; jumlah: number; total: number }[]> {
  const db = await getDb();
  let where = "";
  const params: number[] = [];

  if (startDate && endDate) {
    where = "WHERE p.dibuat_pada >= $1 AND p.dibuat_pada <= $2";
    params.push(startDate, endDate);
  }

  return await db.select(
    `SELECT ip.nama_produk as nama, SUM(ip.jumlah) as jumlah, SUM(ip.subtotal) as total
     FROM item_pembelian ip
     JOIN pembelian p ON ip.pembelian_id = p.id
     ${where}
     GROUP BY ip.produk_id
     ORDER BY total DESC
     LIMIT $${params.length + 1}`,
    [...params, limit]
  );
}

export async function getPurchaseHistoryTopSuppliers(startDate?: number, endDate?: number, limit: number = 5): Promise<{ supplier: string; count: number; total: number }[]> {
  const db = await getDb();
  let where = "";
  const params: number[] = [];

  if (startDate && endDate) {
    where = "WHERE dibuat_pada >= $1 AND dibuat_pada <= $2";
    params.push(startDate, endDate);
  }

  return await db.select(
    `SELECT supplier, COUNT(*) as count, COALESCE(SUM(total), 0) as total
     FROM pembelian ${where}
     GROUP BY supplier
     ORDER BY total DESC
     LIMIT $${params.length + 1}`,
    [...params, limit]
  );
}
