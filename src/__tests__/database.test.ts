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
    expect(mockDb.execute).toHaveBeenCalledWith("PRAGMA journal_mode = WAL");
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
    expect(calls.some((c: string) => c.includes("CREATE TABLE IF NOT EXISTS settings"))).toBe(true);
  });

  it("should create indexes on initDb", async () => {
    const { initDb } = await import("@/database");
    await initDb();
    const calls = mockDb.execute.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls.some((c: string) => c.includes("idx_produk_kategori"))).toBe(true);
    expect(calls.some((c: string) => c.includes("idx_produk_kode"))).toBe(true);
    expect(calls.some((c: string) => c.includes("idx_penjualan_faktur"))).toBe(true);
  });
});
