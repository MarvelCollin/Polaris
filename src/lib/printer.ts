import { invoke } from "@tauri-apps/api/core";
import { getSaleById, getSaleItems } from "@/db/sales";
import { getPrinterSettings, PrinterSettings } from "@/db/settings";
import { buildReceipt, buildRuler, buildPositionTest, sampleReceipt, ReceiptData } from "@/lib/escpos";

export type PrinterHealth = "disabled" | "unset" | "missing" | "blocked" | "ready";

export interface PrinterState {
  ready: boolean;
  message: string;
  jobs: number;
}

export interface PrinterReport {
  health: PrinterHealth;
  label: string;
  detail: string;
}

export async function listPrinters(): Promise<string[]> {
  return invoke<string[]>("list_printers");
}

export async function printerStatus(printer: string): Promise<PrinterState> {
  return invoke<PrinterState>("printer_status", { printer });
}

export async function printerReport(settings?: PrinterSettings): Promise<PrinterReport> {
  const config = settings ?? (await getPrinterSettings());
  if (!config.enabled) return { health: "disabled", label: "Printer nonaktif", detail: "Cetak otomatis dimatikan di Pengaturan" };
  if (!config.name) return { health: "unset", label: "Printer belum dipilih", detail: "Pilih printer di Pengaturan" };

  try {
    const state = await printerStatus(config.name);
    if (state.ready) {
      return { health: "ready", label: config.name, detail: state.jobs > 0 ? `${state.jobs} antrian` : "Siap" };
    }
    return { health: "blocked", label: config.name, detail: state.message };
  } catch (e) {
    return { health: "missing", label: config.name, detail: e instanceof Error ? e.message : String(e) };
  }
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

export async function printSale(saleId: number, metode?: string): Promise<"printed" | "disabled"> {
  const config = await getPrinterSettings();
  if (!config.enabled) return "disabled";

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
  return "printed";
}

export async function printTest(settings: PrinterSettings): Promise<void> {
  if (!settings.name) throw new Error("Printer belum dipilih");
  await printRaw(settings.name, buildReceipt(sampleReceipt(), settings));
}

export async function printRuler(settings: PrinterSettings): Promise<void> {
  if (!settings.name) throw new Error("Printer belum dipilih");
  await printRaw(settings.name, buildRuler(settings));
}

export async function printPositionTest(settings: PrinterSettings): Promise<void> {
  if (!settings.name) throw new Error("Printer belum dipilih");
  await printRaw(settings.name, buildPositionTest(settings));
}
