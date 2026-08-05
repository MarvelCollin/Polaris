import { memo, useState, useRef, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface Option {
  value: number;
  label: string;
}

interface Props {
  options: Option[];
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  emptyLabel?: string;
}

export default memo(function SearchableSelect({ options, value, onChange, placeholder = "Cari...", emptyLabel = "Pilih..." }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);
  const filtered = useMemo(() => search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options, [options, search]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 text-sm transition-colors hover:bg-accent"
      >
        <span className={selected ? "" : "text-muted-foreground"}>
          {selected ? selected.label : emptyLabel}
        </span>
        <svg className="size-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="animate-fade-in-up absolute z-50 mt-1 w-full rounded-md border bg-background shadow-lg">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={placeholder}
                className="h-8 pl-7 text-xs"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            <button
              type="button"
              onClick={() => { onChange(0); setOpen(false); setSearch(""); }}
              className={`w-full rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent ${value === 0 ? "bg-accent font-medium" : ""}`}
            >
              {emptyLabel}
            </button>
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); setSearch(""); }}
                className={`w-full rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent ${value === o.value ? "bg-accent font-medium" : ""}`}
              >
                {o.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">Tidak ditemukan</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
