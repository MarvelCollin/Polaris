import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { invoke } from "@tauri-apps/api/core";

export type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "installing" | "error";

interface UpdateState {
  status: UpdateStatus;
  version: string | null;
  error: string | null;
  progress: string;
  dismissed: boolean;
  dismiss: () => void;
  reopen: () => void;
  install: () => Promise<void>;
}

const UpdateContext = createContext<UpdateState | null>(null);

export function useUpdate() {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error("useUpdate must be used within UpdateProvider");
  return ctx;
}

let updaterToken: string | null | undefined;

async function token(): Promise<string | null> {
  if (updaterToken === undefined) {
    try {
      updaterToken = await invoke<string | null>("get_updater_token");
    } catch (_) {
      updaterToken = null;
    }
  }
  return updaterToken ?? null;
}

async function headers(accept: string): Promise<Record<string, string> | undefined> {
  const value = await token();
  if (!value) return undefined;
  return { Authorization: `Bearer ${value}`, Accept: accept };
}

export async function checkForUpdate(): Promise<Update | null> {
  const update = await check({ headers: await headers("application/vnd.github.raw") });
  if (update?.available) return update;
  return null;
}

export async function downloadAndInstallUpdate(
  update: Update,
  onProgress?: (progress: string) => void,
): Promise<void> {
  const download = await headers("application/octet-stream");
  await update.downloadAndInstall((e) => {
    if (e.event === "Started" && e.data.contentLength) {
      onProgress?.(`Downloading... 0/${Math.round(e.data.contentLength / 1024)}KB`);
    } else if (e.event === "Progress") {
      onProgress?.("Downloading...");
    } else if (e.event === "Finished") {
      onProgress?.("Installing...");
    }
  }, { headers: download });
  await relaunch();
}

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setStatus("checking");
    checkForUpdate()
      .then((u) => {
        if (u) {
          setUpdate(u);
          setVersion(u.version);
          setStatus("available");
        } else {
          setStatus("idle");
        }
      })
      .catch((err) => {
        setError(String(err));
        setStatus("error");
      });
  }, []);

  const install = async () => {
    if (!update) return;
    setStatus("downloading");
    setProgress("Downloading...");
    try {
      await downloadAndInstallUpdate(update, (p) => {
        setProgress(p);
        if (p === "Installing...") setStatus("installing");
      });
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  };

  return (
    <UpdateContext.Provider
      value={{
        status,
        version,
        error,
        progress,
        dismissed,
        dismiss: () => setDismissed(true),
        reopen: () => setDismissed(false),
        install,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
}
