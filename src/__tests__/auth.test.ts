import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMock, mockDb } from "./setup";
import { initPassword, verifyPassword, changePassword } from "@/db/auth";

const DEFAULT_HASH = "154c660289df60fce46c8f980429514ea0118ea854a5bc8ae974c2040e9e2959";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "get_default_hash") return DEFAULT_HASH;
    throw new Error(`Unknown command: ${cmd}`);
  }),
}));

const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;

function captureExecuteCalls() {
  return mockDb.execute.mock.calls.map((c: unknown[]) => ({
    sql: c[0] as string,
    params: c[1] as unknown[] | undefined,
  }));
}

describe("auth", () => {
  beforeEach(() => {
    resetMock();
  });

  describe("initPassword", () => {
    it("should set default password when no version exists", async () => {
      mockDb.select.mockResolvedValueOnce([]);

      await initPassword();

      const calls = captureExecuteCalls();
      const pwInsert = calls.find((c) => c.sql.includes("app_password") && !c.sql.includes("version"));
      expect(pwInsert).toBeDefined();
      expect(pwInsert!.params![0]).toMatch(SHA256_HEX_REGEX);
    });

    it("should store password as hash not plaintext", async () => {
      mockDb.select.mockResolvedValueOnce([]);

      await initPassword();

      const calls = captureExecuteCalls();
      const pwInsert = calls.find((c) => c.sql.includes("app_password") && !c.sql.includes("version"));
      const storedValue = pwInsert!.params![0] as string;
      expect(storedValue).not.toBe("pengenbantingjeni");
      expect(storedValue).not.toContain("pengenbantingjeni");
      expect(storedValue).toMatch(SHA256_HEX_REGEX);
    });

    it("should use hash from Rust backend", async () => {
      mockDb.select.mockResolvedValueOnce([]);

      await initPassword();

      const calls = captureExecuteCalls();
      const pwInsert = calls.find((c) => c.sql.includes("app_password") && !c.sql.includes("version"));
      expect(pwInsert!.params![0]).toBe(DEFAULT_HASH);
    });

    it("should set version key after initializing", async () => {
      mockDb.select.mockResolvedValueOnce([]);

      await initPassword();

      const calls = captureExecuteCalls();
      const versionInsert = calls.find((c) => c.sql.includes("app_password_version"));
      expect(versionInsert).toBeDefined();
    });

    it("should skip init when version is current", async () => {
      mockDb.select.mockResolvedValueOnce([{ value: "2" }]);

      await initPassword();

      expect(mockDb.execute).not.toHaveBeenCalled();
    });

    it("should re-init when version is outdated", async () => {
      mockDb.select.mockResolvedValueOnce([{ value: "1" }]);

      await initPassword();

      const calls = captureExecuteCalls();
      expect(calls.some((c) => c.sql.includes("app_password"))).toBe(true);
    });
  });

  describe("verifyPassword", () => {
    it("should accept correct normal password", async () => {
      const hash = await sha256("pengenbantingjeni");
      mockDb.select.mockResolvedValueOnce([{ value: hash }]);

      const result = await verifyPassword("pengenbantingjeni");
      expect(result).toBe(true);
    });

    it("should reject wrong password", async () => {
      const hash = await sha256("pengenbantingjeni");
      mockDb.select.mockResolvedValueOnce([{ value: hash }]);

      const result = await verifyPassword("wrongpassword");
      expect(result).toBe(false);
    });

    it("should reject the removed bypass password", async () => {
      mockDb.select.mockResolvedValueOnce([{ value: await sha256("pengenbantingjeni") }]);

      const result = await verifyPassword("wallahi123");
      expect(result).toBe(false);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("should reject empty password", async () => {
      mockDb.select.mockResolvedValueOnce([{ value: await sha256("pengenbantingjeni") }]);

      const result = await verifyPassword("");
      expect(result).toBe(false);
    });

    it("should reject when no password is stored", async () => {
      mockDb.select.mockResolvedValueOnce([]);

      const result = await verifyPassword("pengenbantingjeni");
      expect(result).toBe(false);
    });

    it("should compare hashes not plaintext", async () => {
      const hash = await sha256("mypassword");
      mockDb.select.mockResolvedValueOnce([{ value: hash }]);

      await verifyPassword("mypassword");

      const selectCall = mockDb.select.mock.calls[0];
      expect((selectCall[0] as string)).not.toContain("mypassword");
    });

    it("should not store or send plaintext password in queries", async () => {
      const hash = await sha256("secretpass");
      mockDb.select.mockResolvedValueOnce([{ value: hash }]);

      await verifyPassword("secretpass");

      const allCalls = [
        ...mockDb.select.mock.calls.map((c: unknown[]) => JSON.stringify(c)),
        ...mockDb.execute.mock.calls.map((c: unknown[]) => JSON.stringify(c)),
      ];
      for (const call of allCalls) {
        expect(call).not.toContain("secretpass");
      }
    });
  });

  describe("changePassword", () => {
    it("should change password when current password is correct", async () => {
      const currentHash = await sha256("oldpass");
      mockDb.select.mockResolvedValueOnce([{ value: currentHash }]);

      const result = await changePassword("oldpass", "newpass");
      expect(result).toBe(true);

      const calls = captureExecuteCalls();
      const updateCall = calls.find((c) => c.sql.includes("app_password"));
      expect(updateCall).toBeDefined();
      const newHash = updateCall!.params![0] as string;
      expect(newHash).toMatch(SHA256_HEX_REGEX);
      expect(newHash).not.toBe(currentHash);
    });

    it("should reject change when current password is wrong", async () => {
      const currentHash = await sha256("oldpass");
      mockDb.select.mockResolvedValueOnce([{ value: currentHash }]);

      const result = await changePassword("wrongpass", "newpass");
      expect(result).toBe(false);

      const calls = captureExecuteCalls();
      const updateCall = calls.find((c) => c.sql.includes("INSERT OR REPLACE") && c.sql.includes("app_password"));
      expect(updateCall).toBeUndefined();
    });

    it("should store new password as hash not plaintext", async () => {
      const currentHash = await sha256("oldpass");
      mockDb.select.mockResolvedValueOnce([{ value: currentHash }]);

      await changePassword("oldpass", "mynewpassword");

      const calls = captureExecuteCalls();
      const updateCall = calls.find((c) => c.sql.includes("app_password"));
      expect(updateCall!.params![0]).not.toBe("mynewpassword");
      expect(updateCall!.params![0]).toMatch(SHA256_HEX_REGEX);
    });

    it("should not leak old or new password in SQL", async () => {
      const currentHash = await sha256("oldsecret");
      mockDb.select.mockResolvedValueOnce([{ value: currentHash }]);

      await changePassword("oldsecret", "newsecret");

      const allCalls = [
        ...mockDb.select.mock.calls.map((c: unknown[]) => JSON.stringify(c)),
        ...mockDb.execute.mock.calls.map((c: unknown[]) => JSON.stringify(c)),
      ];
      for (const call of allCalls) {
        expect(call).not.toContain("oldsecret");
        expect(call).not.toContain("newsecret");
      }
    });
  });

  describe("password hashing security", () => {
    it("should produce different hashes for different passwords", async () => {
      const hash1 = await sha256("password1");
      const hash2 = await sha256("password2");
      expect(hash1).not.toBe(hash2);
    });

    it("should produce consistent hash for same password", async () => {
      const hash1 = await sha256("samepassword");
      const hash2 = await sha256("samepassword");
      expect(hash1).toBe(hash2);
    });

    it("should produce 64 char hex string (SHA-256)", async () => {
      const hash = await sha256("test");
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(SHA256_HEX_REGEX);
    });

    it("should not accept bypass password hash as normal password", async () => {
      const bypassHash = await sha256("wallahi123");
      mockDb.select.mockResolvedValueOnce([{ value: bypassHash }]);

      const result = await verifyPassword(bypassHash);
      expect(result).toBe(false);
    });

    it("should handle unicode passwords", async () => {
      const hash = await sha256("密码测试");
      mockDb.select.mockResolvedValueOnce([{ value: hash }]);

      const result = await verifyPassword("密码测试");
      expect(result).toBe(true);
    });

    it("should treat password as case-sensitive", async () => {
      const hash = await sha256("Password");
      mockDb.select.mockResolvedValueOnce([{ value: hash }]);

      const result = await verifyPassword("password");
      expect(result).toBe(false);
    });
  });
});

async function sha256(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
