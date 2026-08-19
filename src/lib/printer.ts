import { invoke } from "@tauri-apps/api/core";
import { getSaleById, getSaleItems } from "@/db/sales";
import { getPrinterSettings, PrinterSettings } from "@/db/settings";
import { buildReceipt, ReceiptData } from "@/lib/escpos";

export async function listPrinters(): Promise<string[]> {
  return invoke<string[]>("list_printers");
}

export async function printRaw(printer: string, data: Uint8Array): Promise<void> {
  await invoke("print_raw", { printer, data: Array.from(data) });
}

export async function printReceipt(data: ReceiptData, settings?: PrinterSettings): Promise<void> {
  const config = settings ?? (await getPrinterSettings());
  if (!config.enabled) return;
  if (!config.name) throw new Error("Printer belum dipilih di Pengaturan");
  await printRaw(config.name, buildReceipt(data, config));
}

export async function printSale(saleId: number, metode?: string): Promise<void> {
  const config = await getPrinterSettings();
  if (!config.enabled) return;

  const sale = await getSaleById(saleId);
  if (!sale) throw new Error(`Penjualan ${saleId} tidak ditemukan`);

  const items = await getSaleItems(saleId);
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const utang = Math.max(0, sale.total - sale.dibayar);

  await printReceipt(
    {
      nomor: sale.nomor_faktur,
      tanggal: new Date(sale.dibuat_pada * 1000),
      items,
      subtotal,
      diskon: sale.diskon,
      total: sale.total,
      dibayar: sale.dibayar,
      kembalian: sale.kembalian,
      pelanggan: sale.nama_pelanggan,
      utang,
      metode,
    },
    config
  );
}

export async function printTest(settings: PrinterSettings): Promise<void> {
  if (!settings.name) throw new Error("Printer belum dipilih");

  await printRaw(
    settings.name,
    buildReceipt(
      {
        nomor: "TEST-0001",
        tanggal: new Date(),
        items: [
          { id: 1, penjualan_id: 0, produk_id: 1, nama_produk: "Tes Cetak Struk", jumlah: 2, harga_satuan: 15000, subtotal: 30000 },
        ],
        subtotal: 30000,
        diskon: 0,
        total: 30000,
        dibayar: 50000,
        kembalian: 20000,
      },
      settings
    )
  );
}
