import { getDb, syncDb } from "@/database";
import { columnsFor, Device } from "@/lib/escInterpreter";

export type PrinterDialect = "escpos" | "escp";

export type TableStyle = "kotak" | "garis" | "sambung";

export interface PrinterSettings {
  version: number;
  enabled: boolean;
  name: string;
  dialect: PrinterDialect;
  paper: number;
  printable: number;
  cpi: number;
  width: number;
  indent: number;
  cut: boolean;
  tearFeed: number;
  scale: number;
  pageLines: number;
  tableStyle: TableStyle;
  header: string;
  address: string;
  phone: string;
  footer: string;
}

export const PAPER_SIZES = [58, 76, 80, 210, 241];

export const PRINTABLE_MM: Record<number, number> = { 58: 48, 76: 64, 80: 72, 210: 190, 241: 203.2 };

export const PITCHES = [10, 12, 15, 17.14, 20];

export const PITCH_LABELS: Record<number, string> = {
  10: "10 CPI",
  12: "12 CPI",
  15: "15 CPI",
  17.14: "17 CPI padat",
  18: "18 CPI bawaan",
  20: "20 CPI padat",
};

export function pitchLabel(cpi: number): string {
  return PITCH_LABELS[cpi] ?? `${cpi} CPI`;
}

export const THERMAL_CPI = 25.4 / 1.5;

export function resolvePitch(cpi: number): number {
  let best = PITCHES[0];
  for (const value of PITCHES) {
    if (Math.abs(value - cpi) < Math.abs(best - cpi)) best = value;
  }
  return best;
}

export function printableForPaper(paper: number): number {
  return PRINTABLE_MM[paper] ?? paper - 12;
}

export function isContinuousForm(paper: number): boolean {
  return paper >= 200;
}

export function dialectForPaper(paper: number): PrinterDialect {
  return isContinuousForm(paper) ? "escp" : "escpos";
}

export function maxColumns(settings: PrinterSettings): number {
  const cpi = settings.dialect === "escp" ? settings.cpi : THERMAL_CPI;
  return Math.floor(columnsFor(settings.printable, cpi) / (settings.scale > 1 ? 2 : 1));
}

export function columnsForPaper(paper: number): number {
  const dot = isContinuousForm(paper);
  return columnsFor(printableForPaper(paper), dot ? 10 : THERMAL_CPI);
}

export function deviceFor(settings: PrinterSettings): Device {
  const dot = settings.dialect === "escp";
  return {
    paperMm: settings.paper,
    printableMm: settings.printable,
    originMm: Math.max(0, (settings.paper - settings.printable) / 2),
    cpi: dot ? settings.cpi : THERMAL_CPI,
    condensed: false,
    lineMm: dot ? 25.4 / 6 : 3.75,
    pageMm: dot ? 279.4 : 25.4 / 6,
    justify: !dot,
    master: !dot,
    escposSize: !dot,
    pageBreaks: dot,
  };
}

export const PRINTER_PROFILE_VERSION = 12;

export const RECOMMENDED_GEOMETRY = {
  dialect: "escp" as PrinterDialect,
  paper: 241,
  printable: 203.2,
  cpi: 18,
  scale: 1,
  width: 142,
  indent: 1,
  cut: false,
  tearFeed: 0,
  pageLines: 52,
  tableStyle: "garis" as TableStyle,
};

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  version: PRINTER_PROFILE_VERSION,
  enabled: false,
  name: "",
  ...RECOMMENDED_GEOMETRY,
  header: "Tangki Sahabat Sentarum",
  address: "Jl. Danau Sentarum No.123F (samping Gg. Ilham), Pontianak Kota, Kalimantan Barat.",
  phone: "0812-5613-3288",
  footer: "Terima kasih",
};

const PRINTER_KEY = "printer_config";

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = $1",
    [key]
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)", [key, value]);
  syncDb();
}

export function upgradePrinterSettings(saved: Partial<PrinterSettings>): PrinterSettings {
  return {
    ...DEFAULT_PRINTER_SETTINGS,
    enabled: saved.enabled ?? DEFAULT_PRINTER_SETTINGS.enabled,
    name: saved.name ?? DEFAULT_PRINTER_SETTINGS.name,
    header: saved.header?.trim() || DEFAULT_PRINTER_SETTINGS.header,
    address: saved.address?.trim() || DEFAULT_PRINTER_SETTINGS.address,
    phone: saved.phone?.trim() || DEFAULT_PRINTER_SETTINGS.phone,
    footer: saved.footer?.trim() || DEFAULT_PRINTER_SETTINGS.footer,
    ...RECOMMENDED_GEOMETRY,
    version: PRINTER_PROFILE_VERSION,
  };
}

export async function getPrinterSettings(): Promise<PrinterSettings> {
  const raw = await getSetting(PRINTER_KEY);
  if (!raw) return { ...DEFAULT_PRINTER_SETTINGS };
  try {
    const saved = JSON.parse(raw) as Partial<PrinterSettings>;
    const upgraded = upgradePrinterSettings(saved);
    if ((saved.version ?? 0) < PRINTER_PROFILE_VERSION) await savePrinterSettings(upgraded);
    return upgraded;
  } catch {
    return { ...DEFAULT_PRINTER_SETTINGS };
  }
}

export async function savePrinterSettings(settings: PrinterSettings): Promise<void> {
  await setSetting(
    PRINTER_KEY,
    JSON.stringify({
      version: PRINTER_PROFILE_VERSION,
      enabled: settings.enabled,
      name: settings.name,
      header: settings.header,
      address: settings.address,
      phone: settings.phone,
      footer: settings.footer,
    })
  );
}
