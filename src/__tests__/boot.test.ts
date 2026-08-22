import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMock } from "./setup";

async function fresh() {
  vi.resetModules();
  return import("@/database");
}

describe("boot cost", () => {
  beforeEach(() => {
    resetMock();
    mockDb.batch.mockClear();
    mockDb.sync.mockClear();
  });

  it("builds the schema on a fresh database", async () => {
    mockDb.select.mockImplementation(async (sql: string) => {
      if (sql.includes("schema_version") || sql.includes("FROM settings")) return [];
      if (sql.includes("table_info")) return [];
      return [];
    });
    const { initDb } = await fresh();
    await initDb();
    expect(mockDb.batch).toHaveBeenCalledTimes(1);
  });

  it("skips all schema work once the version matches", async () => {
    const { SCHEMA_VERSION } = await fresh();
    mockDb.select.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM settings")) return [{ value: String(SCHEMA_VERSION) }];
      return [];
    });
    const { initDb } = await fresh();
    await initDb();
    expect(mockDb.batch).not.toHaveBeenCalled();
  });

  it("never sends a pragma that turso refuses", async () => {
    mockDb.select.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM settings")) return [];
      return [];
    });
    const { initDb } = await fresh();
    await initDb();
    const pragmas = mockDb.execute.mock.calls.map((c) => String(c[0])).filter((q) => /PRAGMA\s+user_version/i.test(q));
    expect(pragmas).toHaveLength(0);
  });

  it("survives a database with no settings table yet", async () => {
    mockDb.select.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM settings")) throw new Error("no such table: settings");
      return [];
    });
    const { initDb } = await fresh();
    await expect(initDb()).resolves.not.toThrow();
    expect(mockDb.batch).toHaveBeenCalledTimes(1);
  });

  it("costs a single query on a migrated database", async () => {
    const { SCHEMA_VERSION } = await fresh();
    mockDb.select.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM settings")) return [{ value: String(SCHEMA_VERSION) }];
      return [];
    });
    const { initDb, getDb } = await fresh();
    await getDb();
    mockDb.select.mockClear();
    mockDb.execute.mockClear();
    await initDb();
    expect(mockDb.select).toHaveBeenCalledTimes(1);
    expect(mockDb.execute).not.toHaveBeenCalled();
  });

  it("stamps the version so the next boot can skip", async () => {
    mockDb.select.mockImplementation(async (sql: string) => {
      if (sql.includes("schema_version") || sql.includes("FROM settings")) return [];
      if (sql.includes("table_info")) return [];
      return [];
    });
    const { initDb, SCHEMA_VERSION } = await fresh();
    await initDb();
    const stamped = mockDb.execute.mock.calls.some(
      (c) => String(c[0]).includes("INSERT OR REPLACE INTO settings") && String(c[1]).includes(String(SCHEMA_VERSION))
    );
    expect(stamped).toBe(true);
  });
});
