import { describe, it, expect } from "vitest";
import { buildReceipt, receiptLines, twoCol, wrap, money, formatQty } from "@/lib/escpos";
import { DEFAULT_PRINTER_SETTINGS } from "@/db/settings";
import { SaleItem } from "@/types";

const settings = { ...DEFAULT_PRINTER_SETTINGS, name: "TD630S", enabled: true };

function item(nama: string, jumlah: number, harga: number): SaleItem {
  return { id: 1, penjualan_id: 1, produk_id: 1, nama_produk: nama, jumlah, harga_satuan: harga, subtotal: jumlah * harga };
}

const base = {
  nomor: "INV-20260819-0001",
  tanggal: new Date(2026, 7, 19, 9, 5),
  items: [item("Indomie Goreng", 3, 3500)],
  subtotal: 10500,
  diskon: 0,
  total: 10500,
  dibayar: 20000,
  kembalian: 9500,
};

describe("receipt layout", () => {
  it("pads two columns to exact paper width", () => {
    const line = twoCol("TOTAL", "10.500", 40);
    expect(line).toHaveLength(40);
    expect(line.startsWith("TOTAL")).toBe(true);
    expect(line.endsWith("10.500")).toBe(true);
  });

  it("keeps every line within the paper width", () => {
    const lines = receiptLines({ ...base, items: [item("Kopi Kapal Api Special Mix Sachet Renceng", 2, 12500)] }, settings);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(settings.width);
  });

  it("wraps long product names instead of truncating", () => {
    const lines = wrap("Kopi Kapal Api Special Mix Sachet Renceng", 20);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe("Kopi Kapal Api Special Mix Sachet Renceng");
  });

  it("formats rupiah with indonesian separators", () => {
    expect(money(1500000)).toBe("1.500.000");
    expect(money(10500.4)).toBe("10.500");
  });

  it("trims trailing zeros on fractional quantities", () => {
    expect(formatQty(3)).toBe("3");
    expect(formatQty(1.5)).toBe("1.5");
  });

  it("prints kembalian for cash and sisa utang for credit", () => {
    const cash = receiptLines(base, settings).join("\n");
    expect(cash).toContain("Kembali");
    expect(cash).not.toContain("Sisa Utang");

    const credit = receiptLines({ ...base, dibayar: 5000, kembalian: 0, utang: 5500 }, settings).join("\n");
    expect(credit).toContain("Sisa Utang");
    expect(credit).not.toContain("Kembali");
  });

  it("shows the discount row only when a discount applies", () => {
    expect(receiptLines(base, settings).join("\n")).not.toContain("Diskon");
    expect(receiptLines({ ...base, diskon: 500 }, settings).join("\n")).toContain("Diskon");
  });
});

describe("escpos bytes", () => {
  it("starts with the initialise command", () => {
    const bytes = buildReceipt(base, settings);
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x1b, 0x40]);
  });

  it("appends the cut command only when enabled", () => {
    const withCut = buildReceipt(base, { ...settings, cut: true });
    expect(Array.from(withCut.slice(-4))).toEqual([0x1d, 0x56, 0x42, 0x00]);

    const noCut = buildReceipt(base, { ...settings, cut: false });
    expect(noCut[noCut.length - 1]).toBe(0x0a);
  });

  it("emits the drawer kick only when enabled", () => {
    const kick = [0x1b, 0x70, 0x00, 0x19, 0xfa];
    const withDrawer = Array.from(buildReceipt(base, { ...settings, drawer: true }));
    expect(withDrawer.slice(5, 10)).toEqual(kick);
    expect(Array.from(buildReceipt(base, { ...settings, drawer: false })).slice(5, 10)).not.toEqual(kick);
  });

  it("replaces characters the printer cannot render", () => {
    const bytes = buildReceipt({ ...base, items: [item("Teh Botol ® 350ml", 1, 5000)] }, settings);
    for (const byte of bytes) expect(byte).toBeLessThan(0x100);
    expect(bytes).toContain(0x3f);
  });
});
