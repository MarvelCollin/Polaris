import type { Update } from "@tauri-apps/plugin-updater";
import { checkForUpdate, downloadAndInstallUpdate } from "@/hooks/useUpdate";

export interface RecoveryDeps {
  check: () => Promise<Update | null>;
  install: (update: Update, onProgress: (text: string) => void) => Promise<void>;
  reload: () => void;
}

export type RecoveryResult = "updating" | "reloaded" | "failed";

const defaultDeps: RecoveryDeps = {
  check: checkForUpdate,
  install: downloadAndInstallUpdate,
  reload: () => window.location.reload(),
};

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function findUpdate(deps: Pick<RecoveryDeps, "check"> = defaultDeps): Promise<Update | null> {
  try {
    return await deps.check();
  } catch (_) {
    return null;
  }
}

export async function installUpdate(
  update: Update,
  notify: (text: string) => void,
  deps: Pick<RecoveryDeps, "install"> = defaultDeps
): Promise<RecoveryResult> {
  notify(`Memasang versi ${update.version}...`);
  try {
    await deps.install(update, notify);
    return "updating";
  } catch (e) {
    notify(`Gagal memasang update: ${describe(e)}. Tekan Muat Ulang untuk mencoba lagi.`);
    return "failed";
  }
}

export async function reloadOrUpdate(notify: (text: string) => void, deps: RecoveryDeps = defaultDeps): Promise<RecoveryResult> {
  notify("Memeriksa update...");
  const update = await findUpdate(deps);
  if (!update) {
    notify("Memuat ulang...");
    deps.reload();
    return "reloaded";
  }
  return installUpdate(update, notify, deps);
}
