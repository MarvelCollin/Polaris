import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle, AlertCircle, X } from "lucide-react";

type ToastType = "success" | "error";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const add = useCallback((type: ToastType, message: string) => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => remove(id), 3000);
  }, [remove]);

  const ctx: ToastContextValue = {
    success: useCallback((msg: string) => add("success", msg), [add]),
    error: useCallback((msg: string) => add("error", msg), [add]),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => setVisible(false), 2700);
    return () => clearTimeout(timer);
  }, []);

  const isSuccess = toast.type === "success";

  return (
    <div
      className={`pointer-events-auto flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm shadow-lg transition-all duration-300 ${
        visible ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"
      } ${isSuccess ? "border-primary/20" : "border-destructive/20"}`}
    >
      {isSuccess ? (
        <CheckCircle className="size-4 shrink-0 text-primary" />
      ) : (
        <AlertCircle className="size-4 shrink-0 text-destructive" />
      )}
      <span className={isSuccess ? "text-foreground" : "text-destructive"}>{toast.message}</span>
      <button type="button" onClick={onClose} className="ml-2 shrink-0 text-muted-foreground hover:text-foreground">
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
