const ESC = 0x1b;
const GS = 0x1d;
const SI = 0x0f;
const DC2 = 0x12;
const LF = 0x0a;
const CR = 0x0d;
const FF = 0x0c;

export interface Run {
  text: string;
  xMm: number;
  charMm: number;
  tall: boolean;
}

export interface Line {
  runs: Run[];
  yMm: number;
  heightMm: number;
  widthMm: number;
  continued: boolean;
}

export interface Page {
  lines: Line[];
  heightMm: number;
}

export interface Layout {
  pages: Page[];
  paperMm: number;
  printableMm: number;
  pageMm: number;
  originMm: number;
  stopMm: number;
  lineCount: number;
  wrapped: boolean;
  widestMm: number;
}

export interface Device {
  paperMm: number;
  printableMm: number;
  originMm: number;
  cpi: number;
  condensed: boolean;
  lineMm: number;
  pageMm: number;
  justify: boolean;
  master: boolean;
  escposSize: boolean;
  pageBreaks: boolean;
}

export function condensedCpi(cpi: number): number {
  if (cpi === 10) return 120 / 7;
  if (cpi === 12) return 20;
  return cpi;
}

function pitch(cpi: number, condensed: boolean): number {
  return condensed ? condensedCpi(cpi) : cpi;
}

export function columnsFor(printableMm: number, cpi: number): number {
  return Math.max(1, Math.floor(printableMm / (25.4 / cpi)));
}

const PARAMS: Record<number, number> = {
  0x21: 1,
  0x2d: 1,
  0x33: 1,
  0x41: 1,
  0x4a: 1,
  0x51: 1,
  0x52: 1,
  0x53: 1,
  0x57: 1,
  0x61: 1,
  0x64: 1,
  0x6c: 1,
  0x72: 1,
  0x74: 1,
  0x55: 1,
  0x77: 1,
  0x78: 1,
};

export function interpret(bytes: Uint8Array, device: Device): Layout {
  let cpi = device.cpi;
  let condensed = device.condensed;
  let wide = false;
  let tall = false;
  let lineMm = device.lineMm;
  let pageMm = device.pageMm;
  let align = 0;

  const pages: Page[] = [];
  let lines: Line[] = [];
  let runs: Run[] = [];
  let x = 0;
  let pageY = 0;
  let stopMm = 0;
  let lineCount = 0;
  let wrapped = false;
  let widest = 0;

  function charMm(): number {
    return (25.4 / pitch(cpi, condensed)) * (wide ? 2 : 1);
  }

  function rowMm(): number {
    return lineMm * (tall ? 2 : 1);
  }

  function closePage() {
    if (!lines.length && !pages.length) return;
    pages.push({ lines, heightMm: pageMm });
    lines = [];
  }

  function flush(continued: boolean) {
    const height = rowMm();
    const offset =
      device.justify && align > 0 && x < device.printableMm
        ? align === 1
          ? (device.printableMm - x) / 2
          : device.printableMm - x
        : 0;

    const shift = device.originMm + offset;
    lines.push({
      runs: shift ? runs.map((run) => ({ ...run, xMm: run.xMm + shift })) : runs,
      yMm: pageY,
      heightMm: height,
      widthMm: x,
      continued,
    });

    if (x > widest) widest = x;
    runs = [];
    x = 0;
    pageY += height;
    stopMm += height;
    lineCount += 1;

    if (device.pageBreaks && pageY >= pageMm - 0.01) {
      closePage();
      pageY = 0;
    }
  }

  function formFeed() {
    if (!device.pageBreaks) {
      flush(false);
      return;
    }
    if (runs.length) flush(false);
    const remain = pageMm - pageY;
    stopMm += remain;
    closePage();
    pageY = 0;
  }

  function put(code: number) {
    const step = charMm();
    if (x + step > device.printableMm + 0.01) {
      flush(true);
      wrapped = true;
    }
    const last = runs[runs.length - 1];
    if (last && last.charMm === step && last.tall === tall) {
      last.text += String.fromCharCode(code);
    } else {
      runs.push({ text: String.fromCharCode(code), xMm: x, charMm: step, tall });
    }
    x += step;
  }

  let i = 0;
  while (i < bytes.length) {
    const byte = bytes[i];

    if (byte === ESC) {
      const cmd = bytes[i + 1];
      i += 2;

      if (cmd === 0x40) {
        cpi = device.cpi;
        condensed = device.condensed;
        wide = false;
        tall = false;
        lineMm = device.lineMm;
        pageMm = device.pageMm;
        align = 0;
        continue;
      }
      if (cmd === 0x50) { cpi = 10; continue; }
      if (cmd === 0x4d) { cpi = 12; continue; }
      if (cmd === 0x67) { cpi = 15; continue; }
      if (cmd === 0x0f) { condensed = true; continue; }
      if (cmd === 0x32) { lineMm = 25.4 / 6; continue; }
      if (cmd === 0x30) { lineMm = 25.4 / 8; continue; }
      if (cmd === 0x33) { lineMm = (bytes[i] ?? 0) * (25.4 / 216); i += 1; continue; }
      if (cmd === 0x41) { lineMm = (bytes[i] ?? 0) * (25.4 / 72); i += 1; continue; }
      if (cmd === 0x57) { wide = ((bytes[i] ?? 0) & 1) === 1; i += 1; continue; }
      if (cmd === 0x61) { align = bytes[i] ?? 0; i += 1; continue; }
      if (cmd === 0x64) { const n = bytes[i] ?? 0; i += 1; for (let k = 0; k < n; k += 1) flush(false); continue; }
      if (cmd === 0x70) { i += 3; continue; }
      if (cmd === 0x43) {
        if (bytes[i] === 0x00) {
          pageMm = (bytes[i + 1] ?? 11) * 25.4;
          i += 2;
        } else {
          pageMm = (bytes[i] ?? 66) * lineMm;
          i += 1;
        }
        continue;
      }
      if (cmd === 0x21) {
        const n = bytes[i] ?? 0;
        if (device.master) {
          i += 1;
          cpi = (n & 0x01) === 0x01 ? 12 : 10;
          condensed = (n & 0x04) === 0x04;
          wide = (n & 0x20) === 0x20;
          tall = false;
        }
        continue;
      }

      const skip = PARAMS[cmd];
      if (skip) i += skip;
      continue;
    }

    if (byte === GS) {
      const cmd = bytes[i + 1];
      if (cmd === 0x21) {
        const n = bytes[i + 2] ?? 0;
        i += 3;
        if (device.escposSize) {
          wide = ((n >> 4) & 0x07) > 0;
          tall = (n & 0x07) > 0;
        }
        continue;
      }
      if (cmd === 0x56) {
        const mode = bytes[i + 2] ?? 0;
        i += mode === 0x41 || mode === 0x42 ? 4 : 3;
        continue;
      }
      i += 2;
      continue;
    }

    i += 1;

    if (byte === LF) { flush(false); continue; }
    if (byte === CR) { continue; }
    if (byte === FF) { formFeed(); continue; }
    if (byte === SI) { condensed = true; continue; }
    if (byte === DC2) { condensed = false; continue; }
    if (byte < 0x20) continue;

    put(byte);
  }

  if (runs.length) flush(false);
  if (lines.length || !pages.length) closePage();

  return {
    pages,
    paperMm: device.paperMm,
    printableMm: device.printableMm,
    originMm: device.originMm,
    pageMm,
    stopMm,
    lineCount,
    wrapped,
    widestMm: widest,
  };
}
