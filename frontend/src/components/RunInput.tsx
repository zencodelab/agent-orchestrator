import { useState } from "react";
import { Loader2, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { ModelId } from "@/lib/types";
import { useRunStore } from "@/store/useRunStore";

const EXAMPLES = [
  "Compare REST, GraphQL, and gRPC for a new mobile backend",
  "Explain how Server-Sent Events differ from WebSockets",
  "What are the trade-offs of vector databases for RAG?",
];

const MAX_QUERY_LENGTH = 2000;
const WARN_THRESHOLD = 0.9;

export function RunInput() {
  const query = useRunStore((s) => s.query);
  const model = useRunStore((s) => s.model);
  const runStatus = useRunStore((s) => s.runStatus);
  const setQuery = useRunStore((s) => s.setQuery);
  const setModel = useRunStore((s) => s.setModel);
  const beginRun = useRunStore((s) => s.beginRun);
  const setHistory = useRunStore((s) => s.setHistory);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRunning = runStatus === "running" || submitting;

  const isOverLimit = query.length > MAX_QUERY_LENGTH;

  async function run() {
    const q = query.trim();
    if (!q || isRunning || isOverLimit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { run_id } = await api.createRun(q, model);
      beginRun(run_id, q, model);
      api.listRuns().then(setHistory).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start run");
    } finally {
      setSubmitting(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void run();
    }
  }

  return (
    <div className="border-b border-border bg-card/40 p-4">
      <Textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Describe a goal for the agent pipeline…  (⌘/Ctrl + Enter to run)"
        className="min-h-[72px] resize-none"
        disabled={isRunning}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select
          value={model}
          onChange={(e) => setModel(e.target.value as ModelId)}
          disabled={isRunning}
          aria-label="Model"
        >
          <option value="gpt-4o-mini">gpt-4o-mini</option>
          <option value="gpt-4o">gpt-4o</option>
        </Select>

        <Button onClick={() => void run()} disabled={isRunning || !query.trim() || isOverLimit}>
          {isRunning ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running…
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Run Pipeline
            </>
          )}
        </Button>

        <div className="ml-auto hidden items-center gap-1 text-xs text-muted-foreground md:flex">
          <span>Try:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setQuery(ex)}
              disabled={isRunning}
              className="max-w-[14rem] truncate rounded-full border border-border px-2 py-0.5 hover:bg-accent disabled:opacity-50"
              title={ex}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        {error ? <p className="text-xs text-destructive">{error}</p> : <span />}
        {query.length > MAX_QUERY_LENGTH * WARN_THRESHOLD && (
          <span
            className={`text-xs ${isOverLimit ? "text-destructive" : "text-muted-foreground"}`}
            aria-live="polite"
          >
            {query.length}/{MAX_QUERY_LENGTH}
          </span>
        )}
      </div>
    </div>
  );
}
