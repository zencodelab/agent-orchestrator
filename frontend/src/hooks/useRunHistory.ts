import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { useRunStore } from "@/store/useRunStore";

/** Loads run history on mount and exposes a manual refresh with loading/error state. */
export function useRunHistory() {
  const setHistory = useRunStore((s) => s.setHistory);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHistory(await api.listRuns());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, [setHistory]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { refresh, loading, error };
}
