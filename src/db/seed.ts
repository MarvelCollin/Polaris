import { getDb } from "../database";

export async function seedDatabase() {
  const db = await getDb();

  const categories = [
    "Semen",
    "Besi & Baja",
    "Kayu",
    "Cat",
    "Keramik & Granit",
    "Pipa & Sanitasi",
    "Listrik",
    "Atap",
    "Pasir & Batu",
    "Alat Pertukangan",
    "Lem & Perekat",
    "Pintu & Jendela",
    "Plafon & Gypsum",
    "Waterproofing",
    "Baut, Mur & Paku",
    "Kunci & Handle",
    "Tangga & Scaffolding",
    "Alat Ukur",
    "Kawat & Jaring",
    "Talang & Saluran",
  ];

  const categoryIds: Record<string, number> = {};
  for (const nama of categories) {
    const existing: { id: number }[] = await db.select(
      "SELECT id FROM kategori WHERE nama = $1", [nama]
    );
    if (existing.length > 0) {
      categoryIds[nama] = existing[0].id;
    } else {
      const result = await db.execute(
        "INSERT INTO kategori (nama) VALUES ($1)", [nama]
      );
      categoryIds[nama] = result.lastInsertId ?? 0;
    }
  }

  const existingProducts: { count: number }[] = await db.select(
    "SELECT COUNT(*) as count FROM produk"
  );
  if (existingProducts[0].count > 0) return;

  const products = [
    { kode: "SMN-001", nama: "Semen Tiga Roda 50kg", kategori: "Semen", satuan: "sak", harga_beli: 52000, harga_jual: 58000, stok: 0, stok_minimum: 20 },
    { kode: "BSI-001", nama: "Besi Beton 8mm", kategori: "Besi & Baja", satuan: "batang", harga_beli: 45000, harga_jual: 55000, stok: 0, stok_minimum: 30 },
    { kode: "CAT-001", nama: "Cat Dulux Weathershield 5kg", kategori: "Cat", satuan: "kaleng", harga_beli: 180000, harga_jual: 220000, stok: 0, stok_minimum: 5 },
    { kode: "PPA-001", nama: "Pipa PVC 3/4 inch", kategori: "Pipa & Sanitasi", satuan: "batang", harga_beli: 18000, harga_jual: 25000, stok: 0, stok_minimum: 15 },
    { kode: "BMR-001", nama: "Paku 2 inch 1kg", kategori: "Baut, Mur & Paku", satuan: "kg", harga_beli: 18000, harga_jual: 25000, stok: 0, stok_minimum: 10 },
  ];

  for (const p of products) {
    await db.execute(
      `INSERT INTO produk (kode, nama, kategori_id, satuan, harga_beli, harga_jual, stok, stok_minimum)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [p.kode, p.nama, categoryIds[p.kategori], p.satuan, p.harga_beli, p.harga_jual, p.stok, p.stok_minimum]
    );
  }
}
