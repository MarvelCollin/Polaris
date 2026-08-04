import { getDb } from "../database";
import { Category } from "../types";

export async function getCategories(): Promise<Category[]> {
  const db = await getDb();
  return await db.select("SELECT * FROM kategori ORDER BY nama");
}

export async function createCategory(nama: string): Promise<number> {
  const db = await getDb();
  const result = await db.execute("INSERT INTO kategori (nama) VALUES ($1)", [nama]);
  return result.lastInsertId ?? 0;
}

export async function updateCategory(id: number, nama: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE kategori SET nama = $1 WHERE id = $2", [nama, id]);
}

export async function deleteCategory(id: number): Promise<void> {
  const db = await getDb();
  const products: { count: number }[] = await db.select(
    "SELECT COUNT(*) as count FROM produk WHERE kategori_id = $1",
    [id]
  );
  if (products[0].count > 0) {
    throw new Error("Kategori tidak dapat dihapus karena masih memiliki produk");
  }
  await db.execute("DELETE FROM kategori WHERE id = $1", [id]);
}
