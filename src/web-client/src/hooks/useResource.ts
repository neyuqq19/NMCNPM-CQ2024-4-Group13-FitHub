import { useEffect, useRef, useState } from "react";
export function useResource<T>(key: string, load: () => Promise<T>) {
  const loader = useRef(load);
  loader.current = load;
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    setData(null);
    loader
      .current()
      .then((value) => {
        if (live) setData(value);
      })
      .catch((e) => {
        if (live)
          setError(e instanceof Error ? e.message : "Không tải được dữ liệu.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [key, revision]);
  return { data, error, loading, reload: () => setRevision((r) => r + 1) };
}
