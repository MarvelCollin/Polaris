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
        className="relative overflow-hidden border bg-white text-black"
        style={{
          width: `${paperMm * scale}px`,
          height: `${PAGE_HEIGHT_MM * scale}px`,
        }}
      >
        <pre
          className="absolute left-0 top-0 whitespace-pre font-mono"
          style={{
            fontSize: `${CHAR_MM * scale * settings.scale / 0.6}px`,
            lineHeight: `${LINE_MM * scale}px`,
          }}
        >
          {lines.join("\n")}
        </pre>

        <div
          className="absolute left-0 right-0 border-t border-dashed border-blue-500"
          style={{ top: `${usedLines * LINE_MM * scale}px` }}
        />
        {settings.tearFeed > 0 && (
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed border-red-500"
            style={{ top: `${Math.min(tearMm, PAGE_HEIGHT_MM) * scale}px` }}
          />
        )}
        <div
          className="absolute bottom-0 left-0 right-0 border-t-2 border-dashed border-amber-500"
        />
        <div
          className="absolute bottom-0 top-0 border-r border-dotted border-green-600"
          style={{ left: `${Math.min(textMm, paperMm) * scale}px` }}
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
        <p>Garis hijau batas teks, biru akhir cetak, merah posisi setelah maju sobek, kuning perforasi lembar</p>
      </div>
    </div>
  );
}
