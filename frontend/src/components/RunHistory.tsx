import { useState } from "react";
import { Loader2, Plus, Workflow } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { RunStatus, RunSummary } from "@/lib/types";
import { cn, formatDuration, formatTime } from "@/lib/utils";
import { useRunStore } from "@/store/useRunStore";

const BADGE_VARIANT: Record<RunStatus, "idle" | "running" | "completed" | "error"> = {
  pending: "idle",
  running: "running",
  completed: "completed",
  error: "error",
};

type FilterStatus = RunStatus | "all";
const FILTERS: { label: string; value: FilterStatus }[] = [
  { label: "All", value: "all" },
  { label: "Running", value: "running" },
  { label: "Done", value: "completed" },
  { label: "Error", value: "error" },
];

function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <Badge variant={BADGE_VARIANT[status]}>
      {status === "running" && <Loader2 className="h-3 w-3 animate-spin" />}
      {status}
    </Badge>
  );
}

export function RunHistory() {
  const history = useRunStore((s) => s.history);
  const currentRunId = useRunStore((s) => s.currentRunId);
  const reset = useRunStore((s) => s.reset);
  const setHistory = useRunStore((s) => s.setHistory);
  const attachToLiveRun = useRunStore((s) => s.attachToLiveRun);
  const loadCompletedRun = useRunStore((s) => s.loadCompletedRun);

  const [filter, setFilter] = useState<FilterStatus>("all");

  async function applyFilter(value: FilterStatus) {
    setFilter(value);
    try {
      const runs = await api.listRuns(value === "all" ? undefined : value);
      setHistory(runs);
    } catch {
      /* keep current list on error */
    }
  }

  async function open(summary: RunSummary) {
    if (summary.id === currentRunId) return;
    if (summary.status === "running" || summary.status === "pending") {
      // Reconnect to a still-executing run and stream the rest.
      attachToLiveRun(summary.id);
      return;
    }
    try {
      const detail = await api.getRun(summary.id);
      loadCompletedRun(detail);
    } catch {
      /* ignore — keep current view */
    }
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card/30">
      <div className="border-b border-border">
        <div className="flex items-center justify-between gap-2 p-3 pb-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Workflow className="h-4 w-4 text-primary" />
            Run History
          </div>
          <Button variant="outline" size="sm" onClick={reset} title="Start a new run">
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        </div>
        <div className="flex gap-1 px-3 pb-2" role="group" aria-label="Filter runs by status">
          {FILTERS.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              onClick={() => void applyFilter(value)}
              aria-pressed={filter === value}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                filter === value
                  ? "bg-primary text-primary-foreground"
                  : "bg-accent/50 text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {history.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">No runs yet. Start one above.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {history.map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  onClick={() => void open(run)}
                  aria-current={run.id === currentRunId ? "true" : undefined}
                  aria-label={`${run.query} — ${run.status}, ${formatTime(run.created_at)}`}
                  className={cn(
                    "flex w-full flex-col items-start gap-1.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/60",
                    run.id === currentRunId && "bg-accent/80",
                  )}
                >
                  <span className="line-clamp-2 text-xs text-slate-200">{run.query}</span>
                  <span className="flex w-full items-center justify-between">
                    <StatusBadge status={run.status} />
                    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      {(run.status === "completed" || run.status === "error") && (
                        <span title="Run duration">
                          {formatDuration(run.created_at, run.updated_at)}
                        </span>
                      )}
                      {formatTime(run.created_at)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
