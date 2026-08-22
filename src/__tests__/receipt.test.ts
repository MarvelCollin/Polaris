import { describe, it, expect } from "vitest";
import { buildReceipt, buildRuler, receiptLines, twoCol, wrap, money, formatQty, pitchBytes, previewBytes, sampleReceipt } from "@/lib/escpos";
import { interpret, columnsFor, condensedCpi, Device } from "@/lib/escInterpreter";
import { DEFAULT_PRINTER_SETTINGS, deviceFor, maxColumns, PrinterSettings } from "@/db/settings";
import { SaleItem } from "@/types";

const dot: PrinterSettings = { ...DEFAULT_PRINTER_SETTINGS, name: "TD630S", enabled: true };
const roll: PrinterSettings = {
  ...DEFAULT_PRINTER_SETTINGS,
  name: "Thermal",
  enabled: true,
  dialect: "escpos",
  paper: 76,
  printable: 64,
  width: 40,
  cut: true,
};

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

function render(bytes: Uint8Array, device: Device): string[] {
  const layout = interpret(bytes, device);
  const out: string[] = [];
  for (const page of layout.pages) {
    for (const line of page.lines) {
      let text = "";
      for (const run of line.runs) {
        const col = Math.round(run.xMm / run.charMm);
        text = text.padEnd(col, " ") + run.text;
      }
      out.push(text.trimEnd());
    }
  }
  return out;
}

describe("receipt layout", () => {
  it("pads two columns to exact paper width", () => {
    const line = twoCol("TOTAL", "10.500", 40);
    expect(line).toHaveLength(40);
    expect(line.startsWith("TOTAL")).toBe(true);
    expect(line.endsWith("10.500")).toBe(true);
  });

  it("keeps every line within the paper width", () => {
    const lines = receiptLines({ ...base, items: [item("Kopi Kapal Api Special Mix Sachet Renceng", 2, 12500)] }, dot);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(dot.width);
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
    const cash = receiptLines(base, dot).join("\n");
    expect(cash).toContain("Kembali");
    expect(cash).not.toContain("Sisa Utang");

    const credit = receiptLines({ ...base, dibayar: 5000, kembalian: 0, utang: 5500 }, dot).join("\n");
    expect(credit).toContain("Sisa Utang");
    expect(credit).not.toContain("Kembali");
  });

  it("shows the discount row only when a discount applies", () => {
    expect(receiptLines(base, dot).join("\n")).not.toContain("Diskon");
    expect(receiptLines({ ...base, diskon: 500 }, dot).join("\n")).toContain("Diskon");
  });

  it("folds unprintable characters before measuring the line width", () => {
    const lines = receiptLines({ ...base, items: [item("Teh Botol ® 350ml", 1, 5000)] }, dot);
    expect(lines.some((line) => line.includes("Teh Botol ? 350ml"))).toBe(true);
  });
});

describe("character pitch", () => {
  it("maps every offered pitch to a distinct command", () => {
    expect(pitchBytes(10)).toEqual([0x12, 0x1b, 0x50]);
    expect(pitchBytes(12)).toEqual([0x12, 0x1b, 0x4d]);
    expect(pitchBytes(15)).toEqual([0x12, 0x1b, 0x67]);
    expect(pitchBytes(17.14)).toEqual([0x1b, 0x50, 0x0f]);
    expect(pitchBytes(20)).toEqual([0x1b, 0x4d, 0x0f]);
  });

  it("reproduces the column counts printed on the diagnostic sheet", () => {
    expect(columnsFor(203.2, 10)).toBe(80);
    expect(columnsFor(203.2, 12)).toBe(96);
    expect(columnsFor(203.2, 15)).toBe(120);
    expect(columnsFor(203.2, condensedCpi(10))).toBe(137);
    expect(columnsFor(203.2, condensedCpi(12))).toBe(160);
  });

  it("selects the pitch explicitly instead of inheriting the printer panel", () => {
    const bytes = Array.from(buildReceipt(base, { ...dot, cpi: 17.14 }));
    expect(bytes.slice(0, 5)).toEqual([0x1b, 0x40, 0x1b, 0x50, 0x0f]);
  });

  it("gives the diagnostic sheet the same preamble as a receipt", () => {
    const receipt = Array.from(buildReceipt(base, dot)).slice(0, 11);
    const ruler = Array.from(buildRuler(dot)).slice(0, 11);
    expect(ruler).toEqual(receipt);
  });
});

describe("dot matrix bytes", () => {
  it("never sends the escpos master select that this printer prints as text", () => {
    const bytes = Array.from(buildReceipt(base, dot));
    expect(bytes.join(",")).not.toContain("27,33");
  });

  it("never sends a justification command the printer ignores", () => {
    const bytes = Array.from(buildReceipt(base, dot));
    expect(bytes.join(",")).not.toContain("27,97");
  });

  it("ends the page with a form feed and never a cut", () => {
    const bytes = Array.from(buildReceipt(base, dot));
    expect(bytes[bytes.length - 1]).toBe(0x0c);
    expect(bytes.join(",")).not.toContain("29,86,66");
  });

  it("feeds the requested lines past the form feed", () => {
    const bytes = Array.from(buildReceipt(base, { ...dot, tearFeed: 6 }));
    expect(bytes.slice(-7)).toEqual([0x0c, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a]);
  });

  it("emits the drawer kick only when enabled", () => {
    const kick = "27,112,0,25,250";
    expect(Array.from(buildReceipt(base, { ...dot, drawer: true })).join(",")).toContain(kick);
    expect(Array.from(buildReceipt(base, { ...dot, drawer: false })).join(",")).not.toContain(kick);
  });
});

describe("roll paper bytes", () => {
  it("appends the cut command only when enabled", () => {
    expect(Array.from(buildReceipt(base, { ...roll, cut: true })).slice(-4)).toEqual([0x1d, 0x56, 0x42, 0x00]);
    const noCut = buildReceipt(base, { ...roll, cut: false });
    expect(noCut[noCut.length - 1]).toBe(0x0a);
  });

  it("keeps the escpos double size title", () => {
    expect(Array.from(buildReceipt(base, roll)).join(",")).toContain("27,33,48");
  });
});

describe("byte stream interpreter", () => {
  it("renders exactly the text the builder wrote", () => {
    const lines = render(buildReceipt(base, dot), deviceFor(dot));
    expect(lines).toContain("INV-20260819-0001");
    expect(lines.some((line) => line.trim() === "POLARIS")).toBe(true);
    expect(lines.some((line) => line.trim() === "Terima kasih")).toBe(true);
  });

  it("centres the dot matrix title in software so preview and print agree", () => {
    const lines = render(buildReceipt(base, dot), deviceFor(dot));
    const title = lines.find((line) => line.includes("POLARIS")) ?? "";
    const indent = title.length - title.trimStart().length;
    expect(indent).toBe(Math.floor((dot.width - "POLARIS".length) / 2));
  });

  it("wraps at the printable width instead of hiding the overflow", () => {
    const narrow = { ...dot, width: 120, cpi: 10 };
    const layout = interpret(buildReceipt(base, narrow), deviceFor(narrow));
    expect(layout.wrapped).toBe(true);
    expect(layout.widestMm).toBeLessThanOrEqual(narrow.printable + 0.01);
  });

  it("does not wrap once the pitch matches the column count", () => {
    const wide = { ...dot, width: 120, cpi: 15 };
    const layout = interpret(buildReceipt(base, wide), deviceFor(wide));
    expect(layout.wrapped).toBe(false);
  });

  it("advances the paper to the page boundary on a form feed", () => {
    const layout = interpret(buildReceipt(base, dot), deviceFor(dot));
    expect(layout.stopMm).toBeCloseTo(279.4, 1);
  });

  it("counts the tear off feed beyond the page boundary", () => {
    const fed = { ...dot, tearFeed: 6 };
    const layout = interpret(buildReceipt(base, fed), deviceFor(fed));
    expect(layout.stopMm).toBeCloseTo(279.4 + 6 * (25.4 / 6), 1);
  });

  it("reproduces the stray character a printer emits when it ignores master select", () => {
    const device = { ...deviceFor(roll), master: false, justify: false, escposSize: false };
    const lines = render(buildReceipt(base, roll), device);
    expect(lines.some((line) => line.startsWith("0POLARIS"))).toBe(true);
  });

  it("keeps the title clean on a printer that honours master select", () => {
    const lines = render(buildReceipt(base, roll), deviceFor(roll));
    expect(lines.some((line) => line.includes("0POLARIS"))).toBe(false);
  });

  it("previews the same document that a test print produces", () => {
    expect(Array.from(previewBytes(dot, base.tanggal))).toEqual(
      Array.from(buildReceipt(sampleReceipt(base.tanggal), dot))
    );
  });
});

describe("fixed page height", () => {
  const padded = { ...dot, pageLines: 40 };

  function lineCount(bytes: Uint8Array): number {
    return Array.from(bytes).filter((b) => b === 0x0a).length;
  }

  it("pads short receipts so the page always holds the same number of lines", () => {
    const short = buildReceipt(base, padded);
    const long = buildReceipt({ ...base, items: Array.from({ length: 6 }, () => base.items[0]) }, padded);
    expect(lineCount(short)).toBe(padded.pageLines - 1);
    expect(lineCount(long)).toBe(padded.pageLines - 1);
  });

  it("never truncates a receipt taller than the page", () => {
    const huge = buildReceipt({ ...base, items: Array.from({ length: 40 }, () => base.items[0]) }, padded);
    expect(lineCount(huge)).toBeGreaterThan(padded.pageLines);
  });

  it("keeps the form feed as the very last byte so auto tear off can fire", () => {
    const bytes = buildReceipt(base, { ...dot, pageLines: 0 });
    expect(bytes[bytes.length - 1]).toBe(0x0c);
  });
});

describe("column budget", () => {
  it("offers only the columns the carriage can reach", () => {
    expect(maxColumns({ ...dot, cpi: 10 })).toBe(80);
    expect(maxColumns({ ...dot, cpi: 15 })).toBe(120);
  });

  it("halves the budget when double width is on", () => {
    expect(maxColumns({ ...dot, cpi: 10, scale: 2 })).toBe(40);
  });
});
