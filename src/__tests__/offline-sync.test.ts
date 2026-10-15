import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Database } from "tauri-plugin-libsql-api";
import { invoke } from "@tauri-apps/api/core";
import { defaultInvoke, TEST_TURSO } from "./setup";

const BASE = 9_000_000_000_000;

interface Call {
  sql: string;
  params: unknown[];
}

const net = { up: true };
const files = new Map<string, string>();
let failStoreWrite = false;

function fakeRemote() {
  let nextId = 100;
  let lastId = 0;
  const calls: Call[] = [];
  const applied = new Map<string, string>();
  const taken = new Set<string>();
  const state = { reject: null as RegExp | null, dieOn: null as RegExp | null, counts: new Map<RegExp, number>() };

  function guard(sql: string) {
    if (!net.up) throw new Error("http dispatch error: dns error");
    if (state.dieOn?.test(sql)) {
      net.up = false;
      throw new Error("http dispatch error: connection reset");
    }
    if (state.reject?.test(sql)) throw new Error("UNIQUE constraint failed");
  }

  return {
    path: TEST_TURSO.url,
    calls,
    applied,
    taken,
    state,
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      guard(sql);
      calls.push({ sql, params });
      if (/INSERT INTO _applied_ops/.test(sql)) {
        applied.set(params[0] as string, params[1] as string);
        return { lastInsertId: 0, rowsAffected: 1 };
      }
      if (/INSERT INTO penjualan/.test(sql)) taken.add(params[0] as string);
      if (/^\s*INSERT/i.test(sql)) {
        lastId = nextId++;
        return { lastInsertId: lastId, rowsAffected: 1 };
      }
      return { lastInsertId: 0, rowsAffected: 1 };
    }),
    select: vi.fn(async (sql: string, params: unknown[] = []) => {
      guard(sql);
      calls.push({ sql, params });
      if (/last_insert_rowid/.test(sql)) return [{ id: lastId }];
      if (/FROM _applied_ops/.test(sql)) {
        const result = applied.get(params[0] as string);
        return result === undefined ? [] : [{ result }];
      }
      for (const [pattern, count] of state.counts) if (pattern.test(sql)) return [{ count }];
      if (/SELECT 1 FROM penjualan WHERE nomor_faktur/.test(sql)) return taken.has(params[0] as string) ? [{ 1: 1 }] : [];
      if (/COUNT\(\*\)/.test(sql)) return [{ count: 0 }];
      if (/FROM kategori/.test(sql)) return [{ id: 1, nama: "Semen" }];
      return [];
    }),
    batch: vi.fn(async (queries: string[]) => {
      for (const q of queries) guard(q);
      calls.push(...queries.map((sql) => ({ sql, params: [] })));
    }),
    sync: vi.fn(async () => {}),
    close: vi.fn(async () => true),
  };
}

type Remote = ReturnType<typeof fakeRemote>;
let remote: Remote;

const store = new Map<string, string>();
const memoryStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
};

function writesTo(pattern: RegExp) {
  return remote.calls.filter((c) => pattern.test(c.sql));
}

function outbox(): { ops: { name: string; args: string; status: string }[] } {
  return JSON.parse(files.get("outbox") ?? '{"ops":[]}');
}

async function start() {
  vi.resetModules();
  const database = await import("@/database");
  const customers = await import("@/db/customers");
  const sales = await import("@/db/sales");
  const categories = await import("@/db/categories");
  await database.getDb();
  return { database, customers, sales, categories };
}

function item(produk_id: number) {
  return { produk_id, nama: "Semen", satuan: "sak", jumlah: 2, harga: 50000, stok: 10 };
}

async function flushCache() {
  await vi.advanceTimersByTimeAsync(6000);
}

describe("turso only, with an in-app offline queue and read cache", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(new Date("2026-10-15T09:00:00+07:00"));
    net.up = true;
    files.clear();
    failStoreWrite = false;
    store.clear();
    vi.stubGlobal("localStorage", memoryStorage);
    remote = fakeRemote();
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) => {
      if (cmd === "turso_reachable") return net.up;
      if (cmd === "app_store_read") return files.get((args as { name: string }).name) ?? null;
      if (cmd === "app_store_write") {
        if (failStoreWrite) throw "disk full";
        const { name, content } = args as { name: string; content: string };
        files.set(name, content);
        return null;
      }
      return defaultInvoke(cmd);
    });
    vi.mocked(Database.load).mockImplementation(async () => remote as unknown as Database);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation((cmd: string) => defaultInvoke(cmd));
  });

  it("writes straight to turso inside one transaction with an idempotency record", async () => {
    const { categories } = await start();
    await categories.createCategory("Semen");
    const log = remote.calls.map((c) => c.sql).filter((sql) => !/CREATE TABLE|DELETE FROM _applied_ops/.test(sql));
    expect(log).toEqual([
      "BEGIN IMMEDIATE",
      "INSERT INTO kategori (nama) VALUES ($1)",
      "INSERT INTO _applied_ops (id, result, dibuat_pada) VALUES ($1, $2, $3)",
      "COMMIT",
    ]);
  });

  it("does not create any local database file", async () => {
    await start();
    const loads = vi.mocked(Database.load).mock.calls.map(([options]) => (typeof options === "string" ? options : options.path));
    expect(loads.every((path) => path.startsWith("libsql://"))).toBe(true);
    expect(remote.calls.some((c) => /PRAGMA/.test(c.sql))).toBe(false);
  });

  it("explains when the server connection is not configured", async () => {
    vi.mocked(invoke).mockImplementation(async () => null);
    vi.resetModules();
    const { getDb, NOT_CONFIGURED_MESSAGE } = await import("@/database");
    await expect(getDb()).rejects.toThrow(NOT_CONFIGURED_MESSAGE);
  });

  it("serves a repeated read from cache instead of asking turso again", async () => {
    const { categories } = await start();
    await categories.getCategories();
    await categories.getCategories();
    expect(writesTo(/FROM kategori/)).toHaveLength(1);
  });

  it("asks turso again once the cached read is older than the fresh window", async () => {
    const { categories, database } = await start();
    await categories.getCategories();
    vi.setSystemTime(Date.now() + database.CACHE_FRESH_MS + 1);
    await categories.getCategories();
    expect(writesTo(/FROM kategori/)).toHaveLength(2);
  });

  it("drops cached reads of a table right after this computer writes to it", async () => {
    const { categories, customers } = await start();
    await categories.getCategories();
    await customers.getCustomers();
    await categories.createCategory("Cat");
    await categories.getCategories();
    await customers.getCustomers();
    expect(writesTo(/SELECT \* FROM kategori/)).toHaveLength(2);
    expect(writesTo(/SELECT \* FROM pelanggan/)).toHaveLength(1);
  });

  it("never serves cached rows inside a write so invoice numbers stay correct", async () => {
    const { sales } = await start();
    const todayCount = /COUNT\(\*\) as count FROM penjualan/;
    remote.state.counts.set(todayCount, 0);
    await sales.createSale([item(7)], 100000);
    remote.state.counts.set(todayCount, 1);
    await sales.createSale([item(7)], 100000);
    const numbers = writesTo(/INSERT INTO penjualan/).map((c) => c.params[0]);
    expect(numbers).toEqual(["INV-20261015-0001", "INV-20261015-0002"]);
  });

  it("returns copies so a caller editing results cannot corrupt the cache", async () => {
    const { categories } = await start();
    const first = await categories.getCategories();
    first[0].nama = "Diubah";
    const second = await categories.getCategories();
    expect(second[0].nama).toBe("Semen");
  });

  it("keeps working offline by queueing writes in the app instead of a database", async () => {
    net.up = false;
    const { database, categories } = await start();
    expect(database.connectionStatus().mode).toBe("offline");
    const id = await categories.createCategory("Semen");
    expect(id).toBeGreaterThan(BASE);
    expect(remote.calls).toHaveLength(0);
    expect(outbox().ops.map((op) => op.name)).toEqual(["createCategory"]);
    expect(database.connectionStatus().pending).toBe(1);
  });

  it("does not report success when the offline queue cannot be saved", async () => {
    net.up = false;
    const { database, categories } = await start();
    failStoreWrite = true;
    await expect(categories.createCategory("Semen")).rejects.toThrow(/Gagal menyimpan transaksi offline/);
    expect(database.connectionStatus().pending).toBe(0);
  });

  it("shows cached data while offline", async () => {
    const first = await start();
    await first.categories.getCategories();
    await flushCache();

    net.up = false;
    const second = await start();
    expect(await second.categories.getCategories()).toEqual([{ id: 1, nama: "Semen" }]);
  });

  it("says clearly when data was never opened before going offline", async () => {
    net.up = false;
    const { database, customers } = await start();
    await expect(customers.getCustomers()).rejects.toThrow(database.NOT_CACHED_MESSAGE);
  });

  it("switches to cached data when the connection drops while browsing", async () => {
    const { database, categories } = await start();
    await categories.getCategories();
    vi.setSystemTime(Date.now() + database.CACHE_FRESH_MS + 1);
    net.up = false;
    expect(await categories.getCategories()).toEqual([{ id: 1, nama: "Semen" }]);
    expect(database.connectionStatus().mode).toBe("offline");
  });

  it("boots offline without touching the schema or seeding", async () => {
    net.up = false;
    const { database } = await start();
    const { seedDatabase } = await import("@/db/seed");
    const { initPassword } = await import("@/db/auth");
    await database.initDb();
    await seedDatabase();
    await initPassword();
    expect(remote.calls).toHaveLength(0);
  });

  it("sends offline sales to turso on reconnect with offline ids swapped for turso ids", async () => {
    net.up = false;
    const { database, customers, sales } = await start();
    const customerId = await customers.createCustomer({ nama: "Budi", telepon: null, alamat: null });
    await sales.createSale([item(7)], 100000, customerId, "Budi");

    net.up = true;
    expect(await database.reconnect()).toBe(true);

    expect(writesTo(/INSERT INTO pelanggan/)[0].params[0]).toBe("Budi");
    expect(writesTo(/INSERT INTO penjualan/)[0].params[4]).toBe(100);
    expect(writesTo(/INSERT INTO item_penjualan/)[0].params[1]).toBe(7);
    expect(database.connectionStatus()).toMatchObject({ mode: "online", pending: 0, failed: [] });
    expect(outbox().ops).toHaveLength(0);
  });

  it("replays deletes made offline, including deletes of rows created offline", async () => {
    net.up = false;
    const { database, customers } = await start();
    await customers.deleteCustomer(5);
    const temp = await customers.createCustomer({ nama: "Sementara", telepon: null, alamat: null });
    await customers.deleteCustomer(temp);

    net.up = true;
    await database.reconnect();
    expect(writesTo(/DELETE FROM pelanggan/).map((c) => c.params[0])).toEqual([5, 100]);
  });

  it("re-checks delete safety rules against turso during replay", async () => {
    net.up = false;
    const { database, customers } = await start();
    await customers.deleteCustomer(5);

    net.up = true;
    remote.state.counts.set(/COUNT\(\*\) as count FROM penjualan WHERE pelanggan_id/, 3);
    await database.reconnect();

    expect(writesTo(/DELETE FROM pelanggan/)).toHaveLength(0);
    expect(database.connectionStatus().failed).toEqual([
      { name: "deleteCustomer", error: "Pelanggan tidak dapat dihapus karena sudah memiliki transaksi" },
    ]);
  });

  it("replays at boot when the app starts online with queued work", async () => {
    net.up = false;
    const first = await start();
    await first.categories.createCategory("Cat");

    net.up = true;
    const second = await start();
    expect(second.database.connectionStatus().mode).toBe("online");
    expect(writesTo(/INSERT INTO kategori/)).toHaveLength(1);
  });

  it("keeps queued work across a restart while still offline", async () => {
    net.up = false;
    const first = await start();
    await first.categories.createCategory("Cat");
    const second = await start();
    expect(second.database.connectionStatus()).toMatchObject({ mode: "offline", pending: 1 });
    const id = await second.categories.createCategory("Kayu");
    expect(id).toBe(BASE + 2);
    expect(outbox().ops).toHaveLength(2);
  });

  it("does not apply a write twice when turso already committed it", async () => {
    net.up = false;
    const { database, categories } = await start();
    await categories.createCategory("Cat");
    const saved = JSON.parse(files.get("outbox")!);
    remote.applied.set(saved.ops[0].id, "123");

    net.up = true;
    await database.reconnect();
    expect(writesTo(/INSERT INTO kategori/)).toHaveLength(0);
  });

  it("resumes a replay that was cut off and still maps ids from the finished part", async () => {
    net.up = false;
    const { database, customers, sales } = await start();
    const customerId = await customers.createCustomer({ nama: "Budi", telepon: null, alamat: null });
    await sales.createSale([item(7)], 100000, customerId);

    net.up = true;
    remote.state.dieOn = /INSERT INTO penjualan/;
    expect(await database.reconnect()).toBe(false);
    expect(database.connectionStatus().mode).toBe("offline");
    expect(outbox().ops.map((op) => op.status)).toEqual(["applied", "pending"]);

    remote.state.dieOn = null;
    net.up = true;
    const restarted = await start();
    expect(restarted.database.connectionStatus().mode).toBe("online");
    expect(writesTo(/INSERT INTO pelanggan/)).toHaveLength(1);
    expect(writesTo(/INSERT INTO penjualan/)[0].params[4]).toBe(100);
  });

  it("marks a rejected write as failed, keeps going, and fails writes that depend on it", async () => {
    net.up = false;
    const { database, customers, sales, categories } = await start();
    const customerId = await customers.createCustomer({ nama: "Budi", telepon: null, alamat: null });
    await sales.createSale([item(7)], 100000, customerId);
    await categories.createCategory("Cat");

    net.up = true;
    remote.state.reject = /INSERT INTO pelanggan/;
    await database.reconnect();

    expect(writesTo(/INSERT INTO kategori/)).toHaveLength(1);
    expect(writesTo(/INSERT INTO penjualan/)).toHaveLength(0);
    expect(database.connectionStatus().failed.map((f) => f.name)).toEqual(["createCustomer", "createSale"]);

    const after = await start();
    expect(after.database.connectionStatus().failed).toHaveLength(2);
    after.database.dismissFailedOps();
    expect(after.database.connectionStatus().failed).toHaveLength(0);
  });

  it("queues the sale instead of losing it when the connection drops mid sale", async () => {
    const { database, sales } = await start();
    remote.state.dieOn = /INSERT INTO item_penjualan/;
    const saleId = await sales.createSale([item(7)], 100000);

    expect(saleId).toBeGreaterThan(BASE);
    expect(database.connectionStatus().mode).toBe("offline");
    expect(outbox().ops.map((op) => op.name)).toEqual(["createSale"]);
  });

  it("does not duplicate a sale turso committed just before the connection dropped", async () => {
    const { database, sales } = await start();
    remote.state.dieOn = /^COMMIT$/;
    await sales.createSale([item(7)], 100000);
    expect(database.connectionStatus().mode).toBe("offline");

    remote.state.dieOn = null;
    net.up = true;
    await database.reconnect();
    expect(writesTo(/INSERT INTO penjualan/)).toHaveLength(1);
    expect(database.connectionStatus().failed).toEqual([]);
  });

  it("prints a receipt for a sale queued offline", async () => {
    net.up = false;
    const { sales } = await start();
    const saleId = await sales.createSale([item(7), { ...item(8), nama: "Pasir", jumlah: 1, harga: 30000 }], 200000, null, "Budi", 10000);
    const sale = await sales.getSaleById(saleId);
    const items = await sales.getSaleItems(saleId);
    expect(sale).toMatchObject({
      id: saleId,
      nomor_faktur: "INV-20261015-OFF0001",
      total: 120000,
      dibayar: 200000,
      kembalian: 80000,
      diskon: 10000,
      nama_pelanggan: "Budi",
    });
    expect(items.map((i) => [i.nama_produk, i.jumlah, i.subtotal])).toEqual([
      ["Semen", 2, 100000],
      ["Pasir", 1, 30000],
    ]);
  });

  it("keeps the original sale time and offline invoice number when replaying later", async () => {
    net.up = false;
    const { database, sales } = await start();
    await sales.createSale([item(7)], 100000);

    vi.setSystemTime(new Date("2026-10-17T15:00:00+07:00"));
    net.up = true;
    await database.reconnect();

    const sale = writesTo(/INSERT INTO penjualan/)[0];
    expect(sale.params[0]).toBe("INV-20261015-OFF0001");
    expect(sale.params[8]).toBe(Math.floor(new Date("2026-10-15T09:00:00+07:00").getTime() / 1000));
  });

  it("picks a normal invoice number when the offline one was already taken", async () => {
    net.up = false;
    const { database, sales } = await start();
    await sales.createSale([item(7)], 100000);
    remote.taken.add("INV-20261015-OFF0001");
    remote.state.counts.set(/COUNT\(\*\) as count FROM penjualan/, 4);

    net.up = true;
    await database.reconnect();
    expect(writesTo(/INSERT INTO penjualan/)[0].params[0]).toBe("INV-20261015-0005");
  });

  it("keeps omitted arguments omitted so defaults still apply on replay", async () => {
    net.up = false;
    const { database, sales } = await start();
    await sales.createSale([item(7)], 100000);

    net.up = true;
    await database.reconnect();
    const sale = writesTo(/INSERT INTO penjualan/)[0];
    expect(sale.params[6]).toBe(0);
    expect(sale.params[4]).toBeNull();
  });

  it("refuses to wipe transactions while offline instead of queueing it", async () => {
    net.up = false;
    const { database } = await start();
    await expect(database.resetTransactionData()).rejects.toThrow(database.ONLINE_ONLY_MESSAGE);
    expect(outbox().ops).toHaveLength(0);
  });

  it("refuses a drive restore while offline or while offline work is still queued", async () => {
    net.up = false;
    const { categories } = await start();
    const { restoreBackup } = await import("@/db/backup");
    await expect(restoreBackup("file")).rejects.toThrow(/butuh koneksi internet/);
    await categories.createCategory("Cat");
    expect(vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === "gdrive_restore")).toBe(false);
  });

  it("queues concurrent offline writes in order without losing any", async () => {
    net.up = false;
    const { categories } = await start();
    await Promise.all(["A", "B", "C", "D", "E"].map((n) => categories.createCategory(n)));
    expect(outbox().ops.map((op) => JSON.parse(op.args)[0])).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("holds a new write until the replay finishes instead of mixing them", async () => {
    net.up = false;
    const { database, categories } = await start();
    await categories.createCategory("Offline");

    net.up = true;
    await Promise.all([database.reconnect(), categories.createCategory("Baru")]);
    expect(writesTo(/INSERT INTO kategori/).map((c) => c.params[0])).toEqual(["Offline", "Baru"]);
    expect(remote.applied.size).toBe(2);
  });

  it("retries the connection on its own while offline", async () => {
    net.up = false;
    const { database, categories } = await start();
    await categories.createCategory("Cat");
    net.up = true;
    await vi.advanceTimersByTimeAsync(database.RECONNECT_INTERVAL_MS + 10);
    expect(database.connectionStatus().mode).toBe("online");
    expect(writesTo(/INSERT INTO kategori/)).toHaveLength(1);
  });
});
