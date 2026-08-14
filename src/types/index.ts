export interface Category {
  id: number;
  nama: string;
  dibuat_pada: number;
}

export interface Product {
  id: number;
  kode: string;
  nama: string;
  kategori_id: number;
  satuan: string;
  harga_beli: number;
  harga_jual: number;
  stok: number;
  stok_minimum: number;
  gambar: string | null;
  dibuat_pada: number;
  diperbarui_pada: number;
}

export interface ProductWithCategory extends Product {
  kategori_nama: string;
}

export interface Customer {
  id: number;
  nama: string;
  telepon: string | null;
  alamat: string | null;
  dibuat_pada: number;
}

export interface CustomerAddress {
  id: number;
  pelanggan_id: number;
  label: string;
  alamat: string;
}

export interface CustomerPrice {
  id: number;
  pelanggan_id: number;
  produk_id: number;
  harga: number;
  nama_produk?: string;
  kode_produk?: string;
  harga_jual_default?: number;
}

export interface Sale {
  id: number;
  nomor_faktur: string;
  total: number;
  dibayar: number;
  kembalian: number;
  diskon: number;
  pelanggan_id: number | null;
  nama_pelanggan: string | null;
  alamat_pengiriman: string | null;
  dibuat_pada: number;
  total_pembayaran: number;
  sisa: number;
}

export interface SaleItem {
  id: number;
  penjualan_id: number;
  produk_id: number;
  nama_produk: string;
  jumlah: number;
  harga_satuan: number;
  subtotal: number;
}

export interface Purchase {
  id: number;
  supplier: string;
  referensi_faktur: string | null;
  total: number;
  dibayar: number;
  dibuat_pada: number;
  total_pembayaran: number;
  sisa: number;
}

export interface PurchaseItem {
  id: number;
  pembelian_id: number;
  produk_id: number;
  nama_produk: string;
  jumlah: number;
  harga_satuan: number;
  subtotal: number;
}

export interface CartEntry {
  produk_id: number;
  nama: string;
  satuan: string;
  jumlah: number;
  harga: number;
  stok: number;
}

export interface PurchaseEntry {
  produk_id: number;
  nama: string;
  satuan: string;
  jumlah: number;
  harga: number;
}

export interface DebtRecord {
  id: number;
  total: number;
  dibayar: number;
  total_pembayaran: number;
  sisa: number;
  dibuat_pada: number;
}

export interface SaleDebt extends DebtRecord {
  nomor_faktur: string;
  nama_pelanggan: string;
}

export interface PurchaseDebt extends DebtRecord {
  supplier: string;
  referensi_faktur: string | null;
}

export interface Payment {
  id: number;
  jumlah: number;
  catatan: string | null;
  dibuat_pada: number;
}

export interface Retur {
  id: number;
  total: number;
  alasan: string | null;
  dibuat_pada: number;
}

export interface ReturPenjualan extends Retur {
  penjualan_id: number;
  nomor_faktur?: string;
}

export interface ReturPembelian extends Retur {
  pembelian_id: number;
  supplier?: string;
}

export interface ReturItem {
  id: number;
  retur_id: number;
  produk_id: number;
  nama_produk: string;
  jumlah: number;
  harga_satuan: number;
  subtotal: number;
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatTanggal(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
