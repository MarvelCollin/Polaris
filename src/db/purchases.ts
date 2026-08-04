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
