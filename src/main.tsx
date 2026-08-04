import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import { initDb } from "./database";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Categories from "./pages/Categories";
import Sales from "./pages/Sales";
import Purchases from "./pages/Purchases";
import SaleHistory from "./pages/SaleHistory";
import PurchaseHistory from "./pages/PurchaseHistory";

initDb().then(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <Routes>
          <Route element={<App />}>
            <Route index element={<Dashboard />} />
            <Route path="kasir" element={<Sales />} />
            <Route path="pembelian" element={<Purchases />} />
            <Route path="produk" element={<Products />} />
            <Route path="kategori" element={<Categories />} />
            <Route path="riwayat-jual" element={<SaleHistory />} />
            <Route path="riwayat-beli" element={<PurchaseHistory />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </React.StrictMode>
  );
});
