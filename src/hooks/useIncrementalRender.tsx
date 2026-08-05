import { useState, useEffect, useRef, useCallback } from "react";

export function useIncrementalRender<T>(items: T[], step = 48) {
  const [count, setCount] = useState(step);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCount(step);
  }, [items, step]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setCount((c) => Math.min(c + step, items.length));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [items.length, step]);

  const Sentinel = useCallback(() => {
    if (count >= items.length) return null;
    return <div ref={sentinelRef} className="h-1" />;
  }, [count, items.length]);

  return {
    visible: items.slice(0, count),
    hasMore: count < items.length,
    Sentinel,
  };
}
