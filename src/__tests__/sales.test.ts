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

    const items: CartEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 5, harga: 58000, stok: 100 },
      { produk_id: 2, nama: "Besi", satuan: "batang", jumlah: 3, harga: 55000, stok: 200 },
    ];

    const id = await createSale(items, 500000);
    expect(id).toBe(1);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const saleBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO penjualan"))
    );
    expect(saleBatch).toBeDefined();
    const stmts = saleBatch![0] as unknown as string[];

    const saleInsert = stmts.find((s: string) => s.includes("INSERT INTO penjualan"))!;
    const total = 5 * 58000 + 3 * 55000;
    expect(saleInsert).toContain(String(total));
    expect(saleInsert).toContain("500000");
    expect(saleInsert).toContain(String(500000 - total));

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

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const saleBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO penjualan"))
    );
    const saleInsert = (saleBatch![0] as unknown as string[]).find((s: string) => s.includes("INSERT INTO penjualan"))!;
    expect(saleInsert).toMatch(/INV-\d{8}-0001/);
  });

  it("should create a sale with customer info", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);

    const items: CartEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 10, harga: 52200, stok: 100 },
    ];

    await createSale(items, 522000, 1, "Pak Budi");

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const saleBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO penjualan"))
    );
    const saleInsert = (saleBatch![0] as unknown as string[]).find((s: string) => s.includes("INSERT INTO penjualan"))!;
    expect(saleInsert).toContain("pelanggan_id");
    expect(saleInsert).toContain("nama_pelanggan");
    expect(saleInsert).toContain(", 1,");
    expect(saleInsert).toContain("Pak Budi");
  });

  it("should create a sale without customer (null pelanggan)", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);

    const items: CartEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 1, harga: 58000, stok: 100 },
    ];

    await createSale(items, 58000);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const saleBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO penjualan"))
    );
    const saleInsert = (saleBatch![0] as unknown as string[]).find((s: string) => s.includes("INSERT INTO penjualan"))!;
    expect(saleInsert).toContain("NULL");
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
      { id: 1, penjualan_id: 1, produk_id: 7, kode: "SMN-001", nama_produk: "Semen", jumlah: 5 },
    ];
    mockDb.select.mockResolvedValueOnce(mockItems);
    const result = await getSaleItems(1);
    expect(result).toEqual(mockItems);
    const [sql, params] = mockDb.select.mock.calls[0];
    expect(sql as string).toContain("FROM item_penjualan i");
    expect(sql as string).toContain("LEFT JOIN produk pr ON pr.id = i.produk_id");
    expect(sql as string).toContain("WHERE i.penjualan_id = $1");
    expect(params).toEqual([1]);
  });

  it("keeps the item when its product has since been deleted", async () => {
    mockDb.select.mockResolvedValueOnce([
      { id: 1, penjualan_id: 1, produk_id: 7, kode: null, nama_produk: "Semen", jumlah: 5 },
    ]);
    const [item] = await getSaleItems(1);
    expect(item.kode).toBeNull();
    expect(item.nama_produk).toBe("Semen");
    expect((mockDb.select.mock.calls[0][0] as string)).toContain("LEFT JOIN");
  });

  it("should apply discount to sale total", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([{ id: 1, harga_beli: 45000 }]);

    const items: CartEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 10, harga: 58000, stok: 100 },
    ];
    const diskon = 50000;

    await createSale(items, 530000, null, null, diskon);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const saleBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO penjualan"))
    );
    const saleInsert = (saleBatch![0] as unknown as string[]).find((s: string) => s.includes("INSERT INTO penjualan"))!;
    const subtotal = 10 * 58000;
    expect(saleInsert).toContain(String(subtotal - diskon));
    expect(saleInsert).toContain(String(diskon));
  });

  it("should calculate zero kembalian when paid equals discounted total", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([{ id: 1, harga_beli: 40000 }]);

    const items: CartEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 5, harga: 60000, stok: 50 },
    ];
    const diskon = 100000;
    const total = 5 * 60000 - diskon;

    await createSale(items, total, null, null, diskon);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const saleBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO penjualan"))
    );
    const saleInsert = (saleBatch![0] as unknown as string[]).find((s: string) => s.includes("INSERT INTO penjualan"))!;
    expect(saleInsert).toContain(", 0,");
    expect(saleInsert).toContain(String(total));
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
    const returItems = [
      { produk_id: 1, nama_produk: "Semen", jumlah: 3, harga_satuan: 58000 },
      { produk_id: 2, nama_produk: "Besi", jumlah: 1, harga_satuan: 55000 },
    ];

    const id = await createSaleReturn(1, returItems, "Barang rusak");
    expect(id).toBe(1);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const returBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO retur_penjualan"))
    );
    expect(returBatch).toBeDefined();
    const stmts = returBatch![0] as unknown as string[];

    const returInsert = stmts.find((s: string) => s.includes("INSERT INTO retur_penjualan"))!;
    const expectedTotal = 3 * 58000 + 1 * 55000;
    expect(returInsert).toContain(String(expectedTotal));
    expect(returInsert).toContain("Barang rusak");

    const itemInserts = stmts.filter((s: string) => s.includes("INSERT INTO item_retur_penjualan"));
    expect(itemInserts).toHaveLength(2);
    const stockRestores = stmts.filter((s: string) => s.includes("UPDATE produk SET stok = stok +"));
    expect(stockRestores).toHaveLength(2);
    expect(stockRestores[0]).toContain("stok + 3,");
    expect(stockRestores[1]).toContain("stok + 1,");
  });

  it("should create sale return with null alasan", async () => {
    await createSaleReturn(1, [
      { produk_id: 1, nama_produk: "Semen", jumlah: 1, harga_satuan: 58000 },
    ]);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const returBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO retur_penjualan"))
    );
    const returInsert = (returBatch![0] as unknown as string[]).find((s: string) => s.includes("INSERT INTO retur_penjualan"))!;
    expect(returInsert).toContain("NULL");
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
