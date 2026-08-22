import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import capabilities from "../../src-tauri/capabilities/default.json";

const mockExit = vi.fn(async () => {});
vi.mock("@tauri-apps/plugin-process", () => ({
  exit: (...args: unknown[]) => mockExit(...(args as [])),
  relaunch: vi.fn(async () => {}),
}));

import { closeApp } from "@/lib/app";
import Login from "@/pages/Login";

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({ theme: "light", toggle: vi.fn() }),
}));

describe("closing the app", () => {
  beforeEach(() => mockExit.mockClear());

  it("exits with a success code", async () => {
    await closeApp();
    expect(mockExit).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("offers an exit button on the login page", () => {
    const html = renderToStaticMarkup(<Login />);
    expect(html).toContain("Tutup Aplikasi");
  });

  it("declares the exit permission the plugin requires", () => {
    expect(capabilities.permissions).toContain("process:allow-exit");
  });

  it("keeps the restart permission the updater needs", () => {
    expect(capabilities.permissions).toContain("process:allow-restart");
  });
});

describe("database location", () => {
  it("resolves an absolute path under the app data directory", async () => {
    const { databasePath } = await import("@/database");
    const path = await databasePath();
    expect(path.startsWith("sqlite:")).toBe(true);
    expect(path).toContain("AppData");
    expect(path.endsWith("polaris.db")).toBe(true);
  });

  it("does not depend on the working directory", async () => {
    const { databasePath } = await import("@/database");
    expect(await databasePath()).toBe(await databasePath());
    expect(await databasePath()).not.toBe("sqlite:polaris.db");
  });

  it("opens one handle no matter how many callers ask", async () => {
    const { getDb } = await import("@/database");
    const [a, b, c] = await Promise.all([getDb(), getDb(), getDb()]);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});
