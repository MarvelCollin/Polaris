import { getDb } from "../database";

export async function seedDatabase() {
  const db = await getDb();

  const existing: { count: number }[] = await db.select(
    "SELECT COUNT(*) as count FROM kategori"
  );
  if (existing[0].count > 0) return;

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
  ];

  const categoryIds: Record<string, number> = {};
  for (const nama of categories) {
    const result = await db.execute(
      "INSERT INTO kategori (nama) VALUES ($1)",
      [nama]
    );
    categoryIds[nama] = result.lastInsertId ?? 0;
  }

  const products = [
    { kode: "SMN-001", nama: "Semen Tiga Roda 50kg", kategori: "Semen", satuan: "sak", harga_beli: 52000, harga_jual: 58000, stok: 150, stok_minimum: 20 },
    { kode: "SMN-002", nama: "Semen Holcim 50kg", kategori: "Semen", satuan: "sak", harga_beli: 50000, harga_jual: 56000, stok: 100, stok_minimum: 20 },
    { kode: "SMN-003", nama: "Semen Padang 40kg", kategori: "Semen", satuan: "sak", harga_beli: 42000, harga_jual: 48000, stok: 80, stok_minimum: 15 },
    { kode: "BSI-001", nama: "Besi Beton 8mm", kategori: "Besi & Baja", satuan: "batang", harga_beli: 45000, harga_jual: 55000, stok: 200, stok_minimum: 30 },
    { kode: "BSI-002", nama: "Besi Beton 10mm", kategori: "Besi & Baja", satuan: "batang", harga_beli: 65000, harga_jual: 78000, stok: 150, stok_minimum: 25 },
    { kode: "BSI-003", nama: "Besi Beton 12mm", kategori: "Besi & Baja", satuan: "batang", harga_beli: 95000, harga_jual: 115000, stok: 5, stok_minimum: 20 },
    { kode: "BSI-004", nama: "Kawat Bendrat 1kg", kategori: "Besi & Baja", satuan: "kg", harga_beli: 15000, harga_jual: 20000, stok: 50, stok_minimum: 10 },
    { kode: "KYU-001", nama: "Kayu Meranti 4x6", kategori: "Kayu", satuan: "batang", harga_beli: 35000, harga_jual: 45000, stok: 100, stok_minimum: 15 },
    { kode: "KYU-002", nama: "Kayu Kamper 6x12", kategori: "Kayu", satuan: "batang", harga_beli: 120000, harga_jual: 150000, stok: 40, stok_minimum: 10 },
    { kode: "KYU-003", nama: "Triplek 9mm 122x244", kategori: "Kayu", satuan: "lembar", harga_beli: 95000, harga_jual: 120000, stok: 30, stok_minimum: 5 },
    { kode: "CAT-001", nama: "Cat Dulux Weathershield 5kg", kategori: "Cat", satuan: "kaleng", harga_beli: 180000, harga_jual: 220000, stok: 25, stok_minimum: 5 },
    { kode: "CAT-002", nama: "Cat Nippon Paint Vinilex 5kg", kategori: "Cat", satuan: "kaleng", harga_beli: 85000, harga_jual: 110000, stok: 35, stok_minimum: 8 },
    { kode: "CAT-003", nama: "Cat Avian 1kg", kategori: "Cat", satuan: "kaleng", harga_beli: 25000, harga_jual: 35000, stok: 50, stok_minimum: 10 },
    { kode: "KRM-001", nama: "Keramik 40x40 Putih", kategori: "Keramik & Granit", satuan: "dus", harga_beli: 45000, harga_jual: 58000, stok: 60, stok_minimum: 10 },
    { kode: "KRM-002", nama: "Keramik 60x60 Cream", kategori: "Keramik & Granit", satuan: "dus", harga_beli: 75000, harga_jual: 95000, stok: 40, stok_minimum: 8 },
    { kode: "KRM-003", nama: "Granit 60x60 Hitam", kategori: "Keramik & Granit", satuan: "dus", harga_beli: 120000, harga_jual: 155000, stok: 3, stok_minimum: 5 },
    { kode: "PPA-001", nama: "Pipa PVC 3/4 inch", kategori: "Pipa & Sanitasi", satuan: "batang", harga_beli: 18000, harga_jual: 25000, stok: 100, stok_minimum: 15 },
    { kode: "PPA-002", nama: "Pipa PVC 4 inch", kategori: "Pipa & Sanitasi", satuan: "batang", harga_beli: 65000, harga_jual: 85000, stok: 50, stok_minimum: 10 },
    { kode: "PPA-003", nama: "Kran Air Toto", kategori: "Pipa & Sanitasi", satuan: "buah", harga_beli: 85000, harga_jual: 120000, stok: 20, stok_minimum: 5 },
    { kode: "LST-001", nama: "Kabel NYM 2x1.5mm 50m", kategori: "Listrik", satuan: "roll", harga_beli: 250000, harga_jual: 310000, stok: 15, stok_minimum: 3 },
    { kode: "LST-002", nama: "Saklar Broco", kategori: "Listrik", satuan: "buah", harga_beli: 12000, harga_jual: 18000, stok: 60, stok_minimum: 10 },
    { kode: "LST-003", nama: "Stop Kontak Panasonic", kategori: "Listrik", satuan: "buah", harga_beli: 25000, harga_jual: 35000, stok: 40, stok_minimum: 8 },
    { kode: "ATP-001", nama: "Genteng Metal", kategori: "Atap", satuan: "lembar", harga_beli: 45000, harga_jual: 58000, stok: 100, stok_minimum: 20 },
    { kode: "ATP-002", nama: "Spandek 6m", kategori: "Atap", satuan: "lembar", harga_beli: 85000, harga_jual: 105000, stok: 50, stok_minimum: 10 },
    { kode: "ATP-003", nama: "Asbes Gelombang 3m", kategori: "Atap", satuan: "lembar", harga_beli: 55000, harga_jual: 70000, stok: 2, stok_minimum: 10 },
    { kode: "PSR-001", nama: "Pasir Cor per m3", kategori: "Pasir & Batu", satuan: "m3", harga_beli: 250000, harga_jual: 320000, stok: 20, stok_minimum: 5 },
    { kode: "PSR-002", nama: "Batu Split per m3", kategori: "Pasir & Batu", satuan: "m3", harga_beli: 280000, harga_jual: 350000, stok: 15, stok_minimum: 5 },
    { kode: "PSR-003", nama: "Bata Merah", kategori: "Pasir & Batu", satuan: "buah", harga_beli: 800, harga_jual: 1200, stok: 5000, stok_minimum: 500 },
    { kode: "ALT-001", nama: "Palu Besi 1kg", kategori: "Alat Pertukangan", satuan: "buah", harga_beli: 35000, harga_jual: 50000, stok: 15, stok_minimum: 3 },
    { kode: "ALT-002", nama: "Gergaji Besi", kategori: "Alat Pertukangan", satuan: "buah", harga_beli: 25000, harga_jual: 38000, stok: 10, stok_minimum: 3 },
  ];

  for (const p of products) {
    await db.execute(
      `INSERT INTO produk (kode, nama, kategori_id, satuan, harga_beli, harga_jual, stok, stok_minimum)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [p.kode, p.nama, categoryIds[p.kategori], p.satuan, p.harga_beli, p.harga_jual, p.stok, p.stok_minimum]
    );
  }

  const semenId = categoryIds["Semen"];
  const besiId = categoryIds["Besi & Baja"];

  const produkSemen: { id: number }[] = await db.select(
    "SELECT id FROM produk WHERE kategori_id = $1 LIMIT 2",
    [semenId]
  );
  const produkBesi: { id: number }[] = await db.select(
    "SELECT id FROM produk WHERE kategori_id = $1 LIMIT 2",
    [besiId]
  );

  const now = Math.floor(Date.now() / 1000);
  const oneDay = 86400;

  const sales = [
    {
      nomor: "INV-20260801-0001",
      total: 406000,
      dibayar: 410000,
      kembalian: 4000,
      waktu: now - oneDay * 3,
      items: [
        { produk_id: produkSemen[0].id, nama: "Semen Tiga Roda 50kg", jumlah: 5, harga: 58000 },
        { produk_id: produkBesi[0].id, nama: "Besi Beton 8mm", jumlah: 2, harga: 55000 },
      ],
    },
    {
      nomor: "INV-20260802-0001",
      total: 168000,
      dibayar: 170000,
      kembalian: 2000,
      waktu: now - oneDay * 2,
      items: [
        { produk_id: produkSemen[1].id, nama: "Semen Holcim 50kg", jumlah: 3, harga: 56000 },
      ],
    },
    {
      nomor: "INV-20260803-0001",
      total: 234000,
      dibayar: 250000,
      kembalian: 16000,
      waktu: now - oneDay,
      items: [
        { produk_id: produkBesi[1].id, nama: "Besi Beton 10mm", jumlah: 3, harga: 78000 },
      ],
    },
  ];

  for (const sale of sales) {
    const result = await db.execute(
      "INSERT INTO penjualan (nomor_faktur, total, dibayar, kembalian, dibuat_pada) VALUES ($1, $2, $3, $4, $5)",
      [sale.nomor, sale.total, sale.dibayar, sale.kembalian, sale.waktu]
    );
    const saleId = result.lastInsertId ?? 0;
    for (const item of sale.items) {
      await db.execute(
        `INSERT INTO item_penjualan (penjualan_id, produk_id, nama_produk, jumlah, harga_satuan, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [saleId, item.produk_id, item.nama, item.jumlah, item.harga, item.jumlah * item.harga]
      );
    }
  }

  const purchases = [
    {
      supplier: "PT Semen Indonesia",
      referensi: "PO-2026-001",
      total: 5200000,
      waktu: now - oneDay * 5,
      items: [
        { produk_id: produkSemen[0].id, nama: "Semen Tiga Roda 50kg", jumlah: 100, harga: 52000 },
      ],
    },
    {
      supplier: "CV Baja Makmur",
      referensi: "PO-2026-002",
      total: 4500000,
      waktu: now - oneDay * 4,
      items: [
        { produk_id: produkBesi[0].id, nama: "Besi Beton 8mm", jumlah: 100, harga: 45000 },
      ],
    },
  ];

  for (const purchase of purchases) {
    const result = await db.execute(
      "INSERT INTO pembelian (supplier, referensi_faktur, total, dibuat_pada) VALUES ($1, $2, $3, $4)",
      [purchase.supplier, purchase.referensi, purchase.total, purchase.waktu]
    );
    const purchaseId = result.lastInsertId ?? 0;
    for (const item of purchase.items) {
      await db.execute(
        `INSERT INTO item_pembelian (pembelian_id, produk_id, nama_produk, jumlah, harga_satuan, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [purchaseId, item.produk_id, item.nama, item.jumlah, item.harga, item.jumlah * item.harga]
      );
    }
  }
}
