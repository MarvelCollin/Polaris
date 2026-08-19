import { useState, useEffect, useCallback, useRef } from "react";
import { printerReport, PrinterReport } from "@/lib/printer";

const POLL_MS = 30000;

export function usePrinterStatus() {
  const [report, setReport] = useState<PrinterReport | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const next = await printerReport().catch(() => null);
    if (alive.current && next) setReport(next);
  }, []);

  useEffect(() => {
    alive.current = true;
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  return { report, refresh };
}
