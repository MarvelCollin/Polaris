import { describe, it, expect, beforeEach } from "vitest";
import { resetMock, mockDb } from "./setup";
import {
  createPurchase, getPurchases, getPurchaseItems, getDistinctSuppliers,
  getReturnedQtyMapPurchase, createPurchaseReturn, getPurchaseReturns, getPurchaseReturItems,
  getPurchaseDebts, addPurchasePayment, getPurchasePayments,
} from "@/db/purchases";
import { PurchaseEntry } from "@/types";

describe("purchases", () => {
  beforeEach(() => {
    resetMock();
  });

  it("should create a purchase with items and increment stock", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([
      { id: 1, stok: 50, harga_beli: 50000 },
      { id: 2, stok: 20, harga_beli: 40000 },
    ]);

    const items: PurchaseEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 100, harga: 52000 },
      { produk_id: 2, nama: "Besi", satuan: "batang", jumlah: 50, harga: 45000 },
    ];

    const id = await createPurchase("PT Semen Indonesia", items);
    expect(id).toBe(1);

    const calls = mockDb.execute.mock.calls;
    const purchaseInserts = calls.filter((c: unknown[]) => (c[0] as string).includes("INSERT INTO pembelian"));
    expect(purchaseInserts).toHaveLength(1);

    const total = 100 * 52000 + 50 * 45000;
    expect(purchaseInserts[0][1]).toContain(total);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const itemBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("INSERT INTO item_pembelian"))
    );
    expect(itemBatch).toBeDefined();
    const stmts = itemBatch![0] as unknown as string[];
    const itemInserts = stmts.filter((s: string) => s.includes("INSERT INTO item_pembelian"));
    expect(itemInserts).toHaveLength(2);
    const stockUpdates = stmts.filter((s: string) => s.includes("UPDATE produk SET stok"));
    expect(stockUpdates).toHaveLength(2);
  });

  it("should auto-generate purchase number", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 3 }]);
    mockDb.select.mockResolvedValueOnce([{ id: 1, stok: 10, harga_beli: 50000 }]);

    const items: PurchaseEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 10, harga: 52000 },
    ];

    await createPurchase("Toko ABC", items);
    const purchaseInsert = mockDb.execute.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes("INSERT INTO pembelian")
    );
    const params = purchaseInsert![1] as unknown[];
    expect((params[1] as string)).toMatch(/^PO-\d{8}-0004$/);
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
    expect((countCall[0] as string)).toContain("p.dibuat_pada >= $1 AND p.dibuat_pada <= $2");
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

  it("should calculate weighted average HPP on purchase", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([{ id: 1, stok: 100, harga_beli: 50000 }]);

    const items: PurchaseEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 50, harga: 56000 },
    ];

    await createPurchase("Supplier A", items);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const itemBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("UPDATE produk SET stok"))
    );
    expect(itemBatch).toBeDefined();
    const updateStmts = (itemBatch![0] as unknown as string[]).filter((s: string) => s.includes("UPDATE produk SET stok"));
    expect(updateStmts).toHaveLength(1);
    const expectedHpp = Math.round((100 * 50000 + 50 * 56000) / (100 + 50));
    expect(updateStmts[0]).toContain("stok + 50");
    expect(updateStmts[0]).toContain(`harga_beli = ${expectedHpp}`);
  });

  it("should handle HPP when product has no prior stock data", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([]);

    const items: PurchaseEntry[] = [
      { produk_id: 99, nama: "Produk Baru", satuan: "pcs", jumlah: 20, harga: 30000 },
    ];

    await createPurchase("Supplier X", items);

    const batchCalls = mockDb.batch.mock.calls as unknown as unknown[][];
    const itemBatch = batchCalls.find((c: unknown[]) =>
      (c[0] as string[]).some((s: string) => s.includes("UPDATE produk SET stok"))
    );
    expect(itemBatch).toBeDefined();
    const updateStmts = (itemBatch![0] as unknown as string[]).filter((s: string) => s.includes("UPDATE produk SET stok"));
    expect(updateStmts).toHaveLength(1);
    expect(updateStmts[0]).not.toContain("harga_beli");
  });

  it("should save partial payment as utang", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([{ id: 1, stok: 10, harga_beli: 50000 }]);

    const items: PurchaseEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 10, harga: 52000 },
    ];

    await createPurchase("Toko ABC", items, 200000);

    const purchaseInsert = mockDb.execute.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes("INSERT INTO pembelian")
    );
    const params = purchaseInsert![1] as unknown[];
    expect(params).toContain(520000);
    expect(params).toContain(200000);
  });

  it("should default dibayar to total when not provided", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([{ id: 1, stok: 5, harga_beli: 50000 }]);

    const items: PurchaseEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 5, harga: 52000 },
    ];

    await createPurchase("Toko DEF", items);

    const purchaseInsert = mockDb.execute.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes("INSERT INTO pembelian")
    );
    const params = purchaseInsert![1] as unknown[];
    const total = 5 * 52000;
    expect(params[2]).toBe(total);
    expect(params[3]).toBe(total);
  });

  it("should return distinct suppliers grouped case-insensitively", async () => {
    mockDb.select.mockResolvedValueOnce([
      { supplier: "PT Semen Indonesia" },
      { supplier: "Toko ABC" },
    ]);

    const result = await getDistinctSuppliers();
    expect(result).toEqual(["PT Semen Indonesia", "Toko ABC"]);

    const call = mockDb.select.mock.calls[0][0] as string;
    expect(call).toContain("GROUP BY UPPER(supplier)");
  });

  it("should create purchase return and reduce stock", async () => {
    mockDb.execute.mockResolvedValueOnce({ lastInsertId: 1, rowsAffected: 1 });

    const returItems = [
      { produk_id: 1, nama_produk: "Semen", jumlah: 10, harga_satuan: 52000 },
      { produk_id: 2, nama_produk: "Besi", jumlah: 5, harga_satuan: 45000 },
    ];

    const id = await createPurchaseReturn(1, returItems, "Barang cacat");
    expect(id).toBe(1);

    const returInsert = mockDb.execute.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes("INSERT INTO retur_pembelian")
    );
    expect(returInsert).toBeDefined();
    const expectedTotal = 10 * 52000 + 5 * 45000;
    expect(returInsert![1]).toContain(expectedTotal);
    expect(returInsert![1]).toContain("Barang cacat");

    const itemInserts = mockDb.execute.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes("INSERT INTO item_retur_pembelian")
    );
    expect(itemInserts).toHaveLength(2);

    const stockReduces = mockDb.execute.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes("UPDATE produk SET stok = stok -")
    );
    expect(stockReduces).toHaveLength(2);
    expect(stockReduces[0][1]).toContain(10);
    expect(stockReduces[1][1]).toContain(5);
  });

  it("should create purchase return with null alasan", async () => {
    mockDb.execute.mockResolvedValueOnce({ lastInsertId: 2, rowsAffected: 1 });

    await createPurchaseReturn(1, [
      { produk_id: 1, nama_produk: "Semen", jumlah: 1, harga_satuan: 52000 },
    ]);

    const returInsert = mockDb.execute.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes("INSERT INTO retur_pembelian")
    );
    expect(returInsert![1]).toContain(null);
  });

  it("should rollback a purchase return when stock is insufficient", async () => {
    mockDb.execute.mockImplementation(async (sql: string) => {
      if (sql.includes("UPDATE produk SET stok = stok -")) return { lastInsertId: 0, rowsAffected: 0 };
      return { lastInsertId: 1, rowsAffected: 1 };
    });

    await expect(createPurchaseReturn(1, [
      { produk_id: 1, nama_produk: "Semen", jumlah: 10, harga_satuan: 52000 },
    ])).rejects.toThrow("Stok Semen tidak mencukupi untuk retur");

    expect(mockDb.execute).toHaveBeenCalledWith("ROLLBACK");
  });

  it("should fetch returned qty map for a purchase", async () => {
    mockDb.select.mockResolvedValueOnce([
      { produk_id: 1, total_qty: 10 },
      { produk_id: 2, total_qty: 3 },
    ]);

    const map = await getReturnedQtyMapPurchase(1);
    expect(map).toEqual({ 1: 10, 2: 3 });
  });

  it("should return empty map when no purchase returns exist", async () => {
    mockDb.select.mockResolvedValueOnce([]);
    const map = await getReturnedQtyMapPurchase(99);
    expect(map).toEqual({});
  });

  it("should fetch purchase returns by purchase id", async () => {
    const mockReturns = [
      { id: 1, pembelian_id: 1, total: 520000, alasan: "Cacat", dibuat_pada: 1700000000 },
    ];
    mockDb.select.mockResolvedValueOnce(mockReturns);
    const result = await getPurchaseReturns(1);
    expect(result).toEqual(mockReturns);
  });

  it("should fetch purchase retur items by retur id", async () => {
    const mockItems = [
      { id: 1, retur_id: 1, produk_id: 1, nama_produk: "Semen", jumlah: 10, harga_satuan: 52000, subtotal: 520000 },
    ];
    mockDb.select.mockResolvedValueOnce(mockItems);
    const result = await getPurchaseReturItems(1);
    expect(result).toEqual(mockItems);
  });

  it("should fetch purchase debts", async () => {
    const mockDebts = [
      { id: 1, supplier: "Toko ABC", referensi_faktur: "PO-001", total: 520000, dibayar: 200000, total_pembayaran: 100000, sisa: 220000, dibuat_pada: 1700000000 },
    ];
    mockDb.select.mockResolvedValueOnce(mockDebts);
    const result = await getPurchaseDebts();
    expect(result).toEqual(mockDebts);
    const call = mockDb.select.mock.calls[0][0] as string;
    expect(call).toContain("sisa");
    expect(call).toContain("> 0");
  });

  it("should add purchase payment", async () => {
    await addPurchasePayment(1, 150000, "Cicilan ke-2");

    expect(mockDb.execute).toHaveBeenCalledWith(
      "INSERT INTO pembayaran_pembelian (pembelian_id, jumlah, catatan) VALUES ($1, $2, $3)",
      [1, 150000, "Cicilan ke-2"]
    );
  });

  it("should add purchase payment with null catatan", async () => {
    await addPurchasePayment(1, 100000);

    const call = mockDb.execute.mock.calls[0][1] as unknown[];
    expect(call[2]).toBeNull();
  });

  it("should fetch purchase payments by purchase id", async () => {
    const mockPayments = [
      { id: 1, jumlah: 150000, catatan: "Cicilan", dibuat_pada: 1700000000 },
    ];
    mockDb.select.mockResolvedValueOnce(mockPayments);
    const result = await getPurchasePayments(1);
    expect(result).toEqual(mockPayments);
  });

  it("should search purchases by supplier or faktur", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 1 }]);
    mockDb.select.mockResolvedValueOnce([{ id: 1, supplier: "PT Semen", total: 5200000 }]);

    await getPurchases(undefined, undefined, 50, 0, "Semen");

    const countCall = mockDb.select.mock.calls[0];
    expect((countCall[0] as string)).toContain("LIKE");
    expect(countCall[1]).toContain("%Semen%");
  });

  it("should generate sequential purchase number within same day", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 5 }]);
    mockDb.select.mockResolvedValueOnce([{ id: 1, stok: 10, harga_beli: 50000 }]);

    const items: PurchaseEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 1, harga: 50000 },
    ];

    await createPurchase("Test", items);

    const purchaseInsert = mockDb.execute.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes("INSERT INTO pembelian")
    );
    const nomor = (purchaseInsert![1] as unknown[])[1] as string;
    expect(nomor).toMatch(/^PO-\d{8}-0006$/);
  });
});
