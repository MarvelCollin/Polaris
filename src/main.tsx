import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import { initDb } from "./database";
import { seedDatabase } from "./db/seed";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Products = lazy(() => import("./pages/Products"));
const Categories = lazy(() => import("./pages/Categories"));
const Sales = lazy(() => import("./pages/Sales"));
const Purchases = lazy(() => import("./pages/Purchases"));
const SaleHistory = lazy(() => import("./pages/SaleHistory"));
const PurchaseHistory = lazy(() => import("./pages/PurchaseHistory"));
const Customers = lazy(() => import("./pages/Customers"));
const UtangPiutang = lazy(() => import("./pages/UtangPiutang"));

initDb().then(() => seedDatabase()).then(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <Suspense fallback={<div className="flex h-screen items-center justify-center text-muted-foreground">Memuat...</div>}>
          <Routes>
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
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </React.StrictMode>
  );
});
