import { SaleItem } from "@/types";
import { PrinterSettings, resolvePitch, PITCHES, PITCH_LABELS } from "@/db/settings";
import { columnsFor } from "@/lib/escInterpreter";

const ESC = 0x1b;
const GS = 0x1d;
const SI = 0x0f;
const DC2 = 0x12;

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

export const BOX = {
  h: "─",
  v: "│",
  tl: "┌",
  tr: "┐",
  bl: "└",
  br: "┘",
  lt: "├",
  rt: "┤",
  tt: "┬",
  bt: "┴",
  x: "┼",
};

const CP437: Record<string, number> = {
  [BOX.h]: 0xc4,
  [BOX.v]: 0xb3,
  [BOX.tl]: 0xda,
  [BOX.tr]: 0xbf,
  [BOX.bl]: 0xc0,
  [BOX.br]: 0xd9,
  [BOX.lt]: 0xc3,
  [BOX.rt]: 0xb4,
  [BOX.tt]: 0xc2,
  [BOX.bt]: 0xc1,
  [BOX.x]: 0xc5,
};

function ascii(text: string): number[] {
  const out: number[] = [];
  for (const char of text) {
    const mapped = CP437[char];
    if (mapped !== undefined) {
      out.push(mapped);
      continue;
    }
    const code = char.charCodeAt(0);
    out.push(code >= 0x20 && code <= 0x7e ? code : 0x3f);
  }
  return out;
}

export function fold(text: string): string {
  let out = "";
  for (const char of text) {
    if (CP437[char] !== undefined) {
      out += char;
      continue;
    }
    const code = char.charCodeAt(0);
    out += code >= 0x20 && code <= 0x7e ? char : "?";
  }
  return out;
}

function center(text: string, width: number): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return " ".repeat(pad) + text;
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

const ONES = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];

function spell(n: number): string {
  if (n < 12) return ONES[n];
  if (n < 20) return `${spell(n - 10)} belas`;
  if (n < 100) return `${spell(Math.floor(n / 10))} puluh ${spell(n % 10)}`.trim();
  if (n < 200) return `seratus ${spell(n % 100)}`.trim();
  if (n < 1000) return `${spell(Math.floor(n / 100))} ratus ${spell(n % 100)}`.trim();
  if (n < 2000) return `seribu ${spell(n % 1000)}`.trim();
  if (n < 1e6) return `${spell(Math.floor(n / 1000))} ribu ${spell(n % 1000)}`.trim();
  if (n < 1e9) return `${spell(Math.floor(n / 1e6))} juta ${spell(n % 1e6)}`.trim();
  return `${spell(Math.floor(n / 1e9))} miliar ${spell(n % 1e9)}`.trim();
}

export function terbilang(value: number): string {
  const n = Math.round(Math.abs(value));
  if (n === 0) return "nol rupiah";
  return `${spell(n).replace(/\s+/g, " ")} rupiah`;
}

export const WIDE_MIN = 56;

function cell(text: string, width: number, align: "l" | "r" = "l"): string {
  const clipped = text.length > width ? text.slice(0, width) : text;
  return align === "r" ? clipped.padStart(width) : clipped.padEnd(width);
}

function block(text: string, width: number): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return cell(" ".repeat(pad) + text, width);
}

function boxed(settings: PrinterSettings): boolean {
  return settings.tableStyle === "kotak" || settings.tableStyle === "sambung";
}

function glyphs(settings: PrinterSettings) {
  if (settings.tableStyle !== "sambung") {
    return { h: "-", v: "|", tl: "+", tr: "+", bl: "+", br: "+", lt: "+", rt: "+", tt: "+", bt: "+", x: "+" };
  }
  return BOX;
}

function columns(settings: PrinterSettings) {
  const no = 3;
  const qty = 5;
  const harga = 11;
  const jumlah = 12;
  const pad = boxed(settings) ? 16 : 10;
  const nama = Math.max(10, settings.width - (no + qty + harga + jumlah + pad));
  return { no, nama, qty, harga, jumlah };
}

function labelSpan(settings: PrinterSettings): number {
  return settings.width - columns(settings).jumlah - (boxed(settings) ? 5 : 4);
}

export type RulePosition = "top" | "middle" | "bottom";

function rule(settings: PrinterSettings, position: RulePosition = "middle"): string {
  const w = columns(settings);
  const g = glyphs(settings);
  if (!boxed(settings)) return "-".repeat(settings.width);
  const left = position === "top" ? g.tl : position === "bottom" ? g.bl : g.lt;
  const right = position === "top" ? g.tr : position === "bottom" ? g.br : g.rt;
  const join = position === "top" ? g.tt : position === "bottom" ? g.bt : g.x;
  return left + [w.no, w.nama, w.qty, w.harga, w.jumlah].map((n) => g.h.repeat(n + 2)).join(join) + right;
}

function row(settings: PrinterSettings, a: string, b: string, c: string, d: string, e: string): string {
  const w = columns(settings);
  const cells = [
    cell(a, w.no, "r"),
    cell(b, w.nama),
    cell(c, w.qty, "r"),
    cell(d, w.harga, "r"),
    cell(e, w.jumlah, "r"),
  ];
  if (!boxed(settings)) return " " + cells.join("  ") + " ";
  const g = glyphs(settings);
  return g.v + cells.map((one) => " " + one + " ").join(g.v) + g.v;
}

function totalRule(settings: PrinterSettings): string {
  if (!boxed(settings)) return "=".repeat(settings.width);
  const g = glyphs(settings);
  return g.bl + g.h.repeat(labelSpan(settings)) + g.bt + g.h.repeat(columns(settings).jumlah + 2) + g.br;
}

function summary(settings: PrinterSettings, label: string, value: string, aside: string): string {
  const w = columns(settings);
  const span = labelSpan(settings);
  const left = cell(" " + cell(aside, Math.max(0, span - label.length - 2)) + " " + label, span);
  const amount = cell(value, w.jumlah, "r");
  if (!boxed(settings)) return " " + left + "  " + amount + " ";
  const g = glyphs(settings);
  return g.v + left + g.v + " " + amount + " " + g.v;
}

function spaced(text: string): string {
  return text.split("").join(" ");
}
function field(label: string, value: string, width: number): string {
  return cell(`${cell(label, 10)}: ${value}`, width);
}

function pair(width: number, a: string, b: string, c: string, d: string): string {
  const half = Math.floor(width / 2);
  return field(a, b, half) + field(c, d, width - half);
}


function invoiceLines(data: ReceiptData, settings: PrinterSettings): string[] {
  const width = settings.width;
  const lines: string[] = [];
  const stamp = data.tanggal;
  const date = `${String(stamp.getDate()).padStart(2, "0")}/${String(stamp.getMonth() + 1).padStart(2, "0")}/${stamp.getFullYear()}`;
  const time = `${String(stamp.getHours()).padStart(2, "0")}:${String(stamp.getMinutes()).padStart(2, "0")}`;

  if (settings.address.trim()) lines.push(...wrap(fold(settings.address), width).map((l) => block(l, width)));
  if (settings.phone.trim()) lines.push(block(fold(`Telp. ${settings.phone}`), width));
  lines.push("=".repeat(width));
  lines.push(block(spaced("NOTA PENJUALAN"), width));
  lines.push("");
  lines.push(pair(width, "No.", data.nomor, "Tanggal", `${date} ${time}`));
  lines.push(pair(width, "Pelanggan", fold(data.pelanggan || "Umum"), "Pembayaran", data.metode || "Tunai"));
  lines.push("");
  lines.push(rule(settings, "top"));
  lines.push(row(settings, "No", "Nama Barang", "Qty", "Harga", "Jumlah"));
  lines.push(rule(settings));

  data.items.forEach((item, index) => {
    const names = wrap(fold(item.nama_produk), columns(settings).nama);
    lines.push(row(settings, String(index + 1), names[0], formatQty(item.jumlah), money(item.harga_satuan), money(item.subtotal)));
    for (const extra of names.slice(1)) lines.push(row(settings, "", extra, "", "", ""));
  });

  lines.push(rule(settings));

  const words = wrap(`TERBILANG: ${terbilang(data.total).toUpperCase()}`, labelSpan(settings) - 14);
  const totals: [string, string][] = [["Subtotal", money(data.subtotal)]];
  if (data.diskon > 0) totals.push(["Diskon", "-" + money(data.diskon)]);
  totals.push(["TOTAL", money(data.total)]);
  totals.push(["Dibayar", money(data.dibayar)]);
  totals.push(data.utang && data.utang > 0 ? ["Sisa Utang", money(data.utang)] : ["Kembali", money(data.kembalian)]);

  totals.forEach(([label, value], index) => {
    lines.push(summary(settings, label, value, words[index] ?? ""));
  });
  for (const extra of words.slice(totals.length)) lines.push(summary(settings, "", "", extra));

  lines.push(totalRule(settings));

  if (settings.footer.trim()) {
    lines.push("");
    lines.push(...wrap(fold(settings.footer), width).map((l) => block(l, width)));
  }
  if (settings.pageLines > 0) {
    while (lines.length < settings.pageLines - 2) lines.push("");
  }

  return lines;
}


export function receiptLines(data: ReceiptData, settings: PrinterSettings): string[] {
  if (settings.width >= WIDE_MIN) return invoiceLines(data, settings);

  const width = settings.width;
  const rule = "-".repeat(width);
  const lines: string[] = [];

  const stamp = data.tanggal;
  const date = `${String(stamp.getDate()).padStart(2, "0")}/${String(stamp.getMonth() + 1).padStart(2, "0")}/${stamp.getFullYear()}`;
  const time = `${String(stamp.getHours()).padStart(2, "0")}:${String(stamp.getMinutes()).padStart(2, "0")}`;

  lines.push(data.nomor);
  lines.push(twoCol(date, time, width));
  if (data.pelanggan) lines.push(...wrap(fold(`Pelanggan: ${data.pelanggan}`), width));
  lines.push(rule);

  for (const item of data.items) {
    lines.push(...wrap(fold(item.nama_produk), width));
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

export function pitchBytes(input: number): number[] {
  const cpi = resolvePitch(input);
  if (cpi === 12) return [DC2, ESC, 0x4d];
  if (cpi === 15) return [DC2, ESC, 0x67];
  if (cpi === 17.14) return [ESC, 0x50, SI];
  if (cpi === 20) return [ESC, 0x4d, SI];
  return [DC2, ESC, 0x50];
}

export const LINE_SPACING_216 = 45;

export const LINE_MM = (LINE_SPACING_216 * 25.4) / 216;

function preamble(settings: PrinterSettings): number[] {
  if (settings.dialect !== "escp") return [ESC, 0x40, ESC, 0x74, 0x00];
  return [
    ESC, 0x40,
    ...pitchBytes(settings.cpi),
    ESC, 0x74, 0x01,
    ESC, 0x36,
    ESC, 0x33, LINE_SPACING_216,
    ESC, 0x43, 0x00, 0x0b,
  ];
}

function scaleOn(settings: PrinterSettings): number[] {
  if (settings.scale < 2) return [];
  return settings.dialect === "escp" ? [ESC, 0x57, 0x01] : [GS, 0x21, 0x11];
}

function scaleOff(settings: PrinterSettings): number[] {
  if (settings.scale < 2) return [];
  return settings.dialect === "escp" ? [ESC, 0x57, 0x00] : [GS, 0x21, 0x00];
}

export function rulerLine(width: number): string {
  let out = "";
  for (let i = 1; i <= width; i += 1) {
    if (i % 10 === 0) out += String((i / 10) % 10);
    else if (i % 5 === 0) out += "|";
    else out += ".";
  }
  return out;
}

export function buildRuler(settings: PrinterSettings): Uint8Array {
  const escp = settings.dialect === "escp";
  const bytes: number[] = escp ? [ESC, 0x40, ESC, 0x32, ESC, 0x43, 0x00, 0x0b] : [ESC, 0x40, ESC, 0x74, 0x00];

  if (escp) {
    bytes.push(...ascii("A. SATU PANJANG, LIMA KERAPATAN"), 0x0a);
    bytes.push(...ascii("Kalau printer menurut, garis makin pendek tiap baris."), 0x0a);
    bytes.push(0x0a);
    for (const cpi of PITCHES) {
      bytes.push(...pitchBytes(cpi));
      bytes.push(...ascii(`${PITCH_LABELS[cpi]} 60 kolom = ${Math.round((60 / cpi) * 25.4)} mm`), 0x0a);
      bytes.push(...ascii(rulerLine(60)), 0x0a);
    }
    bytes.push(...pitchBytes(settings.cpi));
    bytes.push(0x0a);
    bytes.push(...ascii("B. BATAS KOLOM TIAP KERAPATAN"), 0x0a);
    bytes.push(...ascii("Cari baris paling lebar yang belum melipat."), 0x0a);
    bytes.push(0x0a);
    for (const cpi of PITCHES) {
      const cols = columnsFor(settings.printable, cpi);
      bytes.push(...pitchBytes(cpi));
      bytes.push(...ascii(`${PITCH_LABELS[cpi]} pas ${cols} kolom = ${Math.round((cols / cpi) * 25.4)} mm`), 0x0a);
      bytes.push(...ascii(rulerLine(cols)), 0x0a);
    }
    bytes.push(...pitchBytes(settings.cpi));
    bytes.push(0x0a);
    bytes.push(...ascii(`Setelan sekarang ${PITCH_LABELS[resolvePitch(settings.cpi)]} ${settings.width} kolom`), 0x0a);
    bytes.push(0x0a);
    bytes.push(...ascii("C. UJI GARIS SAMBUNG"), 0x0a);
    bytes.push(...ascii("Kalau kotak di bawah bergaris utuh, gaya Sambung bisa dipakai."), 0x0a);
    bytes.push(...ascii("Kalau muncul huruf aneh, pakai gaya Kotak atau Garis."), 0x0a);
    bytes.push(...ascii(BOX.tl + BOX.h.repeat(10) + BOX.tt + BOX.h.repeat(10) + BOX.tr), 0x0a);
    bytes.push(...ascii(BOX.v + " ".repeat(10) + BOX.v + " ".repeat(10) + BOX.v), 0x0a);
    bytes.push(...ascii(BOX.lt + BOX.h.repeat(10) + BOX.x + BOX.h.repeat(10) + BOX.rt), 0x0a);
    bytes.push(...ascii(BOX.v + " ".repeat(10) + BOX.v + " ".repeat(10) + BOX.v), 0x0a);
    bytes.push(...ascii(BOX.bl + BOX.h.repeat(10) + BOX.bt + BOX.h.repeat(10) + BOX.br), 0x0a);

    bytes.push(...ascii(rulerLine(settings.width)), 0x0a);
    bytes.push(0x0c);
  } else {
    for (const cols of [32, 40, 48, 56]) {
      bytes.push(...ascii(`== ${cols} kolom ==`), 0x0a);
      bytes.push(...ascii(rulerLine(cols)), 0x0a);
      bytes.push(0x0a);
    }
    bytes.push(...ascii("baris mana yang mulai melipat?"), 0x0a);
    bytes.push(0x0a, 0x0a, 0x0a);
  }

  for (let i = 0; i < settings.tearFeed; i += 1) bytes.push(0x0a);

  return new Uint8Array(bytes);
}


export function buildReceipt(data: ReceiptData, settings: PrinterSettings): Uint8Array {
  const escp = settings.dialect === "escp";
  const bytes: number[] = preamble(settings);

  const headerCap = escp ? settings.width : Math.floor(settings.width / 2);
  const title = fold(settings.header).slice(0, headerCap);

  if (escp) {
    bytes.push(...scaleOn(settings));
    bytes.push(...ascii(center(title, settings.width)), 0x0a);
  } else {
    bytes.push(ESC, 0x61, 0x01);
    bytes.push(ESC, 0x21, 0x30);
    bytes.push(...ascii(title), 0x0a);
    bytes.push(ESC, 0x21, 0x00);
    bytes.push(ESC, 0x61, 0x00);
  }

  const body = receiptLines(data, settings);

  if (!escp) bytes.push(...scaleOn(settings));
  for (const line of body) {
    bytes.push(...ascii(line), 0x0a);
  }
  bytes.push(...scaleOff(settings));

  const note = fold(settings.footer).slice(0, settings.width);
  const wide = settings.width >= WIDE_MIN;

  if (escp) {
    if (!wide) {
      bytes.push(...ascii(center(note, settings.width)), 0x0a);
      if (settings.pageLines > 0) {
        const printed = 1 + body.length + 1;
        for (let i = printed; i < settings.pageLines - 1; i += 1) bytes.push(0x0a);
      }
    }
  } else if (!wide) {
    bytes.push(ESC, 0x61, 0x01);
    bytes.push(...ascii(note), 0x0a);
    bytes.push(ESC, 0x61, 0x00);
  }

  if (escp) {
    bytes.push(0x0c);
    for (let i = 0; i < settings.tearFeed; i += 1) bytes.push(0x0a);
  } else {
    bytes.push(0x0a, 0x0a, 0x0a);
    for (let i = 0; i < settings.tearFeed; i += 1) bytes.push(0x0a);
    if (settings.cut) bytes.push(GS, 0x56, 0x42, 0x00);
  }

  return new Uint8Array(bytes);
}

const SAMPLE_ITEMS: SaleItem[] = [
  { id: 1, penjualan_id: 0, produk_id: 1, nama_produk: "Semen Tiga Roda 50kg", jumlah: 3, harga_satuan: 68000, subtotal: 204000 },
  { id: 2, penjualan_id: 0, produk_id: 2, nama_produk: "Cat Tembok Avitex 5kg Putih", jumlah: 2, harga_satuan: 87500, subtotal: 175000 },
  { id: 3, penjualan_id: 0, produk_id: 3, nama_produk: "Paku Beton 5cm", jumlah: 1.5, harga_satuan: 24000, subtotal: 36000 },
];

export function sampleReceipt(now: Date = new Date()): ReceiptData {
  return {
    nomor: "INV-20260101-0001",
    tanggal: now,
    items: SAMPLE_ITEMS,
    subtotal: 415000,
    diskon: 15000,
    total: 400000,
    dibayar: 400000,
    kembalian: 0,
    pelanggan: "Pak Budi Santoso",
    metode: "Tunai",
  };
}

export function previewBytes(settings: PrinterSettings, now: Date = new Date()): Uint8Array {
  return buildReceipt(sampleReceipt(now), settings);
}
