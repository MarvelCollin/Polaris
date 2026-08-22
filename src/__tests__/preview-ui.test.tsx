import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PagePreview from "@/components/PagePreview";
import { DEFAULT_PRINTER_SETTINGS } from "@/db/settings";

const SCALE = 2.4;

function markup(settings = DEFAULT_PRINTER_SETTINGS): string {
  return renderToStaticMarkup(<PagePreview settings={settings} now={new Date(2026, 0, 1, 13, 0)} />);
}

function glyphLefts(html: string): number[] {
  return [...html.matchAll(/left:([\d.]+)px;top:[\d.]+px;width:([\d.]+)px/g)].map((m) => Number(m[1]));
}

describe("paper preview ui", () => {
  it("draws the sheet at true paper size", () => {
    const sheet = markup().match(/width:([\d.]+)px;height:([\d.]+)px/);
    expect(Number(sheet?.[1]) / SCALE).toBeCloseTo(241, 1);
    expect(Number(sheet?.[2]) / SCALE).toBeCloseTo(279.4, 1);
  });

  it("sizes each character cell to the selected pitch", () => {
    const cell = markup().match(/left:[\d.]+px;top:[\d.]+px;width:([\d.]+)px/);
    expect(Number(cell?.[1]) / SCALE).toBeCloseTo(25.4 / 17.142857, 2);
  });

  it("starts the text inside the tractor strip and fills the printable width", () => {
    const lefts = glyphLefts(markup());
    expect(Math.min(...lefts) / SCALE).toBeCloseTo(18.9, 1);
    expect(Math.max(...lefts) / SCALE + 25.4 / 17.142857).toBeCloseTo(220.4, 1);
  });

  it("marks both carriage limits and the sheet perforation", () => {
    const guides = [...markup().matchAll(/<div style="([^"]*(?:dotted|dashed)[^"]*)"/g)].map((m) => m[1]);
    expect(guides.some((g) => g.includes("left:43.36") && g.includes("border-left"))).toBe(true);
    expect(guides.some((g) => g.includes("left:533.04") && g.includes("border-right"))).toBe(true);
    expect(guides.some((g) => g.includes("top:668.56") && g.includes("#d97706"))).toBe(true);
  });

  it("reports the geometry in the caption", () => {
    const text = markup().replace(/<[^>]*>/g, "");
    expect(text).toContain("Kertas 241 mm, area cetak 203 mm, muat 137 kolom");
    expect(text).toContain("Teks terlebar 202 mm, 65 baris tercetak");
    expect(text).toContain("Kertas berhenti 279 mm dari posisi awal");
  });

  it("warns and rewraps when the columns do not fit the pitch", () => {
    const text = markup({ ...DEFAULT_PRINTER_SETTINGS, width: 160 }).replace(/<[^>]*>/g, "");
    expect(text).toContain("melipat");
    expect(text).toContain("Turunkan jumlah kolom ke 137");
  });
});

describe("roll paper preview", () => {
  const roll = { ...DEFAULT_PRINTER_SETTINGS, dialect: "escpos" as const, paper: 76, printable: 64, width: 40, cut: true };

  it("draws no page perforation on a continuous roll", () => {
    const text = markup(roll).replace(/<[^>]*>/g, "");
    expect(text).not.toContain("perforasi lembar");
  });

  it("sizes the sheet to the receipt rather than an eleven inch page", () => {
    const sheet = markup(roll).match(/width:([\d.]+)px;height:([\d.]+)px/);
    expect(Number(sheet?.[1]) / SCALE).toBeCloseTo(76, 1);
    expect(Number(sheet?.[2]) / SCALE).toBeLessThan(279.4);
  });
});
