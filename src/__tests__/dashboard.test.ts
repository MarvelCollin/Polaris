import { describe, it, expect, beforeEach } from "vitest";
import { resetMock, mockDb } from "./setup";
import { getDashboardStats, getLowStockProducts, getRecentSales } from "@/db/dashboard";

describe("dashboard", () => {
  beforeEach(() => {
    resetMock();
  });

  it("should return dashboard stats", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 30 }]);
    mockDb.select.mockResolvedValueOnce([{ total: 500000 }]);
    mockDb.select.mockResolvedValueOnce([{ total: 300000 }]);
    mockDb.select.mockResolvedValueOnce([{ count: 4 }]);

    const stats = await getDashboardStats();
    expect(stats.totalProducts).toBe(30);
    expect(stats.todaySales).toBe(500000);
    expect(stats.todayPurchases).toBe(300000);
    expect(stats.lowStockCount).toBe(4);
  });

  it("should query today sales with correct time range", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([{ total: 0 }]);
    mockDb.select.mockResolvedValueOnce([{ total: 0 }]);
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);

    await getDashboardStats();

    const salesCall = mockDb.select.mock.calls[1];
    expect((salesCall[0] as string)).toContain("SUM(total)");
    expect((salesCall[0] as string)).toContain("penjualan");
    const params = salesCall[1] as number[];
    expect(params[1] - params[0]).toBe(86400);
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
});
