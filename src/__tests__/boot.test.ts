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
      if (sql.includes("user_version")) return [{ user_version: 0 }];
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
      if (sql.includes("user_version")) return [{ user_version: SCHEMA_VERSION }];
      return [];
    });
    const { initDb } = await fresh();
    await initDb();
    expect(mockDb.batch).not.toHaveBeenCalled();
  });

  it("costs a single query on a migrated database", async () => {
    const { SCHEMA_VERSION } = await fresh();
    mockDb.select.mockImplementation(async (sql: string) => {
      if (sql.includes("user_version")) return [{ user_version: SCHEMA_VERSION }];
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
      if (sql.includes("user_version")) return [{ user_version: 0 }];
      if (sql.includes("table_info")) return [];
      return [];
    });
    const { initDb, SCHEMA_VERSION } = await fresh();
    await initDb();
    const stamped = mockDb.execute.mock.calls.some((c) => String(c[0]).includes(`PRAGMA user_version = ${SCHEMA_VERSION}`));
    expect(stamped).toBe(true);
  });
});
