import { describe, it, expect } from "vitest";
import { formatRupiah, formatTanggal } from "@/types/index";

describe("formatRupiah", () => {
  it("should format zero", () => {
    const result = formatRupiah(0);
    expect(result).toContain("0");
    expect(result).toContain("Rp");
  });

  it("should format thousands with separator", () => {
    const result = formatRupiah(58000);
    expect(result).toContain("58");
  });

  it("should format millions", () => {
    const result = formatRupiah(5200000);
    expect(result).toContain("5.200.000") ;
  });

  it("should not include decimal digits", () => {
    const result = formatRupiah(1000);
    expect(result).not.toContain(",00");
  });
});

describe("formatTanggal", () => {
  it("should format a unix timestamp to Indonesian date", () => {
    const timestamp = 1722729600;
    const result = formatTanggal(timestamp);
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it("should include time component", () => {
    const timestamp = 1722729600;
    const result = formatTanggal(timestamp);
    expect(result).toMatch(/\d{2}\.\d{2}$/);
  });
});
