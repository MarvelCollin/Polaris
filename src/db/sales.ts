import { getDb } from "../database";
import { Sale, SaleItem, CartEntry } from "../types";

async function generateInvoiceNumber(): Promise<string> {
  const db = await getDb();
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const startOfDay = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000);
  const endOfDay = startOfDay + 86400;

  const rows: { count: number }[] = await db.select(
    "SELECT COUNT(*) as count FROM penjualan WHERE dibuat_pada >= $1 AND dibuat_pada < $2",
    [startOfDay, endOfDay]
  );
  const seq = (rows[0].count + 1).toString().padStart(4, "0");
  return `INV-${dateStr}-${seq}`;
}

export async function createSale(items: CartEntry[], dibayar: number): Promise<number> {
  const db = await getDb();
  const total = items.reduce((sum, item) => sum + item.jumlah * item.harga, 0);
  const kembalian = dibayar - total;
  const nomor = await generateInvoiceNumber();

  const result = await db.execute(
    "INSERT INTO penjualan (nomor_faktur, total, dibayar, kembalian) VALUES ($1, $2, $3, $4)",
    [nomor, total, dibayar, kembalian]
  );
  const saleId = result.lastInsertId ?? 0;

  for (const item of items) {
    await db.execute(
      `INSERT INTO item_penjualan (penjualan_id, produk_id, nama_produk, jumlah, harga_satuan, subtotal)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [saleId, item.produk_id, item.nama, item.jumlah, item.harga, item.jumlah * item.harga]
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
  offset: number = 0
): Promise<{ data: Sale[]; total: number }> {
  const db = await getDb();
  let where = "";
  const params: number[] = [];

  if (startDate && endDate) {
    where = "WHERE dibuat_pada >= $1 AND dibuat_pada <= $2";
    params.push(startDate, endDate);
  }

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
