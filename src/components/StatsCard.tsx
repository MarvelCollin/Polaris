import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  title: string;
  value: string;
  variant?: "default" | "success" | "danger" | "warning";
  to?: string;
}

const variantColors = {
  default: "text-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  danger: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
};

export default function StatsCard({ title, value, variant = "default", to }: Props) {
  const navigate = useNavigate();

  return (
    <Card
      className={to ? "cursor-pointer transition-shadow hover:shadow-md" : ""}
      onClick={to ? () => navigate(to) : undefined}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          {to && <span className="text-xs text-muted-foreground">→</span>}
        </div>
        <p className={`mt-1 text-2xl font-bold ${variantColors[variant]}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
