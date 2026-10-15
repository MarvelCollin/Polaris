import { useEffect, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { findUpdate, installUpdate, reloadOrUpdate } from "@/lib/recovery";
import Spinner from "./Spinner";

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  return String(error);
}

export function BootLoading({ step, slow }: { step: string; slow?: boolean }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <Spinner className="size-10" />
      <div className="text-base font-semibold tracking-tight">Memuat Polaris</div>
      <div className="text-sm text-muted-foreground">{step}</div>
      {slow && (
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
          Pemuatan lebih lama dari biasanya. Sinkronisasi cloud mungkin sedang menunggu jaringan.
        </p>
      )}
    </div>
  );
}

export function BootError({
  title = "Gagal memuat aplikasi",
  step,
  error,
  onRetry,
}: {
  title?: string;
  step: string;
  error: unknown;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [update, setUpdate] = useState<Update | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const detail = formatError(error);

  useEffect(() => {
    let alive = true;
    findUpdate().then((found) => {
      if (alive && found) setUpdate(found);
    });
    return () => {
      alive = false;
    };
  }, []);

  const runUpdate = async (found: Update) => {
    setBusy(true);
    if ((await installUpdate(found, setNotice)) === "failed") setBusy(false);
  };

  const reload = async () => {
    setBusy(true);
    if ((await reloadOrUpdate(setNotice)) === "failed") setBusy(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${step}\n\n${detail}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 overflow-y-auto p-8 text-center">
      <div className="text-base font-semibold tracking-tight text-destructive">{title}</div>
      <div className="text-sm text-muted-foreground">
        Tahap: <span className="font-medium text-foreground">{step}</span>
      </div>
      <div className="max-w-xl text-sm break-words">{errorMessage(error)}</div>
      <pre className="max-h-[38vh] w-full max-w-xl overflow-auto rounded-xl border bg-card p-3.5 text-left font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
        {detail}
      </pre>
      {update && !busy && (
        <div className="flex w-full max-w-xl flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3.5 text-left text-sm">
          <span>Versi {update.version} sudah tersedia. Pasang update ini, masalah seperti ini biasanya sudah diperbaiki.</span>
          <button
            onClick={() => runUpdate(update)}
            className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Update Sekarang
          </button>
        </div>
      )}
      {notice && <div className="max-w-xl text-sm text-muted-foreground">{notice}</div>}
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <button
          onClick={onRetry}
          disabled={busy}
          className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          Coba Lagi
        </button>
        <button
          onClick={reload}
          disabled={busy}
          className="cursor-pointer rounded-lg border bg-card px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Muat Ulang
        </button>
        <button
          onClick={copy}
          className="cursor-pointer rounded-lg border bg-card px-4 py-2 text-sm"
        >
          {copied ? "Tersalin" : "Salin Detail"}
        </button>
      </div>
    </div>
  );
}
