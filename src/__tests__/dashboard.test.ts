import { describe, it, expect, beforeEach } from "vitest";
import { resetMock, mockDb } from "./setup";
import {
  getDashboardStats,
  getLowStockProducts,
  getRecentSales,
  getDailySales,
  getMonthlySalesVsPurchases,
  getSalesByCategory,
  getTopProducts,
  getTopCustomers,
  getGrossProfitByProduct,
} from "@/db/dashboard";

describe("dashboard", () => {
  beforeEach(() => {
    resetMock();
  });

  it("should return all dashboard stats in single query", async () => {
    mockDb.select.mockResolvedValueOnce([{
      totalProducts: 30,
      todaySales: 500000,
      todayPurchases: 300000,
      lowStockCount: 4,
      monthlySales: 8000000,
      monthlyPurchases: 5000000,
      totalCustomers: 5,
    }]);

    const stats = await getDashboardStats();
    expect(stats.totalProducts).toBe(30);
    expect(stats.todaySales).toBe(500000);
    expect(stats.todayPurchases).toBe(300000);
    expect(stats.lowStockCount).toBe(4);
    expect(stats.monthlySales).toBe(8000000);
    expect(stats.monthlyPurchases).toBe(5000000);
    expect(stats.monthlyProfit).toBe(3000000);
    expect(stats.totalCustomers).toBe(5);
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it("should pass day and month timestamps to single stats query", async () => {
    mockDb.select.mockResolvedValueOnce([{
      totalProducts: 0, todaySales: 0, todayPurchases: 0,
      lowStockCount: 0, monthlySales: 0, monthlyPurchases: 0, totalCustomers: 0,
    }]);

    await getDashboardStats();

    const call = mockDb.select.mock.calls[0];
    expect((call[0] as string)).toContain("SUM(total)");
    const params = call[1] as number[];
    expect(params[1] - params[0]).toBe(86400);
  });

  it("should compute monthly profit as sales minus purchases", async () => {
    mockDb.select.mockResolvedValueOnce([{
      totalProducts: 0, todaySales: 0, todayPurchases: 0,
      lowStockCount: 0, monthlySales: 10000000, monthlyPurchases: 7000000, totalCustomers: 0,
    }]);

    const stats = await getDashboardStats();
    expect(stats.monthlyProfit).toBe(3000000);
  });

  it("should return negative profit when purchases exceed sales", async () => {
    mockDb.select.mockResolvedValueOnce([{
      totalProducts: 0, todaySales: 0, todayPurchases: 0,
      lowStockCount: 0, monthlySales: 2000000, monthlyPurchases: 5000000, totalCustomers: 0,
    }]);

    const stats = await getDashboardStats();
    expect(stats.monthlyProfit).toBe(-3000000);
  });

  it("should fetch daily sales for the last N days", async () => {
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayKey = todayMidnight.toISOString().slice(0, 10);
    mockDb.select.mockResolvedValueOnce([
      { grp: todayKey, total: 500000 },
    ]);

    const result = await getDailySales(7);
    expect(result).toHaveLength(7);
    expect(result[result.length - 1].total).toBe(500000);
    const call = mockDb.select.mock.calls[0][0] as string;
    expect(call).toContain("date(dibuat_pada");
    expect(call).toContain("GROUP BY grp");
  });

  it("should fill missing days with zero in daily sales", async () => {
    mockDb.select.mockResolvedValueOnce([]);

    const result = await getDailySales(5);
    expect(result).toHaveLength(5);
    result.forEach((day) => expect(day.total).toBe(0));
  });

  it("should format daily sales dates as day/month", async () => {
    mockDb.select.mockResolvedValueOnce([]);
    const result = await getDailySales(3);
    result.forEach((day) => {
      expect(day.tanggal).toMatch(/^\d{1,2}\/\d{1,2}$/);
    });
  });

  it("should fetch monthly sales vs purchases in 2 queries", async () => {
    const now = new Date();
    const key0 = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    mockDb.select.mockResolvedValueOnce([{ grp: key0, total: 6000000 }]);
    mockDb.select.mockResolvedValueOnce([{ grp: key0, total: 3000000 }]);

    const result = await getMonthlySalesVsPurchases(6);
    expect(result).toHaveLength(6);
    expect(result[0]).toHaveProperty("bulan");
    expect(result[0]).toHaveProperty("penjualan");
    expect(result[0]).toHaveProperty("pembelian");
    expect(result[5].penjualan).toBe(6000000);
    expect(result[5].pembelian).toBe(3000000);
    expect(mockDb.select).toHaveBeenCalledTimes(2);
  });

  it("should fetch sales by category with joins", async () => {
    const mockData = [
      { kategori: "Semen", total: 5000000 },
      { kategori: "Besi & Baja", total: 3000000 },
    ];
    mockDb.select.mockResolvedValueOnce(mockData);
    const result = await getSalesByCategory();
    expect(result).toEqual(mockData);
    const call = mockDb.select.mock.calls[0][0] as string;
    expect(call).toContain("JOIN produk");
    expect(call).toContain("JOIN kategori");
    expect(call).toContain("GROUP BY k.id");
    expect(call).toContain("ORDER BY total DESC");
  });

  it("should fetch top products by total sales", async () => {
    const mockData = [
      { nama: "Semen Tiga Roda 50kg", jumlah: 60, total: 3480000 },
      { nama: "Besi Beton 8mm", jumlah: 30, total: 1650000 },
    ];
    mockDb.select.mockResolvedValueOnce(mockData);
    const result = await getTopProducts(5);
    expect(result).toEqual(mockData);
    const call = mockDb.select.mock.calls[0];
    expect((call[0] as string)).toContain("GROUP BY ip.produk_id");
    expect((call[0] as string)).toContain("ORDER BY total DESC");
    expect((call[0] as string)).toContain("LIMIT $1");
    expect(call[1]).toEqual([5]);
  });

  it("should fetch top customers by revenue", async () => {
    const mockData = [
      { nama: "CV Bangun Jaya", total: 5130000, transaksi: 2 },
      { nama: "Pak Budi - Kontraktor", total: 3300000, transaksi: 2 },
    ];
    mockDb.select.mockResolvedValueOnce(mockData);
    const result = await getTopCustomers(5);
    expect(result).toEqual(mockData);
    const call = mockDb.select.mock.calls[0];
    expect((call[0] as string)).toContain("nama_pelanggan");
    expect((call[0] as string)).toContain("GROUP BY pelanggan_id");
    expect((call[0] as string)).toContain("ORDER BY total DESC");
    expect(call[1]).toEqual([5]);
  });

  it("should fetch low stock products with limit", async () => {
    const lowStock = [
      { id: 1, nama: "Besi 12mm", stok: 5, stok_minimum: 20, kategori_nama: "Besi" },
    ];
    mockDb.select.mockResolvedValueOnce(lowStock);
    const result = await getLowStockProducts();
    expect(result).toEqual(lowStock);
    const call = mockDb.select.mock.calls[0][0] as string;
    expect(call).toContain("stok <= p.stok_minimum");
    expect(call).toContain("LIMIT 10");
  });

  it("should fetch recent sales with limit", async () => {
    const sales = [
      { id: 1, nomor_faktur: "INV-001", total: 100000 },
    ];
    mockDb.select.mockResolvedValueOnce(sales);
    const result = await getRecentSales();
    expect(result).toEqual(sales);
    const call = mockDb.select.mock.calls[0][0] as string;
    expect(call).toContain("ORDER BY dibuat_pada DESC");
    expect(call).toContain("LIMIT 5");
  });

  it("should calculate gross profit by product with margin", async () => {
    mockDb.select.mockResolvedValueOnce([
      { nama: "Semen", jumlah: 100, pendapatan: 5800000, modal: 4500000 },
      { nama: "Besi", jumlah: 50, pendapatan: 2750000, modal: 1900000 },
    ]);

    const result = await getGrossProfitByProduct(10);
    expect(result).toHaveLength(2);
    expect(result[0].nama).toBe("Semen");
    expect(result[0].laba).toBe(5800000 - 4500000);
    expect(result[0].margin).toBe(Math.round(((5800000 - 4500000) / 5800000) * 100));
    expect(result[1].laba).toBe(2750000 - 1900000);
  });

  it("should return zero margin when pendapatan is zero", async () => {
    mockDb.select.mockResolvedValueOnce([
      { nama: "Produk Gratis", jumlah: 5, pendapatan: 0, modal: 0 },
    ]);

    const result = await getGrossProfitByProduct(10);
    expect(result[0].margin).toBe(0);
    expect(result[0].laba).toBe(0);
  });

  it("should query gross profit with hpp filter and limit", async () => {
    mockDb.select.mockResolvedValueOnce([]);

    await getGrossProfitByProduct(5);

    const call = mockDb.select.mock.calls[0];
    expect((call[0] as string)).toContain("hpp > 0");
    expect((call[0] as string)).toContain("GROUP BY ip.produk_id");
    expect(call[1]).toEqual([5]);
  });

  it("should return empty array when no products have hpp data", async () => {
    mockDb.select.mockResolvedValueOnce([]);
    const result = await getGrossProfitByProduct();
    expect(result).toEqual([]);
  });

  it("should handle negative margin (loss) correctly", async () => {
    mockDb.select.mockResolvedValueOnce([
      { nama: "Promo Item", jumlah: 10, pendapatan: 100000, modal: 150000 },
    ]);

    const result = await getGrossProfitByProduct(10);
    expect(result[0].laba).toBe(-50000);
    expect(result[0].margin).toBe(Math.round(((-50000) / 100000) * 100));
  });
});
