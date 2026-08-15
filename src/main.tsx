import React, { Suspense, lazy, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import { initDb } from "./database";
import { seedDatabase } from "./db/seed";
import { initPassword } from "./db/auth";
import Spinner from "./components/Spinner";
import ErrorBoundary from "./components/ErrorBoundary";
import { BootLoading, BootError } from "./components/BootScreen";
import { UpdateProvider } from "./hooks/useUpdate";
import UpdateChecker from "./components/UpdateChecker";
import { ToastProvider } from "./components/Toast";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Products = lazy(() => import("./pages/Products"));
const Categories = lazy(() => import("./pages/Categories"));
const Sales = lazy(() => import("./pages/Sales"));
const Purchases = lazy(() => import("./pages/Purchases"));
const SaleHistory = lazy(() => import("./pages/SaleHistory"));
const PurchaseHistory = lazy(() => import("./pages/PurchaseHistory"));
const Customers = lazy(() => import("./pages/Customers"));
const UtangPiutang = lazy(() => import("./pages/UtangPiutang"));
const Backup = lazy(() => import("./pages/Backup"));
const Settings = lazy(() => import("./pages/Settings"));

const bootSteps = [
  { label: "Menyiapkan database", run: initDb },
  { label: "Memuat data awal", run: seedDatabase },
  { label: "Menyiapkan keamanan", run: initPassword },
];

type BootState =
  | { phase: "loading"; step: string }
  | { phase: "ready" }
  | { phase: "error"; step: string; error: unknown };

let bootState: BootState = { phase: "loading", step: bootSteps[0].label };
let bootPromise: Promise<void> | null = null;
const listeners = new Set<(state: BootState) => void>();

function publish(state: BootState) {
  bootState = state;
  for (const listener of listeners) listener(state);
}

function startBoot() {
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    for (const step of bootSteps) {
      publish({ phase: "loading", step: step.label });
      try {
        await step.run();
      } catch (error) {
        console.error(`[polaris] boot gagal pada tahap: ${step.label}`, error);
        bootPromise = null;
        publish({ phase: "error", step: step.label, error });
        return;
      }
    }
    publish({ phase: "ready" });
  })();

  return bootPromise;
}

function AppRoutes() {
  return (
    <ToastProvider>
    <UpdateProvider>
      <BrowserRouter>
        <UpdateChecker />
        <Suspense fallback={<div className="flex h-screen items-center justify-center"><Spinner className="size-10" /></div>}>
          <Routes>
            <Route path="login" element={<Login />} />
            <Route element={<App />}>
              <Route index element={<Dashboard />} />
              <Route path="kasir" element={<Sales />} />
              <Route path="pembelian" element={<Purchases />} />
              <Route path="produk" element={<Products />} />
              <Route path="kategori" element={<Categories />} />
              <Route path="pelanggan" element={<Customers />} />
              <Route path="riwayat-jual" element={<SaleHistory />} />
              <Route path="riwayat-beli" element={<PurchaseHistory />} />
              <Route path="utang-piutang" element={<UtangPiutang />} />
              <Route path="backup" element={<Backup />} />
              <Route path="pengaturan" element={<Settings />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </UpdateProvider>
    </ToastProvider>
  );
}

function Root() {
  const [state, setState] = useState<BootState>(bootState);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    listeners.add(setState);
    setState(bootState);
    startBoot();
    return () => {
      listeners.delete(setState);
    };
  }, []);

  useEffect(() => {
    if (state.phase !== "loading") return;
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [state.phase]);

  if (state.phase === "error") {
    return (
      <BootError
        step={state.step}
        error={state.error}
        onRetry={() => {
          setSlow(false);
          publish({ phase: "loading", step: bootSteps[0].label });
          startBoot();
        }}
      />
    );
  }

  if (state.phase === "loading") {
    return <BootLoading step={state.step} slow={slow} />;
  }

  return <AppRoutes />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>
);

window.__polarisMounted = true;
