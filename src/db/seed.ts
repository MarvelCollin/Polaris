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

  const produkIds: Record<string, number> = {};
  for (const p of products) {
    const result = await db.execute(
      `INSERT INTO produk (kode, nama, kategori_id, satuan, harga_beli, harga_jual, stok, stok_minimum)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [p.kode, p.nama, categoryIds[p.kategori], p.satuan, p.harga_beli, p.harga_jual, p.stok, p.stok_minimum]
    );
    produkIds[p.kode] = result.lastInsertId ?? 0;
  }

  const customerData = [
    { nama: "Pak Budi - Kontraktor", telepon: "081234567890", alamat: "Jl. Merdeka No. 10" },
    { nama: "CV Bangun Jaya", telepon: "082345678901", alamat: "Jl. Industri No. 5" },
    { nama: "Pak Hendra", telepon: "083456789012", alamat: null },
    { nama: "Ibu Sari - Renovasi", telepon: "084567890123", alamat: "Jl. Mawar No. 8" },
    { nama: "PT Griya Sentosa", telepon: "085678901234", alamat: "Jl. Sudirman No. 100" },
  ];

  const customerIds: number[] = [];
  for (const c of customerData) {
    const result = await db.execute(
      "INSERT INTO pelanggan (nama, telepon, alamat) VALUES ($1, $2, $3)",
      [c.nama, c.telepon, c.alamat]
    );
    customerIds.push(result.lastInsertId ?? 0);
  }

  const allProduk: { id: number; harga_jual: number }[] = await db.select(
    "SELECT id, harga_jual FROM produk LIMIT 10"
  );

  for (let i = 0; i < Math.min(5, allProduk.length); i++) {
    const p = allProduk[i];
    await db.execute(
      "INSERT INTO harga_pelanggan (pelanggan_id, produk_id, harga) VALUES ($1, $2, $3)",
      [customerIds[0], p.id, Math.round(p.harga_jual * 0.9)]
    );
  }

  for (let i = 0; i < Math.min(3, allProduk.length); i++) {
    const p = allProduk[i];
    await db.execute(
      "INSERT INTO harga_pelanggan (pelanggan_id, produk_id, harga) VALUES ($1, $2, $3)",
      [customerIds[1], p.id, Math.round(p.harga_jual * 0.85)]
    );
  }

  for (let i = 2; i < Math.min(6, allProduk.length); i++) {
    const p = allProduk[i];
    await db.execute(
      "INSERT INTO harga_pelanggan (pelanggan_id, produk_id, harga) VALUES ($1, $2, $3)",
      [customerIds[4], p.id, Math.round(p.harga_jual * 0.88)]
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const oneDay = 86400;

  const sales = [
    {
      nomor: "INV-20260715-0001", total: 1740000, dibayar: 1750000, kembalian: 10000,
      waktu: now - oneDay * 20, pelanggan_id: customerIds[0], nama_pelanggan: "Pak Budi - Kontraktor",
      items: [
        { produk_id: produkIds["SMN-001"], nama: "Semen Tiga Roda 50kg", jumlah: 20, harga: 52200 },
        { produk_id: produkIds["BSI-001"], nama: "Besi Beton 8mm", jumlah: 10, harga: 49500 },
      ],
    },
    {
      nomor: "INV-20260718-0001", total: 2850000, dibayar: 2850000, kembalian: 0,
      waktu: now - oneDay * 17, pelanggan_id: customerIds[1], nama_pelanggan: "CV Bangun Jaya",
      items: [
        { produk_id: produkIds["SMN-001"], nama: "Semen Tiga Roda 50kg", jumlah: 30, harga: 49300 },
        { produk_id: produkIds["BSI-002"], nama: "Besi Beton 10mm", jumlah: 15, harga: 66300 },
      ],
    },
    {
      nomor: "INV-20260720-0001", total: 475000, dibayar: 500000, kembalian: 25000,
      waktu: now - oneDay * 15, pelanggan_id: null, nama_pelanggan: null,
      items: [
        { produk_id: produkIds["KYU-001"], nama: "Kayu Meranti 4x6", jumlah: 5, harga: 45000 },
        { produk_id: produkIds["CAT-003"], nama: "Cat Avian 1kg", jumlah: 5, harga: 35000 },
        { produk_id: produkIds["PPA-001"], nama: "Pipa PVC 3/4 inch", jumlah: 4, harga: 25000 },
      ],
    },
    {
      nomor: "INV-20260722-0001", total: 870000, dibayar: 900000, kembalian: 30000,
      waktu: now - oneDay * 13, pelanggan_id: customerIds[3], nama_pelanggan: "Ibu Sari - Renovasi",
      items: [
        { produk_id: produkIds["KRM-001"], nama: "Keramik 40x40 Putih", jumlah: 10, harga: 58000 },
        { produk_id: produkIds["CAT-001"], nama: "Cat Dulux Weathershield 5kg", jumlah: 1, harga: 220000 },
        { produk_id: produkIds["LST-002"], nama: "Saklar Broco", jumlah: 4, harga: 18000 },
        { produk_id: produkIds["LST-003"], nama: "Stop Kontak Panasonic", jumlah: 2, harga: 35000 },
      ],
    },
    {
      nomor: "INV-20260725-0001", total: 3150000, dibayar: 3150000, kembalian: 0,
      waktu: now - oneDay * 10, pelanggan_id: customerIds[4], nama_pelanggan: "PT Griya Sentosa",
      items: [
        { produk_id: produkIds["SMN-002"], nama: "Semen Holcim 50kg", jumlah: 25, harga: 49280 },
        { produk_id: produkIds["BSI-001"], nama: "Besi Beton 8mm", jumlah: 20, harga: 48400 },
        { produk_id: produkIds["PSR-001"], nama: "Pasir Cor per m3", jumlah: 2, harga: 320000 },
      ],
    },
    {
      nomor: "INV-20260728-0001", total: 720000, dibayar: 750000, kembalian: 30000,
      waktu: now - oneDay * 7, pelanggan_id: null, nama_pelanggan: null,
      items: [
        { produk_id: produkIds["ATP-001"], nama: "Genteng Metal", jumlah: 10, harga: 58000 },
        { produk_id: produkIds["PPA-003"], nama: "Kran Air Toto", jumlah: 1, harga: 120000 },
        { produk_id: produkIds["ALT-001"], nama: "Palu Besi 1kg", jumlah: 1, harga: 50000 },
      ],
    },
    {
      nomor: "INV-20260730-0001", total: 1560000, dibayar: 1600000, kembalian: 40000,
      waktu: now - oneDay * 5, pelanggan_id: customerIds[0], nama_pelanggan: "Pak Budi - Kontraktor",
      items: [
        { produk_id: produkIds["SMN-003"], nama: "Semen Padang 40kg", jumlah: 15, harga: 43200 },
        { produk_id: produkIds["KYU-002"], nama: "Kayu Kamper 6x12", jumlah: 5, harga: 150000 },
        { produk_id: produkIds["BSI-004"], nama: "Kawat Bendrat 1kg", jumlah: 10, harga: 20000 },
      ],
    },
    {
      nomor: "INV-20260801-0001", total: 2280000, dibayar: 2300000, kembalian: 20000,
      waktu: now - oneDay * 3, pelanggan_id: customerIds[1], nama_pelanggan: "CV Bangun Jaya",
      items: [
        { produk_id: produkIds["BSI-003"], nama: "Besi Beton 12mm", jumlah: 10, harga: 97750 },
        { produk_id: produkIds["ATP-002"], nama: "Spandek 6m", jumlah: 10, harga: 105000 },
        { produk_id: produkIds["PSR-002"], nama: "Batu Split per m3", jumlah: 1, harga: 350000 },
      ],
    },
    {
      nomor: "INV-20260802-0001", total: 548000, dibayar: 550000, kembalian: 2000,
      waktu: now - oneDay * 2, pelanggan_id: customerIds[2], nama_pelanggan: "Pak Hendra",
      items: [
        { produk_id: produkIds["CAT-002"], nama: "Cat Nippon Paint Vinilex 5kg", jumlah: 3, harga: 110000 },
        { produk_id: produkIds["KRM-002"], nama: "Keramik 60x60 Cream", jumlah: 2, harga: 95000 },
        { produk_id: produkIds["ALT-002"], nama: "Gergaji Besi", jumlah: 1, harga: 38000 },
      ],
    },
    {
      nomor: "INV-20260803-0001", total: 936000, dibayar: 1000000, kembalian: 64000,
      waktu: now - oneDay, pelanggan_id: null, nama_pelanggan: null,
      items: [
        { produk_id: produkIds["SMN-001"], nama: "Semen Tiga Roda 50kg", jumlah: 10, harga: 58000 },
        { produk_id: produkIds["PPA-002"], nama: "Pipa PVC 4 inch", jumlah: 2, harga: 85000 },
        { produk_id: produkIds["LST-001"], nama: "Kabel NYM 2x1.5mm 50m", jumlah: 1, harga: 310000 },
      ],
    },
    {
      nomor: "INV-20260804-0001", total: 1350000, dibayar: 1350000, kembalian: 0,
      waktu: now, pelanggan_id: customerIds[4], nama_pelanggan: "PT Griya Sentosa",
      items: [
        { produk_id: produkIds["KYU-003"], nama: "Triplek 9mm 122x244", jumlah: 5, harga: 120000 },
        { produk_id: produkIds["KRM-003"], nama: "Granit 60x60 Hitam", jumlah: 3, harga: 155000 },
        { produk_id: produkIds["ATP-003"], nama: "Asbes Gelombang 3m", jumlah: 2, harga: 70000 },
      ],
    },
  ];

  for (const sale of sales) {
    const result = await db.execute(
      "INSERT INTO penjualan (nomor_faktur, total, dibayar, kembalian, pelanggan_id, nama_pelanggan, dibuat_pada) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [sale.nomor, sale.total, sale.dibayar, sale.kembalian, sale.pelanggan_id, sale.nama_pelanggan, sale.waktu]
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
      supplier: "PT Semen Indonesia", referensi: "PO-2026-001", total: 5200000,
      waktu: now - oneDay * 25,
      items: [
        { produk_id: produkIds["SMN-001"], nama: "Semen Tiga Roda 50kg", jumlah: 100, harga: 52000 },
      ],
    },
    {
      supplier: "CV Baja Makmur", referensi: "PO-2026-002", total: 4500000,
      waktu: now - oneDay * 22,
      items: [
        { produk_id: produkIds["BSI-001"], nama: "Besi Beton 8mm", jumlah: 100, harga: 45000 },
      ],
    },
    {
      supplier: "UD Kayu Jati", referensi: "PO-2026-003", total: 6000000,
      waktu: now - oneDay * 18,
      items: [
        { produk_id: produkIds["KYU-002"], nama: "Kayu Kamper 6x12", jumlah: 50, harga: 120000 },
      ],
    },
    {
      supplier: "PT Cat Nusantara", referensi: "PO-2026-004", total: 3600000,
      waktu: now - oneDay * 12,
      items: [
        { produk_id: produkIds["CAT-001"], nama: "Cat Dulux Weathershield 5kg", jumlah: 20, harga: 180000 },
      ],
    },
    {
      supplier: "PT Semen Indonesia", referensi: "PO-2026-005", total: 4200000,
      waktu: now - oneDay * 6,
      items: [
        { produk_id: produkIds["SMN-003"], nama: "Semen Padang 40kg", jumlah: 100, harga: 42000 },
      ],
    },
    {
      supplier: "CV Baja Makmur", referensi: "PO-2026-006", total: 9500000,
      waktu: now - oneDay * 2,
      items: [
        { produk_id: produkIds["BSI-002"], nama: "Besi Beton 10mm", jumlah: 100, harga: 65000 },
        { produk_id: produkIds["BSI-003"], nama: "Besi Beton 12mm", jumlah: 30, harga: 95000 },
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
