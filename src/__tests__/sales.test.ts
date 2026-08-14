import { describe, it, expect, beforeEach } from "vitest";
import { resetMock, mockDb } from "./setup";
import { createSale, getSales, getSaleItems, createSaleReturn, getReturnedQtyMap, getSaleReturns, getReturItems } from "@/db/sales";
import { CartEntry } from "@/types";

describe("sales", () => {
  beforeEach(() => {
    resetMock();
  });

  it("should create a sale with items and decrement stock", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.execute.mockResolvedValueOnce({ lastInsertId: 1, rowsAffected: 1 });

    const items: CartEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 5, harga: 58000, stok: 100 },
      { produk_id: 2, nama: "Besi", satuan: "batang", jumlah: 3, harga: 55000, stok: 200 },
    ];

    const id = await createSale(items, 500000);
    expect(id).toBe(1);

    const calls = mockDb.execute.mock.calls;
    const saleInserts = calls.filter((c: unknown[]) => (c[0] as string).includes("INSERT INTO penjualan"));
    expect(saleInserts).toHaveLength(1);

    const total = 5 * 58000 + 3 * 55000;
    expect(saleInserts[0][1]).toContain(total);
    expect(saleInserts[0][1]).toContain(500000);
    expect(saleInserts[0][1]).toContain(500000 - total);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const itemBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO item_penjualan"))
    );
    expect(itemBatch).toBeDefined();
    const stmts = itemBatch![0] as unknown as string[];
    const itemInserts = stmts.filter((s: string) => s.includes("INSERT INTO item_penjualan"));
    expect(itemInserts).toHaveLength(2);
    const stockUpdates = stmts.filter((s: string) => s.includes("UPDATE produk SET stok = stok -"));
    expect(stockUpdates).toHaveLength(2);
  });

  it("should generate invoice number with date prefix", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);

    const items: CartEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 1, harga: 58000, stok: 100 },
    ];

    await createSale(items, 58000);

    const insertCall = mockDb.execute.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes("INSERT INTO penjualan")
    );
    const invoiceNumber = (insertCall![1] as unknown[])[0] as string;
    expect(invoiceNumber).toMatch(/^INV-\d{8}-0001$/);
  });

  it("should create a sale with customer info", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.execute.mockResolvedValueOnce({ lastInsertId: 1, rowsAffected: 1 });

    const items: CartEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 10, harga: 52200, stok: 100 },
    ];

    await createSale(items, 522000, 1, "Pak Budi");

    const saleInsert = mockDb.execute.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes("INSERT INTO penjualan")
    );
    expect(saleInsert).toBeDefined();
    expect((saleInsert![0] as string)).toContain("pelanggan_id");
    expect((saleInsert![0] as string)).toContain("nama_pelanggan");
    expect(saleInsert![1]).toContain(1);
    expect(saleInsert![1]).toContain("Pak Budi");
  });

  it("should create a sale without customer (null pelanggan)", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.execute.mockResolvedValueOnce({ lastInsertId: 2, rowsAffected: 1 });

    const items: CartEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 1, harga: 58000, stok: 100 },
    ];

    await createSale(items, 58000);

    const saleInsert = mockDb.execute.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes("INSERT INTO penjualan")
    );
    expect(saleInsert![1]).toContain(null);
  });

  it("should fetch sales with pagination", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 10 }]);
    mockDb.select.mockResolvedValueOnce([
      { id: 1, nomor_faktur: "INV-001", total: 100000 },
    ]);

    const result = await getSales(undefined, undefined, 5, 0);
    expect(result.total).toBe(10);
    expect(result.data).toHaveLength(1);
  });

  it("should fetch sales with date range", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 3 }]);
    mockDb.select.mockResolvedValueOnce([]);

    const start = 1000;
    const end = 2000;
    await getSales(start, end, 50, 0);

    const countCall = mockDb.select.mock.calls[0];
    expect((countCall[0] as string)).toContain("p.dibuat_pada >= $1 AND p.dibuat_pada <= $2");
    expect(countCall[1]).toEqual([start, end]);
  });

  it("should fetch sale items by sale id", async () => {
    const mockItems = [
      { id: 1, penjualan_id: 1, nama_produk: "Semen", jumlah: 5 },
    ];
    mockDb.select.mockResolvedValueOnce(mockItems);
    const result = await getSaleItems(1);
    expect(result).toEqual(mockItems);
    expect(mockDb.select).toHaveBeenCalledWith(
      "SELECT * FROM item_penjualan WHERE penjualan_id = $1",
      [1]
    );
  });

  it("should apply discount to sale total", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.execute.mockResolvedValueOnce({ lastInsertId: 1, rowsAffected: 1 });
    mockDb.select.mockResolvedValueOnce([{ harga_beli: 45000 }]);

    const items: CartEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 10, harga: 58000, stok: 100 },
    ];
    const diskon = 50000;

    await createSale(items, 530000, null, null, diskon);

    const saleInsert = mockDb.execute.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes("INSERT INTO penjualan")
    );
    const params = saleInsert![1] as unknown[];
    const subtotal = 10 * 58000;
    expect(params).toContain(subtotal - diskon);
    expect(params).toContain(diskon);
  });

  it("should calculate zero kembalian when paid equals discounted total", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.execute.mockResolvedValueOnce({ lastInsertId: 1, rowsAffected: 1 });
    mockDb.select.mockResolvedValueOnce([{ harga_beli: 40000 }]);

    const items: CartEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 5, harga: 60000, stok: 50 },
    ];
    const diskon = 100000;
    const total = 5 * 60000 - diskon;

    await createSale(items, total, null, null, diskon);

    const saleInsert = mockDb.execute.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes("INSERT INTO penjualan")
    );
    const params = saleInsert![1] as unknown[];
    expect(params).toContain(0);
    expect(params).toContain(total);
  });

  it("should capture HPP per item at time of sale", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([
      { id: 1, harga_beli: 45000 },
      { id: 2, harga_beli: 38000 },
    ]);

    const items: CartEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 5, harga: 58000, stok: 100 },
      { produk_id: 2, nama: "Besi", satuan: "batang", jumlah: 3, harga: 55000, stok: 50 },
    ];

    await createSale(items, 500000);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const itemBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO item_penjualan"))
    );
    expect(itemBatch).toBeDefined();
    const stmts = (itemBatch![0] as unknown as string[]).filter((s: string) => s.includes("INSERT INTO item_penjualan"));
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain("hpp");
    expect(stmts[0]).toContain("45000");
    expect(stmts[1]).toContain("38000");
  });

  it("should use hpp=0 when product not found", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.execute.mockResolvedValueOnce({ lastInsertId: 1, rowsAffected: 1 });
    mockDb.select.mockResolvedValueOnce([]);

    const items: CartEntry[] = [
      { produk_id: 999, nama: "Unknown", satuan: "pcs", jumlah: 1, harga: 10000, stok: 10 },
    ];

    await createSale(items, 10000);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const itemBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO item_penjualan"))
    );
    expect(itemBatch).toBeDefined();
    const stmts = (itemBatch![0] as unknown as string[]).filter((s: string) => s.includes("INSERT INTO item_penjualan"));
    expect(stmts[0]).toContain(", 0)");
  });

  it("should create a sale return and restore stock", async () => {
    mockDb.execute.mockResolvedValueOnce({ lastInsertId: 1, rowsAffected: 1 });

    const returItems = [
      { produk_id: 1, nama_produk: "Semen", jumlah: 3, harga_satuan: 58000 },
      { produk_id: 2, nama_produk: "Besi", jumlah: 1, harga_satuan: 55000 },
    ];

    const id = await createSaleReturn(1, returItems, "Barang rusak");
    expect(id).toBe(1);

    const returInsert = mockDb.execute.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes("INSERT INTO retur_penjualan")
    );
    expect(returInsert).toBeDefined();
    const expectedTotal = 3 * 58000 + 1 * 55000;
    expect(returInsert![1]).toContain(expectedTotal);
    expect(returInsert![1]).toContain("Barang rusak");

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const returBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO item_retur_penjualan"))
    );
    expect(returBatch).toBeDefined();
    const returStmts = returBatch![0] as unknown as string[];
    const itemInserts = returStmts.filter((s: string) => s.includes("INSERT INTO item_retur_penjualan"));
    expect(itemInserts).toHaveLength(2);
    const stockRestores = returStmts.filter((s: string) => s.includes("UPDATE produk SET stok = stok +"));
    expect(stockRestores).toHaveLength(2);
    expect(stockRestores[0]).toContain("stok + 3,");
    expect(stockRestores[1]).toContain("stok + 1,");
  });

  it("should create sale return with null alasan", async () => {
    mockDb.execute.mockResolvedValueOnce({ lastInsertId: 2, rowsAffected: 1 });

    await createSaleReturn(1, [
      { produk_id: 1, nama_produk: "Semen", jumlah: 1, harga_satuan: 58000 },
    ]);

    const returInsert = mockDb.execute.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes("INSERT INTO retur_penjualan")
    );
    expect(returInsert![1]).toContain(null);
  });

  it("should fetch returned qty map for a sale", async () => {
    mockDb.select.mockResolvedValueOnce([
      { produk_id: 1, total_qty: 5 },
      { produk_id: 3, total_qty: 2 },
    ]);

    const map = await getReturnedQtyMap(1);
    expect(map).toEqual({ 1: 5, 3: 2 });
    expect(mockDb.select.mock.calls[0][1]).toEqual([1]);
  });

  it("should return empty map when no returns exist", async () => {
    mockDb.select.mockResolvedValueOnce([]);
    const map = await getReturnedQtyMap(99);
    expect(map).toEqual({});
  });

  it("should fetch sale returns by sale id", async () => {
    const mockReturns = [
      { id: 1, penjualan_id: 1, total: 174000, alasan: "Rusak", dibuat_pada: 1700000000 },
    ];
    mockDb.select.mockResolvedValueOnce(mockReturns);
    const result = await getSaleReturns(1);
    expect(result).toEqual(mockReturns);
  });

  it("should fetch retur items by retur id", async () => {
    const mockItems = [
      { id: 1, retur_id: 1, produk_id: 1, nama_produk: "Semen", jumlah: 3, harga_satuan: 58000, subtotal: 174000 },
    ];
    mockDb.select.mockResolvedValueOnce(mockItems);
    const result = await getReturItems(1);
    expect(result).toEqual(mockItems);
  });

  it("should search sales by nomor_faktur or nama_pelanggan", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 1 }]);
    mockDb.select.mockResolvedValueOnce([{ id: 1, nomor_faktur: "INV-20260804-0001", total: 100000 }]);

    await getSales(undefined, undefined, 50, 0, "INV-2026");

    const countCall = mockDb.select.mock.calls[0];
    expect((countCall[0] as string)).toContain("LIKE");
    expect(countCall[1]).toContain("%INV-2026%");
  });
});
