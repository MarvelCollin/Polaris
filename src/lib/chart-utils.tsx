import { formatRupiah } from "@/types/index";
import { type ChartGroupBy } from "@/db/sales";

export const CHART_COLORS = ["#e07828", "#1b508a", "#d4952e", "#2e7ab8", "#c45a1a", "#3a8cc4", "#e8a84c", "#4a6e94", "#b84e14", "#5ba0d0"];

export const GROUP_LABELS: Record<ChartGroupBy, string> = { day: "Harian", week: "Mingguan", month: "Bulanan", year: "Tahunan" };

export function formatShortRupiah(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}jt`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}rb`;
  return String(value);
}

export function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }}>{entry.name}: {formatRupiah(entry.value)}</p>
      ))}
    </div>
  );
}

export function PieTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload?: { fill: string } }[] }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const color = entry.payload?.fill;
  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-md">
      <p className="font-medium" style={color ? { color } : undefined}>{entry.name}</p>
      <p>{formatRupiah(entry.value)}</p>
    </div>
  );
}
