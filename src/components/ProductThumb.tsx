import { memo, useState, useEffect } from "react";
import { acquireImageUrl } from "@/lib/images";

export default memo(function ProductThumb({ path, size = "h-8 w-8" }: { path: string | null; size?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) { setUrl(null); return; }
    const { promise, release } = acquireImageUrl(path);
    promise.then((u) => setUrl(u));
    return release;
  }, [path]);

  if (!url) return <div className={`${size} flex items-center justify-center rounded bg-muted text-[10px] text-muted-foreground`}>-</div>;
  return <img src={url} className={`${size} rounded object-cover`} loading="lazy" />;
});
