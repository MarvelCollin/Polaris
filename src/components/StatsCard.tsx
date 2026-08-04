import { Card, CardContent } from "@/components/ui/card";

interface Props {
  title: string;
  value: string;
  variant?: "default" | "success" | "danger" | "warning";
}

const variantColors = {
  default: "text-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  danger: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
};

export default function StatsCard({ title, value, variant = "default" }: Props) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
        <p className={`mt-1 text-2xl font-bold ${variantColors[variant]}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
