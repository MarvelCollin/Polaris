import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { connectionStatus, dismissFailedOps, onConnectionChange, reconnect } from "@/database";

const OP_LABELS: Record<string, string> = {
  createSale: "Penjualan",
  addSalePayment: "Pembayaran piutang",
  createSaleReturn: "Retur penjualan",
  createPurchase: "Pembelian",
  addPurchasePayment: "Pembayaran utang",
  createPurchaseReturn: "Retur pembelian",
  createProduct: "Tambah produk",
  updateProduct: "Ubah produk",
  updateStock: "Ubah stok",
  deleteProduct: "Hapus produk",
  createCategory: "Tambah kategori",
  updateCategory: "Ubah kategori",
  deleteCategory: "Hapus kategori",
  createCustomer: "Tambah pelanggan",
  updateCustomer: "Ubah pelanggan",
  deleteCustomer: "Hapus pelanggan",
  addCustomerAddress: "Tambah alamat",
  updateCustomerAddress: "Ubah alamat",
  deleteCustomerAddress: "Hapus alamat",
  setCustomerPrice: "Harga pelanggan",
  removeCustomerPrice: "Hapus harga pelanggan",
  setSetting: "Pengaturan",
  savePasswordHash: "Ganti password",
};

export default function ConnectionBanner() {
  const [status, setStatus] = useState(connectionStatus());
  const [checking, setChecking] = useState(false);

  useEffect(() => onConnectionChange(setStatus), []);

  async function retry() {
    setChecking(true);
    try {
      await reconnect();
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      {status.mode === "offline" && (
        <div className="mb-4 flex items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          <span className="flex-1">
            Sedang offline. Transaksi tetap bisa dicatat dan otomatis dikirim ke server saat internet kembali.
            {status.pending > 0 && ` Belum terkirim: ${status.pending}.`}
          </span>
          <Button variant="outline" size="sm" onClick={retry} disabled={checking}>
            {checking ? "Menyambungkan..." : "Sambungkan"}
          </Button>
        </div>
      )}
      {status.failed.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="flex-1">
            <div className="font-medium">
              {status.failed.length} transaksi offline gagal dikirim ke server. Cek lalu catat ulang bila perlu.
            </div>
            <ul className="mt-1 list-disc pl-5">
              {status.failed.map((item, index) => (
                <li key={index}>
                  {OP_LABELS[item.name] ?? item.name}: {item.error}
                </li>
              ))}
            </ul>
          </div>
          <Button variant="outline" size="sm" onClick={dismissFailedOps}>
            Tutup
          </Button>
        </div>
      )}
    </>
  );
}
