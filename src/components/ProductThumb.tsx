import { memo, useState, useEffect } from "react";
import { Package } from "lucide-react";
import { acquireImageUrl } from "@/lib/images";

export default memo(function ProductThumb({ path, size = "h-8 w-8" }: { path: string | null; size?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) { setUrl(null); return; }
    const { promise, release } = acquireImageUrl(path);
    promise.then((u) => setUrl(u));
    return release;
  }, [path]);

  if (!url) return <div className={`${size} flex items-center justify-center rounded-lg bg-muted/50`}><Package className="size-6 text-muted-foreground/40" /></div>;
  return <img src={url} className={`${size} rounded-lg object-cover`} loading="lazy" />;
});
