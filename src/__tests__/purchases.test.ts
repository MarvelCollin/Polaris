import { describe, it, expect, beforeEach } from "vitest";
import { resetMock, mockDb, writes, transactionLog, failOn } from "./setup";
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

    const [purchase] = writes(/INSERT INTO pembelian/);
    const total = 100 * 52000 + 50 * 45000;
    expect(purchase.params).toEqual(["PT Semen Indonesia", expect.stringMatching(/^PO-\d{8}-0001$/), total, total]);

    expect(writes(/INSERT INTO item_pembelian/)).toHaveLength(2);
    expect(writes(/UPDATE produk SET stok/)).toHaveLength(2);
    expect(transactionLog()).toEqual(["BEGIN IMMEDIATE", "COMMIT"]);
  });

  it("should bind every value as a parameter instead of building the sql", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([{ id: 1, stok: 10, harga_beli: 50000 }]);

    await createPurchase("Toko ' OR 1=1 --", [
      { produk_id: 1, nama: "O'Brien's cement", satuan: "sak", jumlah: 1, harga: 52000 },
    ]);

    for (const call of writes(/INSERT|UPDATE/)) {
      expect(call.sql).not.toContain("O'Brien");
      expect(call.sql).not.toContain("OR 1=1");
    }
    expect(writes(/INSERT INTO pembelian/)[0].params).toContain("Toko ' OR 1=1 --");
    expect(writes(/INSERT INTO item_pembelian/)[0].params).toContain("O'Brien's cement");
  });

  it("should roll back and skip the sync when a statement fails", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([{ id: 1, stok: 10, harga_beli: 50000 }]);
    failOn(/UPDATE produk/, "disk full");

    await expect(createPurchase("Toko ABC", [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 1, harga: 52000 },
    ])).rejects.toThrow("disk full");

    expect(transactionLog()).toEqual(["BEGIN IMMEDIATE", "ROLLBACK"]);
  });

  it("should roll back when the new purchase id cannot be read", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([]);
    mockDb.select.mockResolvedValueOnce([{ id: 0 }]);

    await expect(createPurchase("Toko ABC", [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 1, harga: 52000 },
    ])).rejects.toThrow("Gagal membuat pembelian");

    expect(transactionLog()).toEqual(["BEGIN IMMEDIATE", "ROLLBACK"]);
    expect(writes(/INSERT INTO item_pembelian/)).toHaveLength(0);
  });

  it("should auto-generate purchase number", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 3 }]);
    mockDb.select.mockResolvedValueOnce([{ id: 1, stok: 10, harga_beli: 50000 }]);

    const items: PurchaseEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 10, harga: 52000 },
    ];

    await createPurchase("Toko ABC", items);

    expect(writes(/INSERT INTO pembelian/)[0].params[1]).toMatch(/^PO-\d{8}-0004$/);
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

    const updates = writes(/UPDATE produk SET stok/);
    expect(updates).toHaveLength(1);
    const expectedHpp = Math.round((100 * 50000 + 50 * 56000) / (100 + 50));
    expect(updates[0].sql).toContain("harga_beli = $2");
    expect(updates[0].params).toEqual([50, expectedHpp, 1]);
  });

  it("should handle HPP when product has no prior stock data", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([]);

    const items: PurchaseEntry[] = [
      { produk_id: 99, nama: "Produk Baru", satuan: "pcs", jumlah: 20, harga: 30000 },
    ];

    await createPurchase("Supplier X", items);

    const updates = writes(/UPDATE produk SET stok/);
    expect(updates).toHaveLength(1);
    expect(updates[0].sql).not.toContain("harga_beli");
    expect(updates[0].params).toEqual([20, 99]);
  });

  it("should save partial payment as utang", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([{ id: 1, stok: 10, harga_beli: 50000 }]);

    const items: PurchaseEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 10, harga: 52000 },
    ];

    await createPurchase("Toko ABC", items, 200000);

    const [purchase] = writes(/INSERT INTO pembelian/);
    expect(purchase.params[2]).toBe(520000);
    expect(purchase.params[3]).toBe(200000);
  });

  it("should default dibayar to total when not provided", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([{ id: 1, stok: 5, harga_beli: 50000 }]);

    const items: PurchaseEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 5, harga: 52000 },
    ];

    await createPurchase("Toko DEF", items);

    const [purchase] = writes(/INSERT INTO pembelian/);
    const total = 5 * 52000;
    expect(purchase.params.slice(2)).toEqual([total, total]);
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
    mockDb.select.mockResolvedValueOnce([
      { id: 1, stok: 100 },
      { id: 2, stok: 50 },
    ]);

    const returItems = [
      { produk_id: 1, nama_produk: "Semen", jumlah: 10, harga_satuan: 52000 },
      { produk_id: 2, nama_produk: "Besi", jumlah: 5, harga_satuan: 45000 },
    ];

    const id = await createPurchaseReturn(1, returItems, "Barang cacat");
    expect(id).toBe(1);

    const [retur] = writes(/INSERT INTO retur_pembelian/);
    const expectedTotal = 10 * 52000 + 5 * 45000;
    expect(retur.params).toEqual([1, expectedTotal, "Barang cacat"]);

    expect(writes(/INSERT INTO item_retur_pembelian/)).toHaveLength(2);
    const stockReduces = writes(/UPDATE produk SET stok = stok -/);
    expect(stockReduces.map((u) => u.params)).toEqual([[10, 1], [5, 2]]);
    expect(transactionLog()).toEqual(["BEGIN IMMEDIATE", "COMMIT"]);
  });

  it("should roll back a purchase return when a statement fails", async () => {
    mockDb.select.mockResolvedValueOnce([{ id: 1, stok: 100 }]);
    failOn(/UPDATE produk/, "disk full");

    await expect(createPurchaseReturn(1, [
      { produk_id: 1, nama_produk: "Semen", jumlah: 1, harga_satuan: 52000 },
    ])).rejects.toThrow("disk full");

    expect(transactionLog()).toEqual(["BEGIN IMMEDIATE", "ROLLBACK"]);
  });

  it("should create purchase return with null alasan", async () => {
    mockDb.select.mockResolvedValueOnce([{ id: 1, stok: 100 }]);

    await createPurchaseReturn(1, [
      { produk_id: 1, nama_produk: "Semen", jumlah: 1, harga_satuan: 52000 },
    ]);

    expect(writes(/INSERT INTO retur_pembelian/)[0].params[2]).toBeNull();
  });

  it("should reject purchase return when stock is insufficient", async () => {
    mockDb.select.mockResolvedValueOnce([{ id: 1, stok: 5 }]);

    await expect(createPurchaseReturn(1, [
      { produk_id: 1, nama_produk: "Semen", jumlah: 10, harga_satuan: 52000 },
    ])).rejects.toThrow("Stok Semen tidak mencukupi untuk retur");

    expect(writes(/INSERT INTO retur_pembelian/)).toHaveLength(0);
    expect(transactionLog()).toEqual(["BEGIN IMMEDIATE", "ROLLBACK"]);
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

    expect(writes(/INSERT INTO pembelian/)[0].params[1]).toMatch(/^PO-\d{8}-0006$/);
  });
});
