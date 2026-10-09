import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Database } from "tauri-plugin-libsql-api";
import { invoke } from "@tauri-apps/api/core";
import { mockDb, resetMock } from "./setup";

const CONFIG = { url: "libsql://polaris-test", token: "test-token" };
const FOLDER = "C:/Users/test/AppData/Roaming/com.marvelcollin.polaris/diverged/20261009-100000";

let store: Map<string, string>;
let reachable: boolean;
let commands: string[];

function memoryStorage() {
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

async function fresh() {
  vi.resetModules();
  return import("@/database");
}

function isReplica(options: unknown) {
  return typeof options === "object" && options !== null && "syncUrl" in options;
}

describe("replica heal", () => {
  beforeEach(() => {
    resetMock();
    store = new Map();
    reachable = true;
    commands = [];
    vi.stubGlobal("localStorage", memoryStorage());
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      commands.push(cmd);
      if (cmd === "get_turso_config") return CONFIG;
      if (cmd === "turso_reachable") return reachable;
      if (cmd === "quarantine_replica") return FOLDER;
      return null;
    });
    vi.mocked(Database.load).mockReset();
    vi.mocked(Database.load).mockImplementation(async () => mockDb as unknown as Database);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation(async () => null);
    vi.mocked(Database.load).mockReset();
    vi.mocked(Database.load).mockImplementation(async () => mockDb as unknown as Database);
  });

  it("rebuilds the replica from turso once on the first launch of this version", async () => {
    const { getDb } = await fresh();
    await getDb();
    const quarantined = commands.indexOf("quarantine_replica");
    expect(quarantined).toBeGreaterThan(-1);
    expect(vi.mocked(invoke).mock.invocationCallOrder[quarantined]).toBeLessThan(
      vi.mocked(Database.load).mock.invocationCallOrder[0]
    );
    expect(isReplica(vi.mocked(Database.load).mock.calls[0][0])).toBe(true);
    expect(store.get("polaris:replica-reset")).toBe("1");
  });

  it("leaves a healthy replica alone after the reset has run", async () => {
    store.set("polaris:replica-reset", "1");
    const { getDb } = await fresh();
    await getDb();
    expect(commands).not.toContain("quarantine_replica");
    expect(commands).not.toContain("turso_reachable");
  });

  it("does not touch local files while turso is unreachable", async () => {
    reachable = false;
    const { getDb } = await fresh();
    await getDb();
    expect(commands).not.toContain("quarantine_replica");
    expect(store.get("polaris:replica-reset")).toBeUndefined();
  });

  it.each([
    "sync error: WAL frame insert conflict",
    "sync error: invalid local state: db file exists but metadata file does not",
  ])("heals a replica that fails to open with %s", async (message) => {
    store.set("polaris:replica-reset", "1");
    vi.mocked(Database.load).mockRejectedValueOnce(new Error(message));
    const { getDb } = await fresh();
    const db = await getDb();
    expect(commands).toContain("quarantine_replica");
    expect(vi.mocked(Database.load)).toHaveBeenCalledTimes(2);
    expect(isReplica(vi.mocked(Database.load).mock.calls[1][0])).toBe(true);
    await db.execute("SELECT 1");
    expect(mockDb.execute).toHaveBeenCalled();
  });

  it("puts the old files back when the fresh download fails", async () => {
    vi.mocked(Database.load).mockImplementation(async (options) => {
      if (isReplica(options)) throw new Error("http dispatch error: connection reset");
      return mockDb as unknown as Database;
    });
    const { getDb } = await fresh();
    await getDb();
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("restore_replica", { folder: FOLDER });
    expect(store.get("polaris:replica-dirty")).toBe("1");
  });

  it("flags the replica for a rebuild after an offline session", async () => {
    store.set("polaris:replica-reset", "1");
    vi.mocked(Database.load).mockImplementation(async (options) => {
      if (isReplica(options)) throw new Error("http dispatch error: dns error");
      return mockDb as unknown as Database;
    });
    const { getDb } = await fresh();
    await getDb();
    expect(commands).not.toContain("quarantine_replica");
    expect(store.get("polaris:replica-dirty")).toBe("1");
  });

  it("rebuilds on the next online launch after an offline session", async () => {
    store.set("polaris:replica-reset", "1");
    store.set("polaris:replica-dirty", "1");
    const { getDb } = await fresh();
    await getDb();
    expect(commands).toContain("quarantine_replica");
    expect(store.get("polaris:replica-dirty")).toBeUndefined();
  });

  it("turns a conflict during a write into a restart message and flags a rebuild", async () => {
    store.set("polaris:replica-reset", "1");
    const { getDb, DIVERGED_MESSAGE } = await fresh();
    const db = await getDb();
    mockDb.execute.mockRejectedValueOnce(new Error("WAL frame insert conflict"));
    await expect(db.execute("INSERT INTO kategori (nama) VALUES ($1)", ["X"])).rejects.toThrow(DIVERGED_MESSAGE);
    expect(store.get("polaris:replica-dirty")).toBe("1");
  });

  it("passes ordinary errors through untouched", async () => {
    store.set("polaris:replica-reset", "1");
    const { getDb } = await fresh();
    const db = await getDb();
    mockDb.execute.mockRejectedValueOnce(new Error("UNIQUE constraint failed: kategori.nama"));
    await expect(db.execute("INSERT INTO kategori (nama) VALUES ($1)", ["X"])).rejects.toThrow("UNIQUE constraint failed");
    expect(store.get("polaris:replica-dirty")).toBeUndefined();
  });
});
