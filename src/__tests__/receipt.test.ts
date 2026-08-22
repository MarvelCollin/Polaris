import { describe, it, expect } from "vitest";
import { buildReceipt, buildRuler, receiptLines, twoCol, wrap, money, formatQty, pitchBytes, previewBytes, sampleReceipt, terbilang, WIDE_MIN } from "@/lib/escpos";
import { interpret, columnsFor, condensedCpi, Device } from "@/lib/escInterpreter";
import { DEFAULT_PRINTER_SETTINGS, deviceFor, maxColumns, upgradePrinterSettings, PRINTER_PROFILE_VERSION, PrinterSettings } from "@/db/settings";
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
        const col = Math.round((run.xMm - layout.originMm) / run.charMm);
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

  it("sweeps every offered pitch on the diagnostic sheet", () => {
    const ruler = Array.from(buildRuler(dot)).join(",");
    for (const cpi of [10, 12, 15, 17.14, 20]) {
      expect(ruler, String(cpi)).toContain(pitchBytes(cpi).join(","));
    }
  });

  it("leaves the diagnostic sheet on the configured pitch", () => {
    const bytes = Array.from(buildRuler({ ...dot, cpi: 15 }));
    const last = bytes.lastIndexOf(0x67);
    const other = Math.max(bytes.lastIndexOf(0x0f), bytes.lastIndexOf(0x4d));
    expect(last).toBeGreaterThan(other);
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

  it("never sends an escpos drawer kick to a printer with no drawer", () => {
    expect(Array.from(buildReceipt(base, dot)).join(",")).not.toContain("27,112");
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
    expect(lines.some((line) => line.includes("INV-20260819-0001"))).toBe(true);
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

describe("forced profile upgrade", () => {
  it("moves an old roll config onto the full width continuous form profile", () => {
    const legacy = {
      enabled: true,
      name: "Matrix Dot",
      dialect: "escpos" as const,
      paper: 76,
      width: 40,
      cut: true,
      header: "TOKO SENTARUM",
      footer: "Terima kasih",
    };
    const next = upgradePrinterSettings(legacy);
    expect(next.dialect).toBe("escp");
    expect(next.paper).toBe(241);
    expect(next.printable).toBe(203.2);
    expect(next.cpi).toBe(17.14);
    expect(next.width).toBe(136);
    expect(next.cut).toBe(false);
    expect(next.version).toBe(PRINTER_PROFILE_VERSION);
  });

  it("moves a version two install off the pitch the printer ignores", () => {
    const v2 = {
      version: 2,
      name: "Matrix Dot",
      enabled: true,
      header: "SAHABAT SENTARUM",
      dialect: "escp" as const,
      paper: 241,
      printable: 203.2,
      cpi: 10,
      width: 80,
    };
    const next = upgradePrinterSettings(v2);
    expect(next.version).toBe(PRINTER_PROFILE_VERSION);
    expect(next.cpi).toBe(17.14);
    expect(next.width).toBe(136);
    expect(next.name).toBe("Matrix Dot");
    expect(next.header).toBe("SAHABAT SENTARUM");
  });

  it("keeps the widest column count inside the carriage", () => {
    const next = upgradePrinterSettings({ version: 2 });
    expect(next.width).toBeLessThanOrEqual(maxColumns(next));
    expect(maxColumns(next)).toBe(137);
  });
  it("keeps the shop identity and printer choice while upgrading", () => {
    const next = upgradePrinterSettings({ name: "Matrix Dot", enabled: true, header: "TOKO SENTARUM", footer: "Sampai jumpa" });
    expect(next.name).toBe("Matrix Dot");
    expect(next.enabled).toBe(true);
    expect(next.header).toBe("TOKO SENTARUM");
    expect(next.footer).toBe("Sampai jumpa");
  });

  it("leaves a config alone once it is already on the current profile", () => {
    const tuned = { ...DEFAULT_PRINTER_SETTINGS, cpi: 15, width: 120, tearFeed: 4 };
    const next = upgradePrinterSettings(tuned);
    expect(next.cpi).toBe(15);
    expect(next.width).toBe(120);
    expect(next.tearFeed).toBe(4);
  });

  it("fills the printable area at the recommended profile", () => {
    const layout = interpret(previewBytes(DEFAULT_PRINTER_SETTINGS, base.tanggal), deviceFor(DEFAULT_PRINTER_SETTINGS));
    expect(layout.widestMm).toBeGreaterThan(198);
    expect(layout.widestMm).toBeLessThanOrEqual(203.2);
    expect(layout.wrapped).toBe(false);
    expect(layout.lineCount).toBeGreaterThan(20);
  });
});

describe("formal invoice layout", () => {
  const shop = { ...dot, header: "SAHABAT SENTARUM", address: "Jl. Lintas Selatan No. 12", phone: "0812 3456 7890" };

  it("spells the total in indonesian", () => {
    expect(terbilang(400000)).toBe("empat ratus ribu rupiah");
    expect(terbilang(415000)).toBe("empat ratus lima belas ribu rupiah");
    expect(terbilang(1500000)).toBe("satu juta lima ratus ribu rupiah");
    expect(terbilang(1100)).toBe("seribu seratus rupiah");
    expect(terbilang(0)).toBe("nol rupiah");
  });

  it("prints an item table with a header row", () => {
    const lines = receiptLines(sampleReceipt(base.tanggal), shop);
    const head = lines.find((l) => l.includes("Nama Barang"));
    expect(head).toBeDefined();
    expect(head).toContain("Qty");
    expect(head).toContain("Harga");
    expect(head).toContain("Jumlah");
  });

  it("numbers every item and keeps the money columns flush right", () => {
    const lines = receiptLines(sampleReceipt(base.tanggal), shop);
    const rows = lines.filter((l) => /^\|\s+\d+ \| /.test(l));
    expect(rows).toHaveLength(3);
    for (const line of rows) expect(line).toHaveLength(shop.width);
    expect(rows[0].endsWith("204.000 |")).toBe(true);
  });

  it("draws a ruled cell border on every table line", () => {
    const lines = receiptLines(sampleReceipt(base.tanggal), shop);
    const table = lines.filter((l) => l.startsWith("|") || l.startsWith("+"));
    expect(table.length).toBeGreaterThan(6);
    for (const line of table) {
      expect(line).toHaveLength(shop.width);
      expect(line.endsWith("|") || line.endsWith("+")).toBe(true);
    }
  });

  it("keeps the column separators lined up between rules and rows", () => {
    const lines = receiptLines(sampleReceipt(base.tanggal), shop);
    const head = lines.find((l) => l.startsWith("+-")) ?? "";
    const body = lines.find((l) => /^\|\s+1 \| /.test(l)) ?? "";
    const bars = [...body].map((c, i) => (c === "|" ? i : -1)).filter((i) => i >= 0);
    expect(bars.length).toBe(6);
    for (const i of bars) expect(head[i]).toBe("+");
  });

  it("wraps a long product name inside the name cell", () => {
    const long = { ...sampleReceipt(base.tanggal) };
    long.items = [item(Array.from({ length: 30 }, (_, i) => `Panjang${i}`).join(" "), 12, 1250000)];
    const lines = receiptLines(long, shop);
    const wrapped = lines.filter((l) => /^\|\s+\| /.test(l));
    expect(wrapped.length).toBeGreaterThan(0);
    for (const line of wrapped) expect(line).toHaveLength(shop.width);
  });

  it("aligns the totals to the same right edge as the table", () => {
    const lines = receiptLines(sampleReceipt(base.tanggal), shop);
    const item = lines.find((l) => l.includes("204.000")) ?? "";
    const valueBar = item.lastIndexOf("|", item.length - 2);
    for (const label of ["Subtotal", "Diskon", "TOTAL", "Dibayar", "Kembali"]) {
      const line = lines.find((l) => l.includes(label + " |"));
      expect(line, label).toBeDefined();
      expect(line).toHaveLength(shop.width);
      expect(line?.lastIndexOf("|", (line?.length ?? 0) - 2)).toBe(valueBar);
    }
  });

  it("carries the shop address and phone when they are filled", () => {
    const text = receiptLines(sampleReceipt(base.tanggal), shop).join("\n");
    expect(text).toContain("Jl. Lintas Selatan No. 12");
    expect(text).toContain("Telp. 0812 3456 7890");
    expect(text).toContain("NOTA PENJUALAN");
  });

  it("omits the address block when the fields are empty", () => {
    const text = receiptLines(sampleReceipt(base.tanggal), dot).join("\n");
    expect(text).not.toContain("Telp.");
    expect(text).toContain("NOTA PENJUALAN");
  });

  it("closes with the amount in words and no signature block", () => {
    const text = receiptLines(sampleReceipt(base.tanggal), shop).join("\n");
    expect(text).toContain("Terbilang: empat ratus ribu rupiah");
    expect(text).not.toContain("Penerima,");
    expect(text).not.toContain("Hormat kami,");
  });

  it("falls back to the compact receipt on narrow roll paper", () => {
    const text = receiptLines(sampleReceipt(base.tanggal), roll).join("\n");
    expect(text).not.toContain("NOTA PENJUALAN");
    expect(text).not.toContain("Hormat kami,");
    expect(roll.width).toBeLessThan(WIDE_MIN);
  });

  it("keeps every invoice line inside the printable width", () => {
    const layout = interpret(buildReceipt(sampleReceipt(base.tanggal), shop), deviceFor(shop));
    expect(layout.wrapped).toBe(false);
    expect(layout.widestMm).toBeLessThanOrEqual(shop.printable + 0.01);
  });

  it("shows sisa utang instead of kembali on credit", () => {
    const text = receiptLines({ ...sampleReceipt(base.tanggal), dibayar: 100000, kembalian: 0, utang: 300000 }, shop).join("\n");
    expect(text).toContain("Sisa Utang");
    expect(text).not.toContain("Kembali ");
  });
});

describe("invoice closing note", () => {
  const shop = { ...dot, header: "SAHABAT SENTARUM", footer: "Terima kasih atas kepercayaan Anda" };

  it("ends the invoice with the closing note", () => {
    const lines = receiptLines(sampleReceipt(base.tanggal), shop);
    expect(lines[lines.length - 1]).toBe("Terima kasih atas kepercayaan Anda");
  });

  it("prints the closing note exactly once", () => {
    const text = new TextDecoder().decode(buildReceipt(sampleReceipt(base.tanggal), shop));
    expect(text.split("Terima kasih").length - 1).toBe(1);
  });

  it("puts the closing note after the terbilang line", () => {
    const lines = receiptLines(sampleReceipt(base.tanggal), shop);
    const words = lines.findIndex((l) => l.startsWith("Terbilang:"));
    const note = lines.findIndex((l) => l.includes("Terima kasih"));
    expect(words).toBeGreaterThan(-1);
    expect(note).toBeGreaterThan(words);
  });

  it("still centres the note on narrow roll paper", () => {
    const text = new TextDecoder().decode(buildReceipt(sampleReceipt(base.tanggal), { ...roll, footer: "Terima kasih" }));
    expect(text).toContain("Terima kasih");
  });
});

describe("full page nota", () => {
  const shop = { ...dot, header: "SAHABAT SENTARUM", footer: "Terima kasih atas kepercayaan Anda" };

  it("drops the closing note onto the last line of the sheet", () => {
    const lines = receiptLines(sampleReceipt(base.tanggal), shop);
    expect(lines[lines.length - 1]).toBe("Terima kasih atas kepercayaan Anda");
    expect(lines).toHaveLength(shop.pageLines - 2);
  });

  it("fills exactly one sheet so the form feed completes the page", () => {
    const layout = interpret(buildReceipt(sampleReceipt(base.tanggal), shop), deviceFor(shop));
    expect(layout.pages).toHaveLength(1);
    expect(layout.lineCount).toBe(shop.pageLines - 1);
    expect(layout.stopMm).toBeCloseTo(279.4, 1);
  });

  it("prints the note near the foot of the page not the middle", () => {
    const layout = interpret(buildReceipt(sampleReceipt(base.tanggal), shop), deviceFor(shop));
    const printed = layout.pages[0].lines.filter((l) => l.runs.length);
    const last = printed[printed.length - 1];
    expect(last.runs.map((r) => r.text).join("")).toContain("Terima kasih");
    expect(last.yMm).toBeGreaterThan(layout.pageMm - 12);
  });

  it("keeps the form feed last so auto tear off still fires", () => {
    const bytes = buildReceipt(sampleReceipt(base.tanggal), shop);
    expect(bytes[bytes.length - 1]).toBe(0x0c);
  });

  it("never pads a nota that already overflows the sheet", () => {
    const many = { ...sampleReceipt(base.tanggal) };
    many.items = Array.from({ length: 80 }, () => item("Semen Tiga Roda 50kg", 1, 68000));
    const lines = receiptLines(many, shop);
    expect(lines.filter((l) => l === "")).toHaveLength(3);
    expect(lines[lines.length - 1]).toBe("Terima kasih atas kepercayaan Anda");
  });

  it("leaves narrow roll paper unpadded", () => {
    const lines = receiptLines(sampleReceipt(base.tanggal), { ...roll, pageLines: 66 });
    expect(lines.length).toBeLessThan(30);
  });
});