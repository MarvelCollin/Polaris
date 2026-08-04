import { describe, it, expect, beforeEach } from "vitest";
import { resetMock, mockDb } from "./setup";
import { createPurchase, getPurchases, getPurchaseItems } from "@/db/purchases";
import { PurchaseEntry } from "@/types";

describe("purchases", () => {
  beforeEach(() => {
    resetMock();
  });

  it("should create a purchase with items and increment stock", async () => {
    mockDb.execute.mockResolvedValueOnce({ lastInsertId: 1, rowsAffected: 1 });

    const items: PurchaseEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 100, harga: 52000 },
      { produk_id: 2, nama: "Besi", satuan: "batang", jumlah: 50, harga: 45000 },
    ];

    const id = await createPurchase("PT Semen Indonesia", "PO-001", items);
    expect(id).toBe(1);

    const calls = mockDb.execute.mock.calls;
    const purchaseInserts = calls.filter((c: unknown[]) => (c[0] as string).includes("INSERT INTO pembelian"));
    expect(purchaseInserts).toHaveLength(1);

    const total = 100 * 52000 + 50 * 45000;
    expect(purchaseInserts[0][1]).toContain(total);

    const itemInserts = calls.filter((c: unknown[]) => (c[0] as string).includes("INSERT INTO item_pembelian"));
    expect(itemInserts).toHaveLength(2);

    const stockUpdates = calls.filter((c: unknown[]) => (c[0] as string).includes("UPDATE produk SET stok = stok +"));
    expect(stockUpdates).toHaveLength(2);
  });

  it("should create purchase with null reference", async () => {
    mockDb.execute.mockResolvedValueOnce({ lastInsertId: 2, rowsAffected: 1 });

    const items: PurchaseEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 10, harga: 52000 },
    ];

    await createPurchase("Toko ABC", null, items);
    const call = mockDb.execute.mock.calls[0][1] as unknown[];
    expect(call[1]).toBeNull();
  });

  it("should fetch purchases with pagination", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 20 }]);
    mockDb.select.mockResolvedValueOnce([
      { id: 1, supplier: "PT Semen", total: 5200000 },
    ]);

    const result = await getPurchases(undefined, undefined, 10, 0);
    expect(result.total).toBe(20);
    expect(result.data).toHaveLength(1);
  });

  it("should fetch purchases with date range", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 5 }]);
    mockDb.select.mockResolvedValueOnce([]);

    const start = 1000;
    const end = 2000;
    await getPurchases(start, end, 50, 0);

    const countCall = mockDb.select.mock.calls[0];
    expect((countCall[0] as string)).toContain("dibuat_pada >= $1 AND dibuat_pada <= $2");
    expect(countCall[1]).toEqual([start, end]);
  });

  it("should fetch purchase items by purchase id", async () => {
    const mockItems = [
      { id: 1, pembelian_id: 1, nama_produk: "Semen", jumlah: 100 },
    ];
    mockDb.select.mockResolvedValueOnce(mockItems);
    const result = await getPurchaseItems(1);
    expect(result).toEqual(mockItems);
    expect(mockDb.select).toHaveBeenCalledWith(
      "SELECT * FROM item_pembelian WHERE pembelian_id = $1",
      [1]
    );
  });
});
