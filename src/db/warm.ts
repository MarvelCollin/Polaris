import { connectionStatus, onConnectionChange } from "../database";
import { readPasswordHash } from "./auth";
import { getCategories } from "./categories";
import { getCustomers } from "./customers";
import { getFrequentProductIds, getProducts } from "./products";
import { getPrinterSettings } from "./settings";

export const WARM_INTERVAL_MS = 5 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;

export async function warmCache(): Promise<void> {
  if (connectionStatus().mode !== "online") return;
  await Promise.allSettled([
    getProducts(),
    getCategories(),
    getCustomers(),
    getFrequentProductIds(8),
    getPrinterSettings(),
    readPasswordHash(),
  ]);
}

export function keepCacheWarm(): () => void {
  void warmCache();
  timer ??= setInterval(() => void warmCache(), WARM_INTERVAL_MS);
  const stop = onConnectionChange((status) => {
    if (status.mode === "online") void warmCache();
  });
  return () => {
    stop();
    if (timer) clearInterval(timer);
    timer = null;
  };
}
