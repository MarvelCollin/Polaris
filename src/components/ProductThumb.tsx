import { useState, useEffect } from "react";
import { getImageUrl } from "@/lib/images";

export default function ProductThumb({ path, size = "h-8 w-8" }: { path: string | null; size?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) { setUrl(null); return; }
    let revoke = "";
    getImageUrl(path).then((u) => { if (u) { revoke = u; setUrl(u); } });
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [path]);

  if (!url) return <div className={`${size} flex items-center justify-center rounded bg-muted text-[10px] text-muted-foreground`}>-</div>;
  return <img src={url} className={`${size} rounded object-cover`} />;
}
