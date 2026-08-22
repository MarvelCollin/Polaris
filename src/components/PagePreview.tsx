import { useMemo } from "react";
import { PrinterSettings, deviceFor, maxColumns } from "@/db/settings";
import { previewBytes } from "@/lib/escpos";
import { interpret, Line } from "@/lib/escInterpreter";

interface Props {
  settings: PrinterSettings;
  scale?: number;
  now?: Date;
}

const GUIDES = [
  { color: "#16a34a", label: "batas cetak printer" },
  { color: "#2563eb", label: "akhir cetak" },
  { color: "#dc2626", label: "posisi kertas berhenti" },
  { color: "#d97706", label: "perforasi lembar" },
];

function endOf(lines: Line[]): number {
  const last = lines[lines.length - 1];
  return last ? last.yMm + last.heightMm : 0;
}

export default function PagePreview({ settings, scale = 2.4, now }: Props) {
  const layout = useMemo(
    () => interpret(previewBytes(settings, now ?? new Date(2026, 0, 1, 13, 0)), deviceFor(settings)),
    [settings, now]
  );

  const sheetMm = Math.max(layout.pageMm, endOf(layout.pages[layout.pages.length - 1]?.lines ?? []) + 20);
  const fits = maxColumns(settings);
  const stopOnLast = layout.stopMm - (layout.pages.length - 1) * layout.pageMm;

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
                      char === " " ? null : (
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
                    left: `${layout.originMm * scale}px`,
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
                {last && stopOnLast > 0 && stopOnLast < sheetMm && (
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
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: `${layout.pageMm * scale}px`,
                    borderTop: "2px dashed #d97706",
                  }}
                />
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
          {GUIDES.map((item) => (
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
