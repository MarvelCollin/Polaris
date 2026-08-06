import { getDb } from "../database";
import { Purchase, PurchaseItem, PurchaseEntry, PurchaseDebt, Payment, ReturPembelian, ReturItem } from "../types";
import { type ChartGroupBy, GROUP_SQL, formatGroupLabel } from "./sales";
import { toUnixTimestamp } from "../lib/utils";

export async function getDistinctSuppliers(): Promise<string[]> {
  const db = await getDb();
  const rows: { supplier: string }[] = await db.select(
    "SELECT supplier FROM pembelian GROUP BY UPPER(supplier) ORDER BY supplier"
  );
  return rows.map((r) => r.supplier);
}

async function generatePurchaseNumber(): Promise<string> {
  const db = await getDb();
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const startOfDay = toUnixTimestamp(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const endOfDay = startOfDay + 86400;

  const rows: { count: number }[] = await db.select(
    "SELECT COUNT(*) as count FROM pembelian WHERE dibuat_pada >= $1 AND dibuat_pada < $2",
    [startOfDay, endOfDay]
  );
  const seq = (rows[0].count + 1).toString().padStart(4, "0");
  return `PO-${dateStr}-${seq}`;
}

export async function createPurchase(
  supplier: string,
  items: PurchaseEntry[],
  dibayar?: number
): Promise<number> {
  const db = await getDb();
  const total = items.reduce((sum, item) => sum + item.jumlah * item.harga, 0);
  const paid = dibayar ?? total;
  const nomor = await generatePurchaseNumber();

  const produkIds = items.map((i) => i.produk_id);
  const placeholders = produkIds.map((_, i) => `$${i + 1}`).join(",");
  const produkRows: { id: number; stok: number; harga_beli: number }[] = await db.select(
    `SELECT id, stok, harga_beli FROM produk WHERE id IN (${placeholders})`,
    produkIds
  );
  const produkMap = new Map(produkRows.map((r) => [r.id, r]));

  await db.execute("BEGIN TRANSACTION");
  try {
    const result = await db.execute(
      "INSERT INTO pembelian (supplier, referensi_faktur, total, dibayar) VALUES ($1, $2, $3, $4)",
      [supplier, nomor, total, paid]
    );
    const purchaseId = result.lastInsertId ?? 0;

    for (const item of items) {
      await db.execute(
        `INSERT INTO item_pembelian (pembelian_id, produk_id, nama_produk, jumlah, harga_satuan, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [purchaseId, item.produk_id, item.nama, item.jumlah, item.harga, item.jumlah * item.harga]
      );

      const produk = produkMap.get(item.produk_id);
      if (produk) {
        const newHpp = (produk.stok * produk.harga_beli + item.jumlah * item.harga) / (produk.stok + item.jumlah);
        await db.execute(
          "UPDATE produk SET stok = stok + $1, harga_beli = $2, diperbarui_pada = strftime('%s','now') WHERE id = $3",
          [item.jumlah, Math.round(newHpp), item.produk_id]
        );
        produk.stok += item.jumlah;
        produk.harga_beli = Math.round(newHpp);
      } else {
        await db.execute(
          "UPDATE produk SET stok = stok + $1, diperbarui_pada = strftime('%s','now') WHERE id = $2",
          [item.jumlah, item.produk_id]
        );
      }
    }

    await db.execute("COMMIT");
    return purchaseId;
  } catch (e) {
    await db.execute("ROLLBACK");
    throw e;
  }
}

export async function getPurchases(
  startDate?: number,
  endDate?: number,
  limit: number = 50,
  offset: number = 0,
  search?: string
): Promise<{ data: Purchase[]; total: number }> {
  const db = await getDb();
  const conditions: string[] = [];
  const params: (number | string)[] = [];

  if (startDate && endDate) {
    conditions.push(`p.dibuat_pada >= $${params.length + 1} AND p.dibuat_pada <= $${params.length + 2}`);
    params.push(startDate, endDate);
  }
  if (search) {
    conditions.push(`(p.supplier LIKE $${params.length + 1} OR p.referensi_faktur LIKE $${params.length + 1})`);
    params.push(`%${search}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRows: { count: number }[] = await db.select(
    `SELECT COUNT(*) as count FROM pembelian p ${where}`,
    params
  );

  const data: Purchase[] = await db.select(
    `SELECT p.*, COALESCE(pay.total_bayar, 0) as total_pembayaran,
       (p.total - p.dibayar - COALESCE(pay.total_bayar, 0)) as sisa
     FROM pembelian p
     LEFT JOIN (SELECT pembelian_id, SUM(jumlah) as total_bayar FROM pembayaran_pembelian GROUP BY pembelian_id) pay
       ON pay.pembelian_id = p.id
     ${where}
     ORDER BY p.dibuat_pada DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
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

export async function getPurchaseDebts(): Promise<PurchaseDebt[]> {
  const db = await getDb();
  return await db.select(
    `SELECT p.id, p.supplier, p.referensi_faktur, p.total, p.dibayar,
       COALESCE(pay.total_bayar, 0) as total_pembayaran,
       (p.total - p.dibayar - COALESCE(pay.total_bayar, 0)) as sisa,
       p.dibuat_pada
     FROM pembelian p
     LEFT JOIN (SELECT pembelian_id, SUM(jumlah) as total_bayar FROM pembayaran_pembelian GROUP BY pembelian_id) pay
       ON pay.pembelian_id = p.id
     WHERE (p.total - p.dibayar - COALESCE(pay.total_bayar, 0)) > 0
     ORDER BY p.dibuat_pada DESC`
  );
}

export async function getPurchasePayments(purchaseId: number): Promise<Payment[]> {
  const db = await getDb();
  return await db.select(
    "SELECT * FROM pembayaran_pembelian WHERE pembelian_id = $1 ORDER BY dibuat_pada DESC",
    [purchaseId]
  );
}

export async function addPurchasePayment(purchaseId: number, jumlah: number, catatan?: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO pembayaran_pembelian (pembelian_id, jumlah, catatan) VALUES ($1, $2, $3)",
    [purchaseId, jumlah, catatan || null]
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

export async function getPurchaseHistoryDaily(startDate?: number, endDate?: number, groupBy: ChartGroupBy = "day"): Promise<{ tanggal: string; total: number }[]> {
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
     FROM pembelian ${where}
     GROUP BY grp ORDER BY grp`,
    params
  );

  return rows.map((r) => ({ tanggal: formatGroupLabel(r.grp, groupBy), total: r.total }));
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

export async function getReturnedQtyMapPurchase(purchaseId: number): Promise<Record<number, number>> {
  const db = await getDb();
  const rows: { produk_id: number; total_qty: number }[] = await db.select(
    `SELECT ir.produk_id, SUM(ir.jumlah) as total_qty
     FROM item_retur_pembelian ir
     JOIN retur_pembelian r ON ir.retur_id = r.id
     WHERE r.pembelian_id = $1
     GROUP BY ir.produk_id`,
    [purchaseId]
  );
  const map: Record<number, number> = {};
  for (const r of rows) map[r.produk_id] = r.total_qty;
  return map;
}

export async function createPurchaseReturn(
  purchaseId: number,
  items: { produk_id: number; nama_produk: string; jumlah: number; harga_satuan: number }[],
  alasan?: string
): Promise<number> {
  const db = await getDb();
  const total = items.reduce((sum, i) => sum + i.jumlah * i.harga_satuan, 0);

  await db.execute("BEGIN TRANSACTION");
  try {
    const result = await db.execute(
      "INSERT INTO retur_pembelian (pembelian_id, total, alasan) VALUES ($1, $2, $3)",
      [purchaseId, total, alasan || null]
    );
    const returId = result.lastInsertId ?? 0;

    for (const item of items) {
      await db.execute(
        `INSERT INTO item_retur_pembelian (retur_id, produk_id, nama_produk, jumlah, harga_satuan, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [returId, item.produk_id, item.nama_produk, item.jumlah, item.harga_satuan, item.jumlah * item.harga_satuan]
      );
      await db.execute(
        "UPDATE produk SET stok = stok - $1, diperbarui_pada = strftime('%s','now') WHERE id = $2",
        [item.jumlah, item.produk_id]
      );
    }

    await db.execute("COMMIT");
    return returId;
  } catch (e) {
    await db.execute("ROLLBACK");
    throw e;
  }
}

export async function getPurchaseReturns(purchaseId: number): Promise<ReturPembelian[]> {
  const db = await getDb();
  return await db.select(
    "SELECT * FROM retur_pembelian WHERE pembelian_id = $1 ORDER BY dibuat_pada DESC",
    [purchaseId]
  );
}

export async function getPurchaseReturItems(returId: number): Promise<ReturItem[]> {
  const db = await getDb();
  return await db.select(
    "SELECT * FROM item_retur_pembelian WHERE retur_id = $1",
    [returId]
  );
}
