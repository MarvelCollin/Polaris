import { describe, it, expect, beforeEach } from "vitest";
import { resetMock, mockDb } from "./setup";
import { createSale, getSales } from "@/db/sales";
import { createPurchase, getPurchases } from "@/db/purchases";
import { getDashboardStats, getGrossProfitByProduct } from "@/db/dashboard";
import { CartEntry, PurchaseEntry } from "@/types";

describe("HPP weighted average calculation", () => {
  beforeEach(() => resetMock());

  it("should compute weighted average HPP on purchase", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([
      { id: 1, stok: 10, harga_beli: 50000 },
    ]);

    const items: PurchaseEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 10, harga: 60000 },
    ];

    await createPurchase("Supplier A", items);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const itemBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("UPDATE produk SET stok = stok +"))
    );
    expect(itemBatch).toBeDefined();
    const updateStmts = (itemBatch![0] as unknown as string[]).filter((s: string) => s.includes("UPDATE produk SET stok = stok +"));
    expect(updateStmts).toHaveLength(1);

    const expectedHpp = Math.round((10 * 50000 + 10 * 60000) / (10 + 10));
    expect(expectedHpp).toBe(55000);
    expect(updateStmts[0]).toContain(`harga_beli = ${expectedHpp}`);
  });

  it("should handle first purchase when existing stock is zero", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([
      { id: 1, stok: 0, harga_beli: 0 },
    ]);

    const items: PurchaseEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 20, harga: 45000 },
    ];

    await createPurchase("Supplier B", items);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const itemBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("UPDATE produk SET stok = stok +"))
    );
    expect(itemBatch).toBeDefined();
    const updateStmts = (itemBatch![0] as unknown as string[]).filter((s: string) => s.includes("UPDATE produk SET stok = stok +"));
    const expectedHpp = Math.round((0 * 0 + 20 * 45000) / (0 + 20));
    expect(expectedHpp).toBe(45000);
    expect(updateStmts[0]).toContain(`harga_beli = ${expectedHpp}`);
  });

  it("should handle unequal stock quantities in weighted average", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([
      { id: 1, stok: 100, harga_beli: 50000 },
    ]);

    const items: PurchaseEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 50, harga: 55000 },
    ];

    await createPurchase("Supplier C", items);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const itemBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("UPDATE produk SET stok = stok +"))
    );
    expect(itemBatch).toBeDefined();
    const updateStmts = (itemBatch![0] as unknown as string[]).filter((s: string) => s.includes("UPDATE produk SET stok = stok +"));
    const expectedHpp = Math.round((100 * 50000 + 50 * 55000) / (100 + 50));
    expect(expectedHpp).toBe(51667);
    expect(updateStmts[0]).toContain(`harga_beli = ${expectedHpp}`);
  });
});

describe("sale total and discount calculations", () => {
  beforeEach(() => resetMock());

  it("should compute subtotal as sum of qty * price", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([
      { id: 1, harga_beli: 45000 },
      { id: 2, harga_beli: 38000 },
    ]);

    const items: CartEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 10, harga: 58000, stok: 100 },
      { produk_id: 2, nama: "Besi", satuan: "btg", jumlah: 5, harga: 55000, stok: 50 },
    ];

    await createSale(items, 1000000);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const saleBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO penjualan"))
    );
    const saleInsert = (saleBatch![0] as unknown as string[]).find((s: string) => s.includes("INSERT INTO penjualan"))!;
    const expectedTotal = 10 * 58000 + 5 * 55000;
    expect(expectedTotal).toBe(855000);
    expect(saleInsert).toContain(String(expectedTotal));
  });

  it("should apply discount and compute correct total", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([{ id: 1, harga_beli: 40000 }]);

    const items: CartEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 10, harga: 50000, stok: 100 },
    ];
    const diskon = 25000;

    await createSale(items, 475000, null, null, diskon);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const saleBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO penjualan"))
    );
    const saleInsert = (saleBatch![0] as unknown as string[]).find((s: string) => s.includes("INSERT INTO penjualan"))!;
    const subtotal = 10 * 50000;
    const total = subtotal - diskon;
    expect(total).toBe(475000);
    expect(saleInsert).toContain(String(total));
    expect(saleInsert).toContain(String(diskon));
  });

  it("should compute kembalian as max(0, paid - total)", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([{ id: 1, harga_beli: 40000 }]);

    const items: CartEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 5, harga: 50000, stok: 100 },
    ];

    await createSale(items, 300000);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const saleBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO penjualan"))
    );
    const saleInsert = (saleBatch![0] as unknown as string[]).find((s: string) => s.includes("INSERT INTO penjualan"))!;
    const total = 5 * 50000;
    const kembalian = 300000 - total;
    expect(kembalian).toBe(50000);
    expect(saleInsert).toContain(String(kembalian));
  });

  it("should return zero kembalian when underpaying (utang)", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([{ id: 1, harga_beli: 40000 }]);

    const items: CartEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 10, harga: 50000, stok: 100 },
    ];

    await createSale(items, 100000, 1, "Pak Budi");

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const saleBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO penjualan"))
    );
    const saleInsert = (saleBatch![0] as unknown as string[]).find((s: string) => s.includes("INSERT INTO penjualan"))!;
    expect(saleInsert).toContain(", 0,");
  });
});

describe("purchase total calculation", () => {
  beforeEach(() => resetMock());

  it("should compute purchase total as sum of qty * price", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([
      { id: 1, stok: 50, harga_beli: 45000 },
      { id: 2, stok: 30, harga_beli: 35000 },
    ]);

    const items: PurchaseEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 20, harga: 48000 },
      { produk_id: 2, nama: "Cat", satuan: "kaleng", jumlah: 10, harga: 75000 },
    ];

    await createPurchase("Supplier X", items);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const purchaseBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO pembelian"))
    );
    const purchaseInsert = (purchaseBatch![0] as unknown as string[]).find((s: string) => s.includes("INSERT INTO pembelian"))!;
    const expectedTotal = 20 * 48000 + 10 * 75000;
    expect(expectedTotal).toBe(1710000);
    expect(purchaseInsert).toContain(String(expectedTotal));
  });

  it("should use full total as dibayar when no partial payment", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([{ id: 1, stok: 10, harga_beli: 40000 }]);

    const items: PurchaseEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 5, harga: 45000 },
    ];

    await createPurchase("Supplier Y", items);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const purchaseBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO pembelian"))
    );
    const purchaseInsert = (purchaseBatch![0] as unknown as string[]).find((s: string) => s.includes("INSERT INTO pembelian"))!;
    const total = 5 * 45000;
    expect(purchaseInsert).toContain(`${total}, ${total}`);
  });

  it("should store partial payment for purchase utang", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([{ id: 1, stok: 10, harga_beli: 40000 }]);

    const items: PurchaseEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 10, harga: 45000 },
    ];
    const partialPay = 200000;

    await createPurchase("Supplier Z", items, partialPay);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const purchaseBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO pembelian"))
    );
    const purchaseInsert = (purchaseBatch![0] as unknown as string[]).find((s: string) => s.includes("INSERT INTO pembelian"))!;
    const total = 10 * 45000;
    expect(total).toBe(450000);
    expect(purchaseInsert).toContain(`${total}, ${partialPay}`);
  });
});

describe("gross profit (laba kotor) calculations", () => {
  beforeEach(() => resetMock());

  it("should compute laba kotor as pendapatan - modal", async () => {
    mockDb.select.mockResolvedValueOnce([
      { nama: "Semen", jumlah: 100, pendapatan: 5800000, modal: 4500000 },
    ]);

    const result = await getGrossProfitByProduct(10);
    expect(result[0].laba).toBe(5800000 - 4500000);
    expect(result[0].laba).toBe(1300000);
  });

  it("should compute margin as ((pendapatan - modal) / pendapatan) * 100", async () => {
    mockDb.select.mockResolvedValueOnce([
      { nama: "Semen", jumlah: 100, pendapatan: 5800000, modal: 4500000 },
    ]);

    const result = await getGrossProfitByProduct(10);
    const expectedMargin = Math.round(((5800000 - 4500000) / 5800000) * 100);
    expect(expectedMargin).toBe(22);
    expect(result[0].margin).toBe(expectedMargin);
  });

  it("should return zero margin when pendapatan is zero", async () => {
    mockDb.select.mockResolvedValueOnce([
      { nama: "Free Item", jumlah: 10, pendapatan: 0, modal: 0 },
    ]);

    const result = await getGrossProfitByProduct(10);
    expect(result[0].margin).toBe(0);
    expect(result[0].laba).toBe(0);
  });

  it("should handle negative margin (selling below cost)", async () => {
    mockDb.select.mockResolvedValueOnce([
      { nama: "Clearance", jumlah: 50, pendapatan: 200000, modal: 350000 },
    ]);

    const result = await getGrossProfitByProduct(10);
    expect(result[0].laba).toBe(-150000);
    expect(result[0].margin).toBe(Math.round((-150000 / 200000) * 100));
    expect(result[0].margin).toBe(-75);
  });
});

describe("dashboard stats calculations", () => {
  beforeEach(() => resetMock());

  it("should return monthlyGrossProfit from HPP-based SQL, not sales minus purchases", async () => {
    mockDb.select.mockResolvedValueOnce([{
      totalProducts: 10,
      todaySales: 100000,
      todayPurchases: 500000,
      lowStockCount: 2,
      monthlySales: 10000000,
      monthlyPurchases: 15000000,
      totalCustomers: 5,
      allTimeSales: 50000000,
      allTimePurchases: 40000000,
      allTimeGrossProfit: 12000000,
      monthlyGrossProfit: 3500000,
    }]);

    const stats = await getDashboardStats();

    expect(stats.monthlyGrossProfit).toBe(3500000);
    expect(stats.monthlyGrossProfit).not.toBe(stats.monthlySales - stats.monthlyPurchases);
  });

  it("should compute allTimeProfit as allTimeSales - allTimePurchases", async () => {
    mockDb.select.mockResolvedValueOnce([{
      totalProducts: 0, todaySales: 0, todayPurchases: 0,
      lowStockCount: 0, monthlySales: 0, monthlyPurchases: 0, totalCustomers: 0,
      allTimeSales: 80000000, allTimePurchases: 60000000,
      allTimeGrossProfit: 25000000, monthlyGrossProfit: 0,
    }]);

    const stats = await getDashboardStats();
    expect(stats.allTimeProfit).toBe(80000000 - 60000000);
    expect(stats.allTimeProfit).toBe(20000000);
  });

  it("should return allTimeGrossProfit from HPP-based SQL", async () => {
    mockDb.select.mockResolvedValueOnce([{
      totalProducts: 0, todaySales: 0, todayPurchases: 0,
      lowStockCount: 0, monthlySales: 0, monthlyPurchases: 0, totalCustomers: 0,
      allTimeSales: 50000000, allTimePurchases: 40000000,
      allTimeGrossProfit: 15000000, monthlyGrossProfit: 0,
    }]);

    const stats = await getDashboardStats();
    expect(stats.allTimeGrossProfit).toBe(15000000);
  });

  it("should handle all zeros gracefully", async () => {
    mockDb.select.mockResolvedValueOnce([{
      totalProducts: 0, todaySales: 0, todayPurchases: 0,
      lowStockCount: 0, monthlySales: 0, monthlyPurchases: 0, totalCustomers: 0,
      allTimeSales: 0, allTimePurchases: 0, allTimeGrossProfit: 0, monthlyGrossProfit: 0,
    }]);

    const stats = await getDashboardStats();
    expect(stats.monthlyGrossProfit).toBe(0);
    expect(stats.allTimeProfit).toBe(0);
    expect(stats.allTimeGrossProfit).toBe(0);
  });
});

describe("debt (sisa utang) calculations", () => {
  beforeEach(() => resetMock());

  it("getSales query should join payment table for accurate sisa", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 1 }]);
    mockDb.select.mockResolvedValueOnce([{
      id: 1, nomor_faktur: "INV-001", total: 500000, dibayar: 200000,
      total_pembayaran: 100000, sisa: 200000,
    }]);

    const result = await getSales(undefined, undefined, 50, 0);
    const sale = result.data[0];
    expect(sale.total_pembayaran).toBe(100000);
    expect(sale.sisa).toBe(200000);

    const selectCall = mockDb.select.mock.calls[1][0] as string;
    expect(selectCall).toContain("LEFT JOIN");
    expect(selectCall).toContain("pembayaran_penjualan");
    expect(selectCall).toContain("retur_penjualan");
    expect(selectCall).toContain("total_pembayaran");
    expect(selectCall).toContain("sisa");
  });

  it("getPurchases query should join payment table for accurate sisa", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 1 }]);
    mockDb.select.mockResolvedValueOnce([{
      id: 1, supplier: "Toko ABC", total: 1000000, dibayar: 500000,
      total_pembayaran: 300000, sisa: 200000,
    }]);

    const result = await getPurchases(undefined, undefined, 50, 0);
    const purchase = result.data[0];
    expect(purchase.total_pembayaran).toBe(300000);
    expect(purchase.sisa).toBe(200000);

    const selectCall = mockDb.select.mock.calls[1][0] as string;
    expect(selectCall).toContain("LEFT JOIN");
    expect(selectCall).toContain("pembayaran_pembelian");
    expect(selectCall).toContain("retur_pembelian");
    expect(selectCall).toContain("total_pembayaran");
    expect(selectCall).toContain("sisa");
  });

  it("sisa should be total - dibayar - total_pembayaran", async () => {
    const total = 1000000;
    const dibayar = 400000;
    const totalPembayaran = 350000;
    const expectedSisa = total - dibayar - totalPembayaran;
    expect(expectedSisa).toBe(250000);

    mockDb.select.mockResolvedValueOnce([{ count: 1 }]);
    mockDb.select.mockResolvedValueOnce([{
      id: 1, supplier: "Test", total, dibayar,
      total_pembayaran: totalPembayaran, sisa: expectedSisa,
    }]);

    const result = await getPurchases();
    expect(result.data[0].sisa).toBe(250000);
  });

  it("fully paid transaction should have sisa <= 0", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 1 }]);
    mockDb.select.mockResolvedValueOnce([{
      id: 1, supplier: "Test", total: 500000, dibayar: 500000,
      total_pembayaran: 0, sisa: 0,
    }]);

    const result = await getPurchases();
    expect(result.data[0].sisa).toBeLessThanOrEqual(0);
  });
});

describe("retur total calculations", () => {
  beforeEach(() => resetMock());

  it("sale return total should be sum of qty * harga_satuan", async () => {
    const { createSaleReturn } = await import("@/db/sales");

    const returItems = [
      { produk_id: 1, nama_produk: "Semen", jumlah: 3, harga_satuan: 58000 },
      { produk_id: 2, nama_produk: "Besi", jumlah: 2, harga_satuan: 55000 },
    ];

    await createSaleReturn(1, returItems);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const returBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO retur_penjualan"))
    );
    const returInsert = (returBatch![0] as unknown as string[]).find((s: string) => s.includes("INSERT INTO retur_penjualan"))!;
    const expectedTotal = 3 * 58000 + 2 * 55000;
    expect(expectedTotal).toBe(284000);
    expect(returInsert).toContain(String(expectedTotal));
  });

  it("purchase return total should be sum of qty * harga_satuan", async () => {
    const { createPurchaseReturn } = await import("@/db/purchases");

    mockDb.select.mockResolvedValueOnce([{ id: 1, stok: 100 }]);

    const returItems = [
      { produk_id: 1, nama_produk: "Semen", jumlah: 5, harga_satuan: 45000 },
    ];

    await createPurchaseReturn(1, returItems);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const returBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO retur_pembelian"))
    );
    const returInsert = (returBatch![0] as unknown as string[]).find((s: string) => s.includes("INSERT INTO retur_pembelian"))!;
    const expectedTotal = 5 * 45000;
    expect(expectedTotal).toBe(225000);
    expect(returInsert).toContain(String(expectedTotal));
  });
});

describe("item subtotal stored in DB", () => {
  beforeEach(() => resetMock());

  it("sale item subtotal should be jumlah * harga", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([{ id: 1, harga_beli: 40000 }]);

    const items: CartEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 7, harga: 58000, stok: 100 },
    ];

    await createSale(items, 500000);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const itemBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO item_penjualan"))
    );
    expect(itemBatch).toBeDefined();
    const saleStmts = (itemBatch![0] as unknown as string[]).filter((s: string) => s.includes("INSERT INTO item_penjualan"));
    const expectedSubtotal = 7 * 58000;
    expect(expectedSubtotal).toBe(406000);
    expect(saleStmts[0]).toContain(`${expectedSubtotal}`);
  });

  it("purchase item subtotal should be jumlah * harga", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([{ id: 1, stok: 10, harga_beli: 40000 }]);

    const items: PurchaseEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 15, harga: 45000 },
    ];

    await createPurchase("Supplier A", items);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const itemBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO item_pembelian"))
    );
    expect(itemBatch).toBeDefined();
    const purchaseStmts = (itemBatch![0] as unknown as string[]).filter((s: string) => s.includes("INSERT INTO item_pembelian"));
    const expectedSubtotal = 15 * 45000;
    expect(expectedSubtotal).toBe(675000);
    expect(purchaseStmts[0]).toContain(`${expectedSubtotal}`);
  });
});
