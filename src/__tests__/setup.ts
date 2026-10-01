import { vi } from "vitest";

const rows: Record<string, unknown[][]> = {};
let autoId = 1;
let lastId = 0;

function getTable(sql: string): string {
  const insertMatch = sql.match(/INSERT INTO (\w+)/i);
  if (insertMatch) return insertMatch[1];
  const selectMatch = sql.match(/FROM (\w+)/i);
  if (selectMatch) return selectMatch[1];
  const deleteMatch = sql.match(/DELETE FROM (\w+)/i);
  if (deleteMatch) return deleteMatch[1];
  const updateMatch = sql.match(/UPDATE (\w+)/i);
  if (updateMatch) return updateMatch[1];
  const createMatch = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
  if (createMatch) return createMatch[1];
  const indexMatch = sql.match(/CREATE INDEX/i);
  if (indexMatch) return "__index__";
  const pragmaMatch = sql.match(/PRAGMA/i);
  if (pragmaMatch) return "__pragma__";
  return "__unknown__";
}

async function defaultExecute(sql: string, _params?: unknown[]) {
  const table = getTable(sql);
  if (sql.match(/INSERT/i)) {
    if (!rows[table]) rows[table] = [];
    rows[table].push(_params ?? []);
    lastId = autoId++;
    return { lastInsertId: lastId, rowsAffected: 1 };
  }
  return { lastInsertId: 0, rowsAffected: 1 };
}

async function defaultSelect(sql: string, _params?: unknown[]): Promise<Record<string, unknown>[]> {
  if (sql.match(/last_insert_rowid/i)) {
    return [{ id: lastId }];
  }
  if (sql.match(/COUNT\(\*\)/i)) {
    return [{ count: 0 }];
  }
  if (sql.match(/COALESCE\(SUM/i)) {
    return [{ total: 0 }];
  }
  if (sql.match(/sqlite_sequence/i)) {
    return [{ seq: 1 }];
  }
  return [];
}

const mockDb = {
  execute: vi.fn(defaultExecute),
  select: vi.fn(defaultSelect),
  batch: vi.fn(async () => []),
  sync: vi.fn(async () => {}),
};

vi.mock("tauri-plugin-libsql-api", () => ({
  Database: {
    load: vi.fn(async () => mockDb),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => null),
}));

vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: vi.fn(async () => "C:/Users/test/AppData/Roaming/com.marvelcollin.polaris/"),
}));

export { mockDb, rows, autoId };

export function writes(pattern: RegExp) {
  return mockDb.execute.mock.calls
    .filter(([sql]) => pattern.test(sql))
    .map(([sql, params]) => ({ sql, params: params ?? [] }));
}

export function transactionLog() {
  return mockDb.execute.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => /^(BEGIN|COMMIT|ROLLBACK)/.test(sql));
}

export function failOn(pattern: RegExp, message: string) {
  mockDb.execute.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (pattern.test(sql)) throw new Error(message);
    return defaultExecute(sql, params);
  });
}

export function resetMock() {
  mockDb.execute.mockReset();
  mockDb.select.mockReset();
  mockDb.batch.mockReset();
  mockDb.batch.mockImplementation(async () => []);
  mockDb.execute.mockImplementation(defaultExecute);
  mockDb.select.mockImplementation(defaultSelect);
  Object.keys(rows).forEach((k) => delete rows[k]);
  autoId = 1;
  lastId = 0;
}
