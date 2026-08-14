import { getDb, syncDb } from "../database";
import { Customer, CustomerAddress, CustomerPrice } from "../types";

export async function getCustomers(search?: string): Promise<Customer[]> {
  const db = await getDb();
  if (search) {
    return await db.select(
      "SELECT * FROM pelanggan WHERE nama LIKE $1 OR telepon LIKE $1 ORDER BY nama",
      [`%${search}%`]
    );
  }
  return await db.select("SELECT * FROM pelanggan ORDER BY nama");
}

export async function createCustomer(data: { nama: string; telepon: string | null; alamat: string | null }): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO pelanggan (nama, telepon, alamat) VALUES ($1, $2, $3)",
    [data.nama, data.telepon, data.alamat]
  );
  syncDb();
  return result.lastInsertId ?? 0;
}

export async function updateCustomer(id: number, data: { nama: string; telepon: string | null; alamat: string | null }): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE pelanggan SET nama=$1, telepon=$2, alamat=$3 WHERE id=$4",
    [data.nama, data.telepon, data.alamat, id]
  );
  syncDb();
}

export async function deleteCustomer(id: number): Promise<void> {
  const db = await getDb();
  const sales: { count: number }[] = await db.select(
    "SELECT COUNT(*) as count FROM penjualan WHERE pelanggan_id = $1",
    [id]
  );
  if (sales[0].count > 0) {
    throw new Error("Pelanggan tidak dapat dihapus karena sudah memiliki transaksi");
  }
  await db.execute("DELETE FROM pelanggan WHERE id = $1", [id]);
  syncDb();
}

export async function getCustomerAddresses(pelangganId: number): Promise<CustomerAddress[]> {
  const db = await getDb();
  return await db.select(
    "SELECT * FROM alamat_pelanggan WHERE pelanggan_id = $1 ORDER BY id",
    [pelangganId]
  );
}

export async function addCustomerAddress(pelangganId: number, label: string, alamat: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO alamat_pelanggan (pelanggan_id, label, alamat) VALUES ($1, $2, $3)",
    [pelangganId, label, alamat]
  );
  syncDb();
}

export async function updateCustomerAddress(id: number, label: string, alamat: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE alamat_pelanggan SET label = $1, alamat = $2 WHERE id = $3",
    [label, alamat, id]
  );
  syncDb();
}

export async function deleteCustomerAddress(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM alamat_pelanggan WHERE id = $1", [id]);
  syncDb();
}

export async function getCustomerPrices(pelangganId: number): Promise<CustomerPrice[]> {
  const db = await getDb();
  return await db.select(
    `SELECT hp.*, p.nama as nama_produk, p.kode as kode_produk, p.harga_jual as harga_jual_default
     FROM harga_pelanggan hp
     JOIN produk p ON hp.produk_id = p.id
     WHERE hp.pelanggan_id = $1
     ORDER BY p.nama`,
    [pelangganId]
  );
}

export async function setCustomerPrice(pelangganId: number, produkId: number, harga: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO harga_pelanggan (pelanggan_id, produk_id, harga) VALUES ($1, $2, $3)
     ON CONFLICT(pelanggan_id, produk_id) DO UPDATE SET harga = $3`,
    [pelangganId, produkId, harga]
  );
  syncDb();
}

export async function removeCustomerPrice(pelangganId: number, produkId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM harga_pelanggan WHERE pelanggan_id = $1 AND produk_id = $2",
    [pelangganId, produkId]
  );
  syncDb();
}

export async function getCustomerPriceMap(pelangganId: number): Promise<Record<number, number>> {
  const db = await getDb();
  const rows: { produk_id: number; harga: number }[] = await db.select(
    "SELECT produk_id, harga FROM harga_pelanggan WHERE pelanggan_id = $1",
    [pelangganId]
  );
  const map: Record<number, number> = {};
  for (const row of rows) {
    map[row.produk_id] = row.harga;
  }
  return map;
}
