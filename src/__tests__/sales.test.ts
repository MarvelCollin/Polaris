import { describe, it, expect, beforeEach } from "vitest";
import { resetMock, mockDb } from "./setup";
import { createSale, getSales, getSaleItems } from "@/db/sales";
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

    const itemInserts = calls.filter((c: unknown[]) => (c[0] as string).includes("INSERT INTO item_penjualan"));
    expect(itemInserts).toHaveLength(2);

    const stockUpdates = calls.filter((c: unknown[]) => (c[0] as string).includes("UPDATE produk SET stok = stok -"));
    expect(stockUpdates).toHaveLength(2);
  });

  it("should generate invoice number with date prefix", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.execute.mockResolvedValueOnce({ lastInsertId: 1, rowsAffected: 1 });

    const items: CartEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 1, harga: 58000, stok: 100 },
    ];

    await createSale(items, 58000);

    const insertCall = mockDb.execute.mock.calls[0][1] as unknown[];
    const invoiceNumber = insertCall[0] as string;
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
    expect((countCall[0] as string)).toContain("dibuat_pada >= $1 AND dibuat_pada <= $2");
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
});
