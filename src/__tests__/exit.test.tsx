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
