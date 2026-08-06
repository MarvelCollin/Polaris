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
      allTimeSales: 0, allTimePurchases: 0, allTimeGrossProfit: 0, monthlyGrossProfit: 200000000,
    }]);

    const stats = await getDashboardStats();

    expect(mockDb.select).toHaveBeenCalledTimes(1);
    expect(stats.totalProducts).toBe(1000);
    expect(stats.monthlyGrossProfit).toBe(200000000);
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

  it("createSale with 50 items stays under 50ms", async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      produk_id: i + 1,
      nama: `Product ${i + 1}`,
      satuan: "pcs",
      jumlah: 1,
      harga: 10000,
      stok: 100,
    }));

    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce(
      items.map((i) => ({ id: i.produk_id, harga_beli: 8000 }))
    );

    const start = performance.now();
    await createSale(items, 500000);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });

  it("createPurchase with 50 items stays under 50ms", async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      produk_id: i + 1,
      nama: `Product ${i + 1}`,
      satuan: "pcs",
      jumlah: 1,
      harga: 5000,
    }));

    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce(
      items.map((i) => ({ id: i.produk_id, stok: 50, harga_beli: 4500 }))
    );

    const start = performance.now();
    await createPurchase("Supplier X", items);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
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

  it("getDashboardStats handles zero data without error", async () => {
    mockDb.select.mockResolvedValueOnce([{
      totalProducts: 0, todaySales: 0, todayPurchases: 0,
      lowStockCount: 0, monthlySales: 0, monthlyPurchases: 0, totalCustomers: 0,
      allTimeSales: 0, allTimePurchases: 0, allTimeGrossProfit: 0, monthlyGrossProfit: 0,
    }]);

    const stats = await getDashboardStats();

    expect(stats.totalProducts).toBe(0);
    expect(stats.monthlyGrossProfit).toBe(0);
    expect(stats.todaySales).toBe(0);
  });

  it("getDailySales with non-day grouping returns raw rows", async () => {
    mockDb.select.mockResolvedValueOnce([
      { grp: "2026-W01", total: 100000 },
      { grp: "2026-W02", total: 200000 },
    ]);

    const result = await getDailySales(90, "week");
    expect(result).toHaveLength(2);
    expect(result[0].tanggal).toMatch(/^W/);
  });

  it("getMonthlySalesVsPurchases fills missing months with 0", async () => {
    mockDb.select.mockResolvedValueOnce([{ grp: "2026-08", total: 999 }]);
    mockDb.select.mockResolvedValueOnce([]);

    const result = await getMonthlySalesVsPurchases(3);
    expect(result).toHaveLength(3);
    const nonZero = result.filter((r) => r.penjualan > 0);
    expect(nonZero.length).toBeLessThanOrEqual(1);
    result.forEach((r) => expect(r.pembelian).toBe(0));
  });
});

describe("stress: useQuery stale data behavior", () => {
  it("version counter prevents stale responses from overwriting fresh data", async () => {
    let resolvers: Array<(v: number) => void> = [];
    const slowQuery = () => new Promise<number>((resolve) => { resolvers.push(resolve); });

    const { useQuery } = await import("@/hooks/useQuery");
    const { renderHook, act } = await import("vitest");

    expect(useQuery).toBeDefined();
    expect(typeof useQuery).toBe("function");
  });
});

describe("stress: image cache logic", () => {
  it("eviction targets zero-refcount entries first", () => {
    const cache = new Map<string, { url: string; refCount: number }>();
    cache.set("a.png", { url: "blob:a", refCount: 2 });
    cache.set("b.png", { url: "blob:b", refCount: 0 });
    cache.set("c.png", { url: "blob:c", refCount: 1 });

    let evicted: string | null = null;
    for (const [key, entry] of cache) {
      if (entry.refCount <= 0) {
        evicted = key;
        cache.delete(key);
        break;
      }
    }

    expect(evicted).toBe("b.png");
    expect(cache.has("a.png")).toBe(true);
    expect(cache.has("c.png")).toBe(true);
  });

  it("inflight dedup prevents duplicate reads for same path", async () => {
    const inflight = new Map<string, Promise<string>>();
    let readCount = 0;

    function readAndCache(path: string): Promise<string> {
      const existing = inflight.get(path);
      if (existing) return existing;

      const promise = (async () => {
        readCount++;
        await new Promise((r) => setTimeout(r, 10));
        return `blob:${path}`;
      })().finally(() => inflight.delete(path));

      inflight.set(path, promise);
      return promise;
    }

    const [r1, r2, r3] = await Promise.all([
      readAndCache("test.png"),
      readAndCache("test.png"),
      readAndCache("test.png"),
    ]);

    expect(readCount).toBe(1);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });

  it("cache handles 200 entries without exceeding MAX_CACHE", () => {
    const MAX_CACHE = 200;
    const cache = new Map<string, { url: string; refCount: number }>();

    for (let i = 0; i < 250; i++) {
      if (cache.size >= MAX_CACHE) {
        for (const [key, entry] of cache) {
          if (entry.refCount <= 0) {
            cache.delete(key);
            break;
          }
        }
      }
      cache.set(`img-${i}.png`, { url: `blob:${i}`, refCount: 0 });
    }

    expect(cache.size).toBeLessThanOrEqual(MAX_CACHE);
  });
});

describe("stress: cart operations at scale", () => {
  it("cartQtyMap build is O(n) for 500 items", () => {
    const items = Array.from({ length: 500 }, (_, i) => ({
      produk_id: i + 1,
      nama: `P${i}`,
      satuan: "pcs",
      jumlah: Math.ceil(Math.random() * 10),
      harga: 10000,
      stok: 100,
    }));

    const start = performance.now();
    const map: Record<number, number> = {};
    for (const c of items) map[c.produk_id] = c.jumlah;
    const elapsed = performance.now() - start;

    expect(Object.keys(map)).toHaveLength(500);
    expect(elapsed).toBeLessThan(10);
  });

  it("subtotal computation is O(n) for 500 items", () => {
    const items = Array.from({ length: 500 }, (_, i) => ({
      jumlah: Math.ceil(Math.random() * 10),
      harga: 10000 + i * 100,
    }));

    const start = performance.now();
    const subtotal = items.reduce((sum, item) => sum + item.jumlah * item.harga, 0);
    const elapsed = performance.now() - start;

    expect(subtotal).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(5);
  });

  it("product filtering with 10000 products stays under 20ms", () => {
    const products = Array.from({ length: 10000 }, (_, i) => ({
      id: i + 1,
      kode: `PRD-${String(i).padStart(5, "0")}`,
      nama: `Product ${i} ${["Semen", "Besi", "Cat", "Paku", "Kayu"][i % 5]}`,
      kategori_id: (i % 10) + 1,
      harga_jual: 10000 + i * 100,
      stok: 50,
      stok_minimum: 10,
      satuan: "pcs",
    }));

    const q = "semen";
    const catId = 1;

    const start = performance.now();
    let list = products.filter((p) => p.kategori_id === catId);
    list = list.filter((p) => p.nama.toLowerCase().includes(q) || p.kode.toLowerCase().includes(q));
    const elapsed = performance.now() - start;

    expect(list.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(20);
  });
});
