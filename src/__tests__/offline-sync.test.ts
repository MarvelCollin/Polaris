import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Database } from "tauri-plugin-libsql-api";
import { invoke } from "@tauri-apps/api/core";
import "./setup";

const CONFIG = { url: "libsql://polaris-test", token: "test-token" };
const BASE = 9_000_000_000_000;

interface Call {
  sql: string;
  params: unknown[];
}

interface OutboxRecord {
  seq: number;
  id: string;
  name: string;
  args: string;
  kept: string | null;
  result: string | null;
  remote_result: string | null;
  status: number;
  error: string | null;
  dibuat_pada: number;
}

function fakeDb(kind: "remote" | "offline") {
  let nextId = kind === "offline" ? BASE + 1 : 100;
  let lastId = 0;
  const calls: Call[] = [];
  const outbox: OutboxRecord[] = [];
  const applied = new Map<string, string>();
  const taken = new Set<string>();
  const state = { down: false, reject: null as RegExp | null, dieOn: null as RegExp | null };

  function guard(sql: string) {
    if (kind === "remote" && state.down) throw new Error("http dispatch error: dns error");
    if (state.dieOn?.test(sql)) {
      state.down = true;
      net.up = false;
      throw new Error("http dispatch error: connection reset");
    }
    if (state.reject?.test(sql)) throw new Error("UNIQUE constraint failed");
  }

  const db = {
    path: kind === "remote" ? CONFIG.url : "sqlite:C:/app/offline/polaris.db",
    calls,
    outbox,
    applied,
    taken,
    state,
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      guard(sql);
      calls.push({ sql, params });
      if (/INSERT INTO _outbox/.test(sql)) {
        outbox.push({
          seq: outbox.length + 1,
          id: params[0] as string,
          name: params[1] as string,
          args: params[2] as string,
          kept: params[3] as string,
          result: params[4] as string,
          remote_result: null,
          status: params[5] as number,
          error: null,
          dibuat_pada: params[6] as number,
        });
        return { lastInsertId: 0, rowsAffected: 1 };
      }
      if (/UPDATE _outbox SET status = \$1, remote_result/.test(sql)) {
        const row = outbox.find((r) => r.seq === params[2])!;
        row.status = params[0] as number;
        row.remote_result = params[1] as string;
        return { lastInsertId: 0, rowsAffected: 1 };
      }
      if (/UPDATE _outbox SET status = \$1, error/.test(sql)) {
        const row = outbox.find((r) => r.seq === params[2])!;
        row.status = params[0] as number;
        row.error = params[1] as string;
        return { lastInsertId: 0, rowsAffected: 1 };
      }
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
      if (sql === "SELECT 1") return [{ ok: 1 }];
      if (/last_insert_rowid/.test(sql)) return [{ id: lastId }];
      if (/FROM _outbox WHERE status/.test(sql)) return [{ count: outbox.filter((r) => r.status === 0).length }];
      if (/SELECT \* FROM _outbox/.test(sql)) return outbox.map((r) => ({ ...r }));
      if (/FROM _applied_ops/.test(sql)) {
        const result = applied.get(params[0] as string);
        return result === undefined ? [] : [{ result }];
      }
      if (/SELECT 1 FROM penjualan WHERE nomor_faktur/.test(sql)) return taken.has(params[0] as string) ? [{ 1: 1 }] : [];
      if (/COUNT\(\*\)/.test(sql)) return [{ count: 0 }];
      return [];
    }),
    batch: vi.fn(async (queries: string[]) => {
      for (const q of queries) guard(q);
      calls.push(...queries.map((sql) => ({ sql, params: [] })));
    }),
    sync: vi.fn(async () => {}),
    close: vi.fn(async () => true),
  };
  return db;
}

type Fake = ReturnType<typeof fakeDb>;

const net = { up: true };
let remote: Fake;
let offline: Fake | null;
let mirror: boolean;
let discarded: number;
const store = new Map<string, string>();
const memoryStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
};

function writesTo(db: Fake, pattern: RegExp) {
  return db.calls.filter((c) => pattern.test(c.sql));
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

describe("turso is the source of truth with an offline outbox", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(new Date("2026-10-15T09:00:00+07:00"));
    net.up = true;
    remote = fakeDb("remote");
    offline = null;
    mirror = true;
    discarded = 0;
    store.clear();
    vi.stubGlobal("localStorage", memoryStorage);
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_turso_config") return CONFIG;
      if (cmd === "turso_reachable") return net.up;
      if (cmd === "offline_db_exists") return offline !== null;
      if (cmd === "prepare_offline_db") {
        if (!offline && !mirror) throw "Tidak ada koneksi ke server dan komputer ini belum punya salinan data.";
        offline ??= fakeDb("offline");
        return "C:/app/offline/polaris.db";
      }
      if (cmd === "discard_offline_db") {
        offline = null;
        discarded++;
        return null;
      }
      return null;
    });
    vi.mocked(Database.load).mockImplementation(async (options: unknown) => {
      const path = typeof options === "string" ? options : (options as { path: string }).path;
      if (path.startsWith("libsql://")) {
        remote.state.down = !net.up;
        return remote as unknown as Database;
      }
      return offline as unknown as Database;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation(async () => null);
    vi.mocked(Database.load).mockReset();
  });

  it("writes straight to turso when online and keeps no local copy of the write", async () => {
    const { database, categories } = await start();
    expect(database.connectionStatus().mode).toBe("online");
    await categories.createCategory("Semen");
    const log = remote.calls.map((c) => c.sql).filter((sql) => !/^SELECT 1$|CREATE TABLE|DELETE FROM _applied_ops/.test(sql));
    expect(log).toEqual([
      "BEGIN IMMEDIATE",
      "INSERT INTO kategori (nama) VALUES ($1)",
      "INSERT INTO _applied_ops (id, result, dibuat_pada) VALUES ($1, $2, $3)",
      "COMMIT",
    ]);
    expect(offline).toBeNull();
  });

  it("never sends local pragmas to turso", async () => {
    await start();
    expect(remote.calls.some((c) => /PRAGMA/.test(c.sql))).toBe(false);
  });

  it("keeps working offline and records every write in the outbox in the same transaction", async () => {
    net.up = false;
    const { database, categories } = await start();
    expect(database.connectionStatus().mode).toBe("offline");
    const id = await categories.createCategory("Semen");
    expect(id).toBeGreaterThanOrEqual(BASE);
    const log = offline!.calls.map((c) => c.sql).filter((sql) => !/PRAGMA|_outbox \(seq|sqlite_sequence|SELECT COUNT/.test(sql));
    expect(log).toEqual([
      "BEGIN IMMEDIATE",
      "INSERT INTO kategori (nama) VALUES ($1)",
      "INSERT INTO _outbox (id, name, args, kept, result, status, dibuat_pada) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      "COMMIT",
    ]);
    expect(remote.calls).toHaveLength(0);
    expect(database.connectionStatus().pending).toBe(1);
  });

  it("moves offline ids into a range that can never clash with turso ids", async () => {
    net.up = false;
    await start();
    const sequence = offline!.calls.map((c) => c.sql).join("\n");
    expect(sequence).toContain(`UPDATE sqlite_sequence SET seq = ${BASE}`);
    expect(sequence).toContain(`INSERT INTO sqlite_sequence (name, seq) SELECT name, ${BASE}`);
  });

  it("explains clearly when it is offline and has never downloaded data", async () => {
    net.up = false;
    mirror = false;
    vi.resetModules();
    const { getDb } = await import("@/database");
    await expect(getDb()).rejects.toMatch(/belum punya salinan data/);
  });

  it("can retry booting after the first attempt failed", async () => {
    net.up = false;
    mirror = false;
    vi.resetModules();
    const { getDb, connectionStatus } = await import("@/database");
    await expect(getDb()).rejects.toBeDefined();
    net.up = true;
    await getDb();
    expect(connectionStatus().mode).toBe("online");
  });

  it("sends offline sales to turso on reconnect with offline ids swapped for turso ids", async () => {
    net.up = false;
    const { database, customers, sales } = await start();
    const customerId = await customers.createCustomer({ nama: "Budi", telepon: null, alamat: null });
    await sales.createSale([item(7)], 100000, customerId, "Budi");

    net.up = true;
    expect(await database.reconnect()).toBe(true);

    const customer = writesTo(remote, /INSERT INTO pelanggan/)[0];
    const sale = writesTo(remote, /INSERT INTO penjualan/)[0];
    const remoteCustomerId = 100;
    expect(customer.params[0]).toBe("Budi");
    expect(sale.params[4]).toBe(remoteCustomerId);
    expect(writesTo(remote, /INSERT INTO item_penjualan/)[0].params[1]).toBe(7);
    expect(database.connectionStatus()).toMatchObject({ mode: "online", pending: 0, failed: [] });
    expect(discarded).toBe(1);
  });

  it("replays deletes made offline, including deletes of rows created offline", async () => {
    net.up = false;
    const { database, customers } = await start();
    await customers.deleteCustomer(5);
    const temp = await customers.createCustomer({ nama: "Sementara", telepon: null, alamat: null });
    await customers.deleteCustomer(temp);

    net.up = true;
    await database.reconnect();

    const deletes = writesTo(remote, /DELETE FROM pelanggan/).map((c) => c.params[0]);
    expect(deletes).toEqual([5, 100]);
  });

  it("re-checks delete safety rules against turso during replay", async () => {
    net.up = false;
    const { database, customers } = await start();
    await customers.deleteCustomer(5);

    net.up = true;
    remote.select.mockImplementation(async (sql: string) => {
      if (/COUNT\(\*\) as count FROM penjualan WHERE pelanggan_id/.test(sql)) return [{ count: 3 }];
      if (sql === "SELECT 1") return [{ ok: 1 }];
      return [];
    });
    await database.reconnect();

    expect(writesTo(remote, /DELETE FROM pelanggan/)).toHaveLength(0);
    expect(database.connectionStatus().failed).toEqual([
      { name: "deleteCustomer", error: "Pelanggan tidak dapat dihapus karena sudah memiliki transaksi" },
    ]);
  });

  it("replays at boot when the app starts online with unsent offline work", async () => {
    net.up = false;
    const first = await start();
    await first.categories.createCategory("Cat");

    net.up = true;
    const second = await start();
    expect(second.database.connectionStatus().mode).toBe("online");
    expect(writesTo(remote, /INSERT INTO kategori/)).toHaveLength(1);
    expect(offline).toBeNull();
  });

  it("keeps unsent work across a restart while still offline", async () => {
    net.up = false;
    const first = await start();
    await first.categories.createCategory("Cat");
    const second = await start();
    expect(second.database.connectionStatus()).toMatchObject({ mode: "offline", pending: 1 });
    await second.categories.createCategory("Kayu");
    expect(offline!.outbox).toHaveLength(2);
  });

  it("does not apply an op twice when turso already committed it", async () => {
    net.up = false;
    const { database, categories } = await start();
    await categories.createCategory("Cat");
    const id = offline!.outbox[0].id;
    remote.applied.set(id, "123");

    net.up = true;
    await database.reconnect();
    expect(writesTo(remote, /INSERT INTO kategori/)).toHaveLength(0);
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
    expect(offline!.outbox.map((r) => r.status)).toEqual([1, 0]);

    remote.state.dieOn = null;
    remote.state.down = false;
    net.up = true;
    expect(await database.reconnect()).toBe(true);
    expect(writesTo(remote, /INSERT INTO pelanggan/)).toHaveLength(1);
    expect(writesTo(remote, /INSERT INTO penjualan/)[0].params[4]).toBe(100);
  });

  it("marks a rejected op as failed, keeps going, and fails ops that depend on it", async () => {
    net.up = false;
    const { database, customers, sales, categories } = await start();
    const customerId = await customers.createCustomer({ nama: "Budi", telepon: null, alamat: null });
    await sales.createSale([item(7)], 100000, customerId);
    await categories.createCategory("Cat");

    net.up = true;
    remote.state.reject = /INSERT INTO pelanggan/;
    await database.reconnect();

    expect(offline).toBeNull();
    expect(writesTo(remote, /INSERT INTO kategori/)).toHaveLength(1);
    expect(writesTo(remote, /INSERT INTO penjualan/)).toHaveLength(0);
    expect(database.connectionStatus().failed.map((f) => f.name)).toEqual(["createCustomer", "createSale"]);

    const after = await start();
    expect(after.database.connectionStatus().failed).toHaveLength(2);
    after.database.dismissFailedOps();
    expect(after.database.connectionStatus().failed).toHaveLength(0);
  });

  it("falls back to offline when the connection drops in the middle of a sale", async () => {
    const { database, sales } = await start();
    remote.state.dieOn = /INSERT INTO item_penjualan/;
    const saleId = await sales.createSale([item(7)], 100000);

    expect(saleId).toBeGreaterThanOrEqual(BASE);
    expect(database.connectionStatus().mode).toBe("offline");
    expect(offline!.outbox.map((r) => r.name)).toEqual(["createSale"]);
    expect(writesTo(offline!, /INSERT INTO item_penjualan/)).toHaveLength(1);
  });

  it("skips the replay of a write turso committed just before the connection dropped", async () => {
    const { database, sales } = await start();
    remote.state.dieOn = /^COMMIT$/;
    await sales.createSale([item(7)], 100000);
    expect(database.connectionStatus().mode).toBe("offline");
    expect(remote.applied.size).toBe(1);

    remote.state.dieOn = null;
    net.up = true;
    await database.reconnect();
    expect(writesTo(remote, /INSERT INTO penjualan/)).toHaveLength(1);
    expect(database.connectionStatus().failed).toEqual([]);
  });

  it("serves reads from the offline copy when the connection drops", async () => {
    const { database, categories } = await start();
    net.up = false;
    remote.state.down = true;
    await categories.getCategories();
    expect(database.connectionStatus().mode).toBe("offline");
    expect(writesTo(offline!, /SELECT \* FROM kategori/)).toHaveLength(1);
  });

  it("keeps the original sale time and invoice number when replaying later", async () => {
    net.up = false;
    const { database, sales } = await start();
    await sales.createSale([item(7)], 100000);
    const offlineSale = writesTo(offline!, /INSERT INTO penjualan/)[0];

    vi.setSystemTime(new Date("2026-10-17T15:00:00+07:00"));
    net.up = true;
    await database.reconnect();

    const sale = writesTo(remote, /INSERT INTO penjualan/)[0];
    expect(sale.params[0]).toBe(offlineSale.params[0]);
    expect(sale.params[0]).toMatch(/^INV-20261015-/);
    expect(sale.params[8]).toBe(offlineSale.params[8]);
    expect(sale.params[8]).toBe(Math.floor(new Date("2026-10-15T09:00:00+07:00").getTime() / 1000));
  });

  it("picks a new invoice number when another computer took it meanwhile", async () => {
    net.up = false;
    const { database, sales } = await start();
    await sales.createSale([item(7)], 100000);
    const nomor = writesTo(offline!, /INSERT INTO penjualan/)[0].params[0] as string;
    remote.taken.add(nomor);
    remote.select.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/COUNT\(\*\) as count FROM penjualan/.test(sql)) return [{ count: 4 }];
      if (sql === "SELECT 1") return [{ ok: 1 }];
      if (/SELECT 1 FROM penjualan WHERE nomor_faktur/.test(sql)) return remote.taken.has(params[0] as string) ? [{ 1: 1 }] : [];
      if (/last_insert_rowid/.test(sql)) return [{ id: 100 }];
      return [];
    });

    net.up = true;
    await database.reconnect();
    expect(writesTo(remote, /INSERT INTO penjualan/)[0].params[0]).toBe("INV-20261015-0005");
  });

  it("keeps omitted arguments omitted so defaults still apply on replay", async () => {
    net.up = false;
    const { database, sales } = await start();
    await sales.createSale([item(7)], 100000);

    net.up = true;
    await database.reconnect();
    const sale = writesTo(remote, /INSERT INTO penjualan/)[0];
    expect(sale.params[6]).toBe(0);
    expect(sale.params[4]).toBeNull();
  });

  it("refuses to wipe transactions while offline instead of queueing it", async () => {
    net.up = false;
    const { database } = await start();
    await expect(database.resetTransactionData()).rejects.toThrow(database.ONLINE_ONLY_MESSAGE);
    expect(offline!.outbox).toHaveLength(0);
  });

  it("refuses a drive restore while offline", async () => {
    net.up = false;
    await start();
    const { restoreBackup } = await import("@/db/backup");
    await expect(restoreBackup("file")).rejects.toThrow(/butuh koneksi internet/);
  });

  it("records concurrent offline writes one by one without losing any", async () => {
    net.up = false;
    const { categories } = await start();
    await Promise.all(["A", "B", "C", "D", "E"].map((n) => categories.createCategory(n)));
    expect(offline!.outbox.map((r) => JSON.parse(r.args)[0])).toEqual(["A", "B", "C", "D", "E"]);
    const tx = offline!.calls.map((c) => c.sql).filter((sql) => /^(BEGIN|COMMIT)/.test(sql));
    expect(tx).toEqual(Array.from({ length: 5 }, () => ["BEGIN IMMEDIATE", "COMMIT"]).flat());
  });

  it("keeps a write queued behind a replay instead of mixing it into the replay", async () => {
    net.up = false;
    const { database, categories } = await start();
    await categories.createCategory("Offline");

    net.up = true;
    const sync = database.reconnect();
    const write = categories.createCategory("Baru");
    await Promise.all([sync, write]);

    const names = writesTo(remote, /INSERT INTO kategori/).map((c) => c.params[0]);
    expect(names).toEqual(["Offline", "Baru"]);
    expect(remote.applied.size).toBe(2);
  });

  it("refreshes the local backup copy after online writes", async () => {
    const { categories } = await start();
    vi.mocked(invoke).mockClear();
    await categories.createCategory("Cat");
    vi.advanceTimersByTime(2000);
    expect(vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === "mirror_sync")).toBe(true);
  });

  it("does not touch the local backup copy while offline", async () => {
    net.up = false;
    const { categories } = await start();
    vi.mocked(invoke).mockClear();
    await categories.createCategory("Cat");
    vi.advanceTimersByTime(20000);
    expect(vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === "mirror_sync")).toBe(false);
  });
});
