import { PrinterSettings } from "@/db/settings";

const CHAR_MM = 25.4 / 15;
const LINE_MM = 25.4 / 6;
const PAGE_HEIGHT_MM = 279.4;

interface Props {
  lines: string[];
  settings: PrinterSettings;
  scale?: number;
}

export default function PagePreview({ lines, settings, scale = 2.4 }: Props) {
  const paperMm = settings.paper;
  const textMm = settings.width * CHAR_MM * settings.scale;
  const usedLines = lines.length;
  const tearMm = (usedLines + settings.tearFeed) * LINE_MM;
  const overflow = textMm > paperMm;

  return (
    <div className="space-y-2">
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          width: `${paperMm * scale}px`,
          height: `${PAGE_HEIGHT_MM * scale}px`,
          background: "#ffffff",
          color: "#111111",
          border: "1px solid #94a3b8",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }}
      >
        <pre
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            margin: 0,
            whiteSpace: "pre",
            fontFamily: "ui-monospace, Consolas, monospace",
            color: "#111111",
            fontSize: `${CHAR_MM * scale * settings.scale / 0.6}px`,
            lineHeight: `${LINE_MM * scale}px`,
          }}
        >
          {lines.join("\n")}
        </pre>

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${usedLines * LINE_MM * scale}px`,
            borderTop: "2px dashed #2563eb",
          }}
        />
        {settings.tearFeed > 0 && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${Math.min(tearMm, PAGE_HEIGHT_MM) * scale}px`,
              borderTop: "2px dashed #dc2626",
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            borderTop: "2px dashed #d97706",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${Math.min(textMm, paperMm) * scale}px`,
            borderRight: "2px dotted #16a34a",
          }}
        />
      </div>

      <div className="space-y-1 text-sm text-muted-foreground">
        <p>
          Lebar teks {textMm.toFixed(0)} mm dari kertas {paperMm} mm
          {overflow ? " (kelebihan, baris akan melipat)" : ""}
        </p>
        <p>
          {usedLines} baris terpakai, berhenti di {(usedLines * LINE_MM).toFixed(0)} mm
          {settings.tearFeed > 0 ? `, setelah maju sobek ${tearMm.toFixed(0)} mm` : ""}
        </p>
        <div className="flex flex-wrap gap-4">
          {[
            { color: "#16a34a", label: "batas teks" },
            { color: "#2563eb", label: "akhir cetak" },
            { color: "#dc2626", label: "setelah maju sobek" },
            { color: "#d97706", label: "perforasi lembar" },
          ].map((item) => (
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
