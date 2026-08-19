import { getDb, syncDb } from "@/database";

export interface PrinterSettings {
  enabled: boolean;
  name: string;
  width: number;
  cut: boolean;
  drawer: boolean;
  header: string;
  footer: string;
}

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  enabled: false,
  name: "",
  width: 40,
  cut: true,
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
    return { ...DEFAULT_PRINTER_SETTINGS, ...(JSON.parse(raw) as Partial<PrinterSettings>) };
  } catch {
    return { ...DEFAULT_PRINTER_SETTINGS };
  }
}

export async function savePrinterSettings(settings: PrinterSettings): Promise<void> {
  await setSetting(PRINTER_KEY, JSON.stringify(settings));
}
