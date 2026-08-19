import { getDb, syncDb } from "@/database";

export type PrinterDialect = "escpos" | "escp";

export interface PrinterSettings {
  enabled: boolean;
  name: string;
  dialect: PrinterDialect;
  paper: number;
  width: number;
  cut: boolean;
  tearFeed: number;
  scale: number;
  pageLines: number;
  drawer: boolean;
  header: string;
  footer: string;
}

export const PAPER_SIZES = [58, 76, 80, 241];

export const PAPER_COLUMNS: Record<number, number> = { 58: 32, 76: 40, 80: 48, 241: 120 };

export function columnsForPaper(paper: number): number {
  return PAPER_COLUMNS[paper] ?? 40;
}

export function isContinuousForm(paper: number): boolean {
  return paper >= 200;
}

export function paperForColumns(width: number): number {
  const match = PAPER_SIZES.find((paper) => PAPER_COLUMNS[paper] === width);
  return match ?? 76;
}

export function dialectForPaper(paper: number): PrinterDialect {
  return isContinuousForm(paper) ? "escp" : "escpos";
}

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  enabled: false,
  name: "",
  dialect: "escpos",
  paper: 76,
  width: 40,
  cut: true,
  tearFeed: 0,
  scale: 1,
  pageLines: 66,
  drawer: false,
  header: "POLARIS",
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

export async function getPrinterSettings(): Promise<PrinterSettings> {
  const raw = await getSetting(PRINTER_KEY);
  if (!raw) return { ...DEFAULT_PRINTER_SETTINGS };
  try {
    const saved = JSON.parse(raw) as Partial<PrinterSettings>;
    const merged = { ...DEFAULT_PRINTER_SETTINGS, ...saved };
    if (saved.paper == null && saved.width != null) merged.paper = paperForColumns(saved.width);
    if (saved.dialect == null) merged.dialect = dialectForPaper(merged.paper);
    if (saved.width == null) merged.width = columnsForPaper(merged.paper);
    return merged;
  } catch {
    return { ...DEFAULT_PRINTER_SETTINGS };
  }
}

export async function savePrinterSettings(settings: PrinterSettings): Promise<void> {
  await setSetting(PRINTER_KEY, JSON.stringify(settings));
}
