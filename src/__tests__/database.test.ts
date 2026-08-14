import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMock, mockDb } from "./setup";

describe("database", () => {
  beforeEach(() => {
    resetMock();
    vi.resetModules();
  });

  it("should initialize and return a database instance", async () => {
    const { getDb } = await import("@/database");
    const db = await getDb();
    expect(db).toBeDefined();
    expect(db.execute).toBeDefined();
    expect(db.select).toBeDefined();
  });

  it("should set WAL pragma on init", async () => {
    const { getDb } = await import("@/database");
    await getDb();
    const calls = mockDb.execute.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls.some((c: string) => c.includes("PRAGMA journal_mode = WAL"))).toBe(true);
    expect(calls.some((c: string) => c.includes("PRAGMA synchronous = NORMAL"))).toBe(true);
    expect(calls.some((c: string) => c.includes("PRAGMA cache_size"))).toBe(true);
  });

  it("should create all tables on initDb", async () => {
    const { initDb } = await import("@/database");
    await initDb();
    const calls = mockDb.execute.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls.some((c: string) => c.includes("CREATE TABLE IF NOT EXISTS kategori"))).toBe(true);
    expect(calls.some((c: string) => c.includes("CREATE TABLE IF NOT EXISTS produk"))).toBe(true);
    expect(calls.some((c: string) => c.includes("CREATE TABLE IF NOT EXISTS penjualan"))).toBe(true);
    expect(calls.some((c: string) => c.includes("CREATE TABLE IF NOT EXISTS item_penjualan"))).toBe(true);
    expect(calls.some((c: string) => c.includes("CREATE TABLE IF NOT EXISTS pembelian"))).toBe(true);
    expect(calls.some((c: string) => c.includes("CREATE TABLE IF NOT EXISTS item_pembelian"))).toBe(true);
    expect(calls.some((c: string) => c.includes("CREATE TABLE IF NOT EXISTS pelanggan"))).toBe(true);
    expect(calls.some((c: string) => c.includes("CREATE TABLE IF NOT EXISTS harga_pelanggan"))).toBe(true);
    expect(calls.some((c: string) => c.includes("CREATE TABLE IF NOT EXISTS settings"))).toBe(true);
  });

  it("should create indexes on initDb", async () => {
    const { initDb } = await import("@/database");
    await initDb();
    const batchCalls = mockDb.batch.mock.calls.flatMap((c: unknown[]) => c[0] as string[]);
    expect(batchCalls.some((c: string) => c.includes("idx_produk_kategori"))).toBe(true);
    expect(batchCalls.some((c: string) => c.includes("idx_produk_kode"))).toBe(true);
    expect(batchCalls.some((c: string) => c.includes("idx_penjualan_faktur"))).toBe(true);
    expect(batchCalls.some((c: string) => c.includes("idx_harga_pelanggan_pelanggan"))).toBe(true);
    expect(batchCalls.some((c: string) => c.includes("idx_harga_pelanggan_produk"))).toBe(true);
    expect(batchCalls.some((c: string) => c.includes("idx_penjualan_pelanggan"))).toBe(true);
  });

  it("should run migration alters on initDb", async () => {
    const { initDb } = await import("@/database");
    await initDb();
    const calls = mockDb.execute.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls.some((c: string) => c.includes("ALTER TABLE produk ADD COLUMN gambar"))).toBe(true);
    expect(calls.some((c: string) => c.includes("ALTER TABLE penjualan ADD COLUMN pelanggan_id"))).toBe(true);
    expect(calls.some((c: string) => c.includes("ALTER TABLE penjualan ADD COLUMN nama_pelanggan"))).toBe(true);
  });

  it("should only backfill purchase payments for old schemas", async () => {
    mockDb.select.mockResolvedValueOnce([{ name: "dibayar" }]);

    const { initDb } = await import("@/database");
    await initDb();

    const calls = mockDb.execute.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls.some((c: string) => c.includes("UPDATE pembelian SET dibayar = total"))).toBe(false);
  });
});
