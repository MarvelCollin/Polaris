import { describe, it, expect, vi } from "vitest";
import type { Update } from "@tauri-apps/plugin-updater";
import { findUpdate, reloadOrUpdate, type RecoveryDeps } from "@/lib/recovery";

const update = { version: "2.13.0" } as Update;

function deps(overrides: Partial<RecoveryDeps> = {}): RecoveryDeps {
  return {
    check: vi.fn(async () => null),
    install: vi.fn(async () => {}),
    reload: vi.fn(),
    ...overrides,
  };
}

describe("recovering from a broken screen", () => {
  it("installs a newer version instead of reloading into the same error", async () => {
    const d = deps({ check: vi.fn(async () => update) });
    const notes: string[] = [];
    expect(await reloadOrUpdate((t) => notes.push(t), d)).toBe("updating");
    expect(d.install).toHaveBeenCalledWith(update, expect.any(Function));
    expect(d.reload).not.toHaveBeenCalled();
    expect(notes).toContain("Memasang versi 2.13.0...");
  });

  it("reloads when there is no newer version", async () => {
    const d = deps();
    expect(await reloadOrUpdate(() => {}, d)).toBe("reloaded");
    expect(d.reload).toHaveBeenCalledTimes(1);
  });

  it("still reloads when the update check itself fails, for example offline", async () => {
    const d = deps({ check: vi.fn(async () => { throw new Error("offline"); }) });
    expect(await reloadOrUpdate(() => {}, d)).toBe("reloaded");
    expect(d.reload).toHaveBeenCalledTimes(1);
  });

  it("keeps the screen and explains when installing the update fails", async () => {
    const d = deps({ check: vi.fn(async () => update), install: vi.fn(async () => { throw new Error("download putus"); }) });
    const notes: string[] = [];
    expect(await reloadOrUpdate((t) => notes.push(t), d)).toBe("failed");
    expect(d.reload).not.toHaveBeenCalled();
    expect(notes[notes.length - 1]).toMatch(/Gagal memasang update: download putus/);
  });

  it("treats a failed check as no update so the screen never gets stuck checking", async () => {
    expect(await findUpdate({ check: async () => { throw new Error("x"); } })).toBeNull();
  });
});
