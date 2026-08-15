import { useState } from "react";
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
  const detail = formatError(error);

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
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <button
          onClick={onRetry}
          className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          Coba Lagi
        </button>
        <button
          onClick={() => window.location.reload()}
          className="cursor-pointer rounded-lg border bg-card px-4 py-2 text-sm"
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
