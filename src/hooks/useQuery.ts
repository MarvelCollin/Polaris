import { useState, useEffect, useCallback, useRef } from "react";

export function useQuery<T>(queryFn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);

  const fetch = useCallback(async () => {
    const v = ++version.current;
    setLoading(true);
    setError(null);
    try {
      const result = await queryFn();
      if (v === version.current) {
        setData(result);
      }
    } catch (e) {
      if (v === version.current) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (v === version.current) {
        setLoading(false);
      }
    }
  }, [queryFn]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
