import { describe, it, expect, beforeEach } from "vitest";
import { resetMock, mockDb, writes, transactionLog, failOn } from "./setup";
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

    const [sale] = writes(/INSERT INTO penjualan/);
    const total = 5 * 58000 + 3 * 55000;
    expect(sale.params.slice(1, 4)).toEqual([total, 500000, 500000 - total]);

    expect(writes(/INSERT INTO item_penjualan/)).toHaveLength(2);
    const stockUpdates = writes(/UPDATE produk SET stok = stok -/);
    expect(stockUpdates.map((u) => u.params)).toEqual([[5, 1], [3, 2]]);
  });

  it("should write every statement inside one transaction", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);

    await createSale([
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 1, harga: 58000, stok: 100 },
    ], 58000);

    expect(transactionLog()).toEqual(["BEGIN IMMEDIATE", "COMMIT"]);
    const sqls = mockDb.execute.mock.calls.map(([sql]) => sql);
    expect(sqls[0]).toBe("BEGIN IMMEDIATE");
    expect(sqls[sqls.length - 1]).toBe("COMMIT");
  });

  it("should bind every value as a parameter instead of building the sql", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);

    await createSale([
      { produk_id: 1, nama: "O'Brien's cement", satuan: "sak", jumlah: 1, harga: 58000, stok: 100 },
    ], 58000, 1, "Pak ' OR 1=1 --");

    for (const call of writes(/INSERT|UPDATE/)) {
      expect(call.sql).not.toContain("O'Brien");
      expect(call.sql).not.toContain("OR 1=1");
    }
    expect(writes(/INSERT INTO item_penjualan/)[0].params).toContain("O'Brien's cement");
    expect(writes(/INSERT INTO penjualan/)[0].params).toContain("Pak ' OR 1=1 --");
  });

  it("should roll back and skip the sync when a statement fails", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    failOn(/INSERT INTO item_penjualan/, "disk full");

    await expect(createSale([
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 1, harga: 58000, stok: 100 },
    ], 58000)).rejects.toThrow("disk full");

    expect(transactionLog()).toEqual(["BEGIN IMMEDIATE", "ROLLBACK"]);
  });

  it("should roll back when the new sale id cannot be read", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([]);
    mockDb.select.mockResolvedValueOnce([{ id: 0 }]);

    await expect(createSale([
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 1, harga: 58000, stok: 100 },
    ], 58000)).rejects.toThrow("Gagal membuat penjualan");

    expect(transactionLog()).toEqual(["BEGIN IMMEDIATE", "ROLLBACK"]);
    expect(writes(/INSERT INTO item_penjualan/)).toHaveLength(0);
  });

  it("should generate invoice number with date prefix", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);

    const items: CartEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 1, harga: 58000, stok: 100 },
    ];

    await createSale(items, 58000);

    const [sale] = writes(/INSERT INTO penjualan/);
    expect(sale.params[0]).toMatch(/^INV-\d{8}-0001$/);
  });

  it("should create a sale with customer info", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);

    const items: CartEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 10, harga: 52200, stok: 100 },
    ];

    await createSale(items, 522000, 1, "Pak Budi");

    const [sale] = writes(/INSERT INTO penjualan/);
    expect(sale.sql).toContain("pelanggan_id");
    expect(sale.sql).toContain("nama_pelanggan");
    expect(sale.params[4]).toBe(1);
    expect(sale.params[5]).toBe("Pak Budi");
  });

  it("should create a sale without customer (null pelanggan)", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);

    const items: CartEntry[] = [
      { produk_id: 1, nama: "Semen", satuan: "sak", jumlah: 1, harga: 58000, stok: 100 },
    ];

    await createSale(items, 58000);

    const [sale] = writes(/INSERT INTO penjualan/);
    expect(sale.params[4]).toBeNull();
    expect(sale.params[5]).toBeNull();
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

    const [sale] = writes(/INSERT INTO penjualan/);
    const subtotal = 10 * 58000;
    expect(sale.params[1]).toBe(subtotal - diskon);
    expect(sale.params[6]).toBe(diskon);
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

    const [sale] = writes(/INSERT INTO penjualan/);
    expect(sale.params[1]).toBe(total);
    expect(sale.params[2]).toBe(total);
    expect(sale.params[3]).toBe(0);
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

    const inserts = writes(/INSERT INTO item_penjualan/);
    expect(inserts).toHaveLength(2);
    expect(inserts[0].sql).toContain("hpp");
    expect(inserts[0].params[6]).toBe(45000);
    expect(inserts[1].params[6]).toBe(38000);
  });

  it("should use hpp=0 when product not found", async () => {
    mockDb.select.mockResolvedValueOnce([{ count: 0 }]);
    mockDb.select.mockResolvedValueOnce([]);

    const items: CartEntry[] = [
      { produk_id: 999, nama: "Unknown", satuan: "pcs", jumlah: 1, harga: 10000, stok: 10 },
    ];

    await createSale(items, 10000);

    expect(writes(/INSERT INTO item_penjualan/)[0].params[6]).toBe(0);
  });

  it("should create a sale return and restore stock", async () => {
    const returItems = [
      { produk_id: 1, nama_produk: "Semen", jumlah: 3, harga_satuan: 58000 },
      { produk_id: 2, nama_produk: "Besi", jumlah: 1, harga_satuan: 55000 },
    ];

    const id = await createSaleReturn(1, returItems, "Barang rusak");
    expect(id).toBe(1);

    const [retur] = writes(/INSERT INTO retur_penjualan/);
    const expectedTotal = 3 * 58000 + 1 * 55000;
    expect(retur.params).toEqual([1, expectedTotal, "Barang rusak"]);

    expect(writes(/INSERT INTO item_retur_penjualan/)).toHaveLength(2);
    const stockRestores = writes(/UPDATE produk SET stok = stok \+/);
    expect(stockRestores.map((u) => u.params)).toEqual([[3, 1], [1, 2]]);
    expect(transactionLog()).toEqual(["BEGIN IMMEDIATE", "COMMIT"]);
  });

  it("should create sale return with null alasan", async () => {
    await createSaleReturn(1, [
      { produk_id: 1, nama_produk: "Semen", jumlah: 1, harga_satuan: 58000 },
    ]);

    expect(writes(/INSERT INTO retur_penjualan/)[0].params[2]).toBeNull();
  });

  it("should roll back a sale return when a statement fails", async () => {
    failOn(/UPDATE produk/, "disk full");

    await expect(createSaleReturn(1, [
      { produk_id: 1, nama_produk: "Semen", jumlah: 1, harga_satuan: 58000 },
    ])).rejects.toThrow("disk full");

    expect(transactionLog()).toEqual(["BEGIN IMMEDIATE", "ROLLBACK"]);
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
