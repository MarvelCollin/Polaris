import { TableHead } from "@/components/ui/table";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

interface Props {
  label: string;
  sortKey: string;
  active: boolean;
  dir: "asc" | "desc";
  onSort: (key: string) => void;
  className?: string;
}

export default function SortableHead({ label, sortKey, active, dir, onSort, className }: Props) {
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-30" />
        )}
      </button>
    </TableHead>
  );
}
