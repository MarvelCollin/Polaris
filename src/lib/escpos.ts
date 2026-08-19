import { SaleItem } from "@/types";
import { PrinterSettings } from "@/db/settings";

const ESC = 0x1b;
const GS = 0x1d;

export interface ReceiptData {
  nomor: string;
  tanggal: Date;
  items: SaleItem[];
  subtotal: number;
  diskon: number;
  total: number;
  dibayar: number;
  kembalian: number;
  pelanggan?: string | null;
  utang?: number;
  metode?: string;
}

function ascii(text: string): number[] {
  const out: number[] = [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    out.push(code >= 0x20 && code <= 0x7e ? code : 0x3f);
  }
  return out;
}

export function money(value: number): string {
  return Math.round(value).toLocaleString("id-ID");
}

function padRight(text: string, width: number): string {
  return text.length >= width ? text.slice(0, width) : text + " ".repeat(width - text.length);
}

function padLeft(text: string, width: number): string {
  return text.length >= width ? text.slice(-width) : " ".repeat(width - text.length) + text;
}

export function twoCol(left: string, right: string, width: number): string {
  const space = Math.max(1, width - right.length);
  return padRight(left, space) + padLeft(right, width - space);
}

export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = "";

  for (const word of text.split(/\s+/).filter(Boolean)) {
    let token = word;
    while (token.length > width) {
      if (current.length) {
        lines.push(current);
        current = "";
      }
      lines.push(token.slice(0, width));
      token = token.slice(width);
    }
    if (!current.length) {
      current = token;
    } else if (current.length + 1 + token.length <= width) {
      current += " " + token;
    } else {
      lines.push(current);
      current = token;
    }
  }

  if (current.length) lines.push(current);
  return lines.length ? lines : [""];
}

export function formatQty(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

export function receiptLines(data: ReceiptData, settings: PrinterSettings): string[] {
  const width = settings.width;
  const rule = "-".repeat(width);
  const lines: string[] = [];

  const stamp = data.tanggal;
  const date = `${String(stamp.getDate()).padStart(2, "0")}/${String(stamp.getMonth() + 1).padStart(2, "0")}/${stamp.getFullYear()}`;
  const time = `${String(stamp.getHours()).padStart(2, "0")}:${String(stamp.getMinutes()).padStart(2, "0")}`;

  lines.push(data.nomor);
  lines.push(twoCol(date, time, width));
  if (data.pelanggan) lines.push(...wrap(`Pelanggan: ${data.pelanggan}`, width));
  lines.push(rule);

  for (const item of data.items) {
    lines.push(...wrap(item.nama_produk, width));
    const qty = `${formatQty(item.jumlah)} x ${money(item.harga_satuan)}`;
    lines.push(twoCol("  " + qty, money(item.subtotal), width));
  }

  lines.push(rule);
  lines.push(twoCol("Subtotal", money(data.subtotal), width));
  if (data.diskon > 0) lines.push(twoCol("Diskon", "-" + money(data.diskon), width));
  lines.push(twoCol("TOTAL", money(data.total), width));
  lines.push(twoCol("Bayar", money(data.dibayar), width));
  if (data.utang && data.utang > 0) {
    lines.push(twoCol("Sisa Utang", money(data.utang), width));
  } else {
    lines.push(twoCol("Kembali", money(data.kembalian), width));
  }
  if (data.metode) lines.push(twoCol("Metode", data.metode, width));
  lines.push(rule);

  return lines;
}

export function buildReceipt(data: ReceiptData, settings: PrinterSettings): Uint8Array {
  const bytes: number[] = [ESC, 0x40, ESC, 0x74, 0x00];

  if (settings.drawer) bytes.push(ESC, 0x70, 0x00, 0x19, 0xfa);

  bytes.push(ESC, 0x61, 0x01);
  bytes.push(ESC, 0x21, 0x30);
  bytes.push(...ascii(settings.header.slice(0, Math.floor(settings.width / 2))), 0x0a);
  bytes.push(ESC, 0x21, 0x00);
  bytes.push(ESC, 0x61, 0x00);

  for (const line of receiptLines(data, settings)) {
    bytes.push(...ascii(line), 0x0a);
  }

  bytes.push(ESC, 0x61, 0x01);
  bytes.push(...ascii(settings.footer), 0x0a);
  bytes.push(ESC, 0x61, 0x00);
  bytes.push(0x0a, 0x0a, 0x0a);

  if (settings.cut) bytes.push(GS, 0x56, 0x42, 0x00);

  return new Uint8Array(bytes);
}
