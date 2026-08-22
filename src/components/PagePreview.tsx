import { useMemo } from "react";
import { PrinterSettings, deviceFor, maxColumns } from "@/db/settings";
import { previewBytes } from "@/lib/escpos";
import { interpret, Line } from "@/lib/escInterpreter";

interface Props {
  settings: PrinterSettings;
  scale?: number;
  now?: Date;
}

const CARRIAGE = { color: "#16a34a", label: "batas cetak printer" };
const END = { color: "#2563eb", label: "akhir cetak" };
const STOP = { color: "#dc2626", label: "posisi kertas berhenti" };
const PERFORATION = { color: "#d97706", label: "perforasi lembar" };

const SEGMENTS: Record<string, { h?: [number, number]; v?: [number, number] }> = {
  "─": { h: [0, 1] },
  "│": { v: [0, 1] },
  "┌": { h: [0.5, 1], v: [0.5, 1] },
  "┐": { h: [0, 0.5], v: [0.5, 1] },
  "└": { h: [0.5, 1], v: [0, 0.5] },
  "┘": { h: [0, 0.5], v: [0, 0.5] },
  "├": { h: [0.5, 1], v: [0, 1] },
  "┤": { h: [0, 0.5], v: [0, 1] },
  "┬": { h: [0, 1], v: [0.5, 1] },
  "┴": { h: [0, 1], v: [0, 0.5] },
  "┼": { h: [0, 1], v: [0, 1] },
};

const INK = "#111111";

function BoxGlyph({ char, left, top, width, height }: { char: string; left: number; top: number; width: number; height: number }) {
  const seg = SEGMENTS[char];
  if (!seg) return null;
  const stroke = Math.max(1, Math.round(height * 0.08));
  return (
    <>
      {seg.h && (
        <div
          style={{
            position: "absolute",
            left: `${left + width * seg.h[0]}px`,
            top: `${top + height / 2 - stroke / 2}px`,
            width: `${width * (seg.h[1] - seg.h[0])}px`,
            height: `${stroke}px`,
            background: INK,
          }}
        />
      )}
      {seg.v && (
        <div
          style={{
            position: "absolute",
            left: `${left + width / 2 - stroke / 2}px`,
            top: `${top + height * seg.v[0]}px`,
            width: `${stroke}px`,
            height: `${height * (seg.v[1] - seg.v[0])}px`,
            background: INK,
          }}
        />
      )}
    </>
  );
}

function endOf(lines: Line[]): number {
  const last = lines[lines.length - 1];
  return last ? last.yMm + last.heightMm : 0;
}

export default function PagePreview({ settings, scale = 2.4, now }: Props) {
  const layout = useMemo(
    () => interpret(previewBytes(settings, now ?? new Date(2026, 0, 1, 13, 0)), deviceFor(settings)),
    [settings, now]
  );

  const tail = endOf(layout.pages[layout.pages.length - 1]?.lines ?? []) + 20;
  const sheetMm = layout.paged ? layout.pageMm : tail;
  const fits = maxColumns(settings);
  const stopOnLast = layout.stopMm - (layout.pages.length - 1) * layout.pageMm;
  const showStop = stopOnLast > 0 && stopOnLast < sheetMm;
  const guides = [CARRIAGE, END, ...(showStop ? [STOP] : []), ...(layout.paged ? [PERFORATION] : [])];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-4">
        {layout.pages.map((page, index) => {
          const last = index === layout.pages.length - 1;
          return (
            <div key={index} className="space-y-1">
              <div
                style={{
                  position: "relative",
                  overflow: "hidden",
                  width: `${layout.paperMm * scale}px`,
                  height: `${sheetMm * scale}px`,
                  background: "#ffffff",
                  border: "1px solid #94a3b8",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }}
              >
                {page.lines.map((line, row) =>
                  line.runs.map((run, part) =>
                    run.text.split("").map((char, cell) =>
                      char === " " ? null : SEGMENTS[char] ? (
                        <BoxGlyph
                          key={`${row}-${part}-${cell}`}
                          char={char}
                          left={(run.xMm + cell * run.charMm) * scale}
                          top={line.yMm * scale}
                          width={run.charMm * scale}
                          height={line.heightMm * scale}
                        />
                      ) : (
                        <span
                          key={`${row}-${part}-${cell}`}
                          style={{
                            position: "absolute",
                            left: `${(run.xMm + cell * run.charMm) * scale}px`,
                            top: `${line.yMm * scale}px`,
                            width: `${run.charMm * scale}px`,
                            height: `${line.heightMm * scale}px`,
                            lineHeight: `${line.heightMm * scale}px`,
                            fontFamily: "ui-monospace, Consolas, monospace",
                            fontSize: `${(run.charMm / 0.6) * scale}px`,
                            transform: run.tall ? "scaleY(1.8)" : undefined,
                            transformOrigin: "top left",
                            color: "#111111",
                          }}
                        >
                          {char}
                        </span>
                      )
                    )
                  )
                )}

                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${layout.originMm * scale - 2}px`,
                    borderLeft: "2px dotted #16a34a",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${(layout.originMm + layout.printableMm) * scale}px`,
                    borderRight: "2px dotted #16a34a",
                  }}
                />
                {last && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: `${endOf(page.lines) * scale}px`,
                      borderTop: "2px dashed #2563eb",
                    }}
                  />
                )}
                {last && showStop && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: `${stopOnLast * scale}px`,
                      borderTop: "2px dashed #dc2626",
                    }}
                  />
                )}
                {layout.paged && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: `${layout.pageMm * scale - 2}px`,
                      borderTop: "2px dashed #d97706",
                    }}
                  />
                )}
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Lembar {index + 1} dari {layout.pages.length}
              </p>
            </div>
          );
        })}
      </div>

      <div className="space-y-1 text-sm text-muted-foreground">
        <p>
          Kertas {layout.paperMm} mm, area cetak {layout.printableMm.toFixed(0)} mm, muat {fits} kolom
        </p>
        <p>
          Teks terlebar {layout.widestMm.toFixed(0)} mm, {layout.lineCount} baris tercetak
          {layout.wrapped ? ", ada baris yang melipat karena melewati area cetak" : ""}
        </p>
        <p>
          Kertas berhenti {layout.stopMm.toFixed(0)} mm dari posisi awal
          {settings.tearFeed > 0 ? `, sudah termasuk maju sobek ${settings.tearFeed} baris` : ""}
        </p>
        {layout.wrapped && (
          <p className="font-medium text-destructive">
            Turunkan jumlah kolom ke {fits} atau rapatkan huruf supaya tidak melipat
          </p>
        )}
        <div className="flex flex-wrap gap-4">
          {guides.map((item) => (
            <span key={item.label} className="flex items-center gap-1">
              <span style={{ width: 16, height: 0, borderTop: `2px dashed ${item.color}` }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
