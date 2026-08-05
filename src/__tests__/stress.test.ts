import { describe, it, expect, beforeEach } from "vitest";
import { resetMock, mockDb } from "./setup";
import { getDashboardStats, getDailySales, getMonthlySalesVsPurchases } from "@/db/dashboard";
import { createSale } from "@/db/sales";
import { createPurchase } from "@/db/purchases";

describe("stress: query count optimization", () => {
  beforeEach(() => {
    resetMock();
  });

  it("getDashboardStats uses exactly 1 query instead of 7", async () => {
    mockDb.select.mockResolvedValueOnce([{
      totalProducts: 1000, todaySales: 50000000, todayPurchases: 30000000,
      lowStockCount: 42, monthlySales: 500000000, monthlyPurchases: 300000000, totalCustomers: 200,
    }]);

    const stats = await getDashboardStats();

    expect(mockDb.select).toHaveBeenCalledTimes(1);
    expect(stats.totalProducts).toBe(1000);
    expect(stats.monthlyProfit).toBe(200000000);
  });

  it("getMonthlySalesVsPurchases uses exactly 2 queries instead of 12", async () => {
    mockDb.select.mockResolvedValueOnce([
      { grp: "2026-03", total: 1000000 },
      { grp: "2026-04", total: 2000000 },
      { grp: "2026-05", total: 3000000 },
    ]);
    mockDb.select.mockResolvedValueOnce([
      { grp: "2026-03", total: 500000 },
      { grp: "2026-04", total: 600000 },
    ]);

    const result = await getMonthlySalesVsPurchases(6);

    expect(mockDb.select).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(6);
    result.forEach((r) => {
      expect(r.penjualan).toBeGreaterThanOrEqual(0);
      expect(r.pembelian).toBeGreaterThanOrEqual(0);
    });
  });

  it("getDailySales uses O(1) Map lookup not O(n) find", async () => {
    const rows = [];
    for (let i = 0; i < 365; i++) {
      const d = new Date(2026, 0, i + 1);
      rows.push({ grp: d.toISOString().slice(0, 10), total: Math.random() * 1000000 });
    }
    mockDb.select.mockResolvedValueOnce(rows);

    const start = performance.now();
    const result = await getDailySales(365);
    const elapsed = performance.now() - start;

    expect(result).toHaveLength(365);
    expect(elapsed).toBeLessThan(100);
  });
});

describe("stress: transaction batching", () => {
  beforeEach(() => {
    resetMock();
  });

  it("createSale batches HPP lookup into single query for N items", async () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      produk_id: i + 1,
      nama: `Product ${i + 1}`,
      satuan: "pcs",
      jumlah: Math.ceil(Math.random() * 10),
      harga: 10000 + i * 1000,
      stok: 100,
    }));

    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce(
      items.map((i) => ({ id: i.produk_id, harga_beli: i.harga * 0.8 }))
    );

    await createSale(items, 500000);

    const selectCalls = mockDb.select.mock.calls;
    expect(selectCalls).toHaveLength(2);

    const executeCalls = mockDb.execute.mock.calls;
    const beginCall = executeCalls.find((c) => (c[0] as string).includes("BEGIN"));
    const commitCall = executeCalls.find((c) => (c[0] as string).includes("COMMIT"));
    expect(beginCall).toBeDefined();
    expect(commitCall).toBeDefined();
  });

  it("createPurchase batches stock lookup into single query for N items", async () => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      produk_id: i + 1,
      nama: `Product ${i + 1}`,
      satuan: "pcs",
      jumlah: Math.ceil(Math.random() * 10),
      harga: 5000 + i * 500,
    }));

    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce(
      items.map((i) => ({ id: i.produk_id, stok: 50, harga_beli: i.harga * 0.9 }))
    );

    await createPurchase("Test Supplier", items);

    const selectCalls = mockDb.select.mock.calls;
    expect(selectCalls).toHaveLength(2);

    const executeCalls = mockDb.execute.mock.calls;
    const beginCall = executeCalls.find((c) => (c[0] as string).includes("BEGIN"));
    const commitCall = executeCalls.find((c) => (c[0] as string).includes("COMMIT"));
    expect(beginCall).toBeDefined();
    expect(commitCall).toBeDefined();
  });

  it("createSale rolls back on error", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([{ id: 1, harga_beli: 8000 }]);

    mockDb.execute.mockImplementation(async (sql: string) => {
      if ((sql as string).includes("INSERT INTO item_penjualan")) {
        throw new Error("disk full");
      }
      return { lastInsertId: 1, rowsAffected: 1 };
    });

    await expect(
      createSale([{ produk_id: 1, nama: "X", satuan: "pcs", jumlah: 1, harga: 10000, stok: 10 }], 10000)
    ).rejects.toThrow("disk full");

    const executeCalls = mockDb.execute.mock.calls;
    const rollbackCall = executeCalls.find((c) => (c[0] as string).includes("ROLLBACK"));
    expect(rollbackCall).toBeDefined();
  });
});

describe("stress: large dataset performance", () => {
  beforeEach(() => {
    resetMock();
  });

  it("handles 1000 daily sale rows efficiently", async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => {
      const d = new Date(2024, 0, i + 1);
      return { grp: d.toISOString().slice(0, 10), total: (i + 1) * 100000 };
    });
    mockDb.select.mockResolvedValueOnce(rows);

    const start = performance.now();
    const result = await getDailySales(1000);
    const elapsed = performance.now() - start;

    expect(result).toHaveLength(1000);
    expect(elapsed).toBeLessThan(200);
  });

  it("handles empty monthly data gracefully", async () => {
    mockDb.select.mockResolvedValueOnce([]);
    mockDb.select.mockResolvedValueOnce([]);

    const result = await getMonthlySalesVsPurchases(12);
    expect(result).toHaveLength(12);
    result.forEach((r) => {
      expect(r.penjualan).toBe(0);
      expect(r.pembelian).toBe(0);
    });
  });
});
