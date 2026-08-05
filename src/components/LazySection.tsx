import { useState, useEffect, useRef, type ReactNode } from "react";

export default function LazySection({ children, height = 300, className = "" }: { children: ReactNode; height?: number; className?: string }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className} style={visible ? undefined : { minHeight: height }}>
      {visible ? children : null}
    </div>
  );
}
