import { useCallback, useEffect } from "react";

import { api } from "@/lib/api";
import { useRunStore } from "@/store/useRunStore";

/** Loads run history on mount and exposes a manual refresh. */
export function useRunHistory() {
  const setHistory = useRunStore((s) => s.setHistory);

  const refresh = useCallback(async () => {
    try {
      setHistory(await api.listRuns());
    } catch {
      /* backend may not be up yet; ignore */
    }
  }, [setHistory]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { refresh };
}
