import { useEffect, useState } from "react";
import { Boxes, Database, Sparkles } from "lucide-react";

import { AgentGraph } from "@/components/AgentGraph";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LogPanel } from "@/components/LogPanel";
import { RunHistory } from "@/components/RunHistory";
import { RunInput } from "@/components/RunInput";
import { useRunHistory } from "@/hooks/useRunHistory";
import { useSSEStream } from "@/hooks/useSSEStream";
import { api } from "@/lib/api";
import type { HealthResponse } from "@/lib/types";

function Header({ health }: { health: HealthResponse | null }) {
  return (
    <header className="flex items-center justify-between border-b border-border bg-card/50 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <Boxes className="h-5 w-5 text-primary" />
        <div className="leading-tight">
          <h1 className="text-sm font-bold tracking-tight">AgentForge</h1>
          <p className="text-[11px] text-muted-foreground">
            Real-time multi-agent orchestration · Planner → Researcher → Synthesizer
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        {health?.mock_mode && (
          <span className="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-300">
            <Sparkles className="h-3 w-3" />
            Mock LLM
          </span>
        )}
        {health && (
          <span className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-muted-foreground">
            <Database className="h-3 w-3" />
            {health.real_search ? "Tavily search" : "Mock search"}
          </span>
        )}
      </div>
    </header>
  );
}

export default function App() {
  useSSEStream();
  useRunHistory();

  const [health, setHealth] = useState<HealthResponse | null>(null);
  useEffect(() => {
    api.health().then(setHealth).catch(() => {});
  }, []);

  return (
    <ErrorBoundary>
      <div className="flex h-screen flex-col">
        <Header health={health} />
        <div className="flex min-h-0 flex-1">
          <RunHistory />
          <main className="flex min-w-0 flex-1 flex-col">
            <RunInput />
            <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-2 lg:grid-cols-2 lg:grid-rows-1">
              <section className="min-h-0 overflow-hidden border-b border-border lg:border-b-0 lg:border-r">
                <AgentGraph />
              </section>
              <section className="min-h-0 overflow-hidden">
                <LogPanel />
              </section>
            </div>
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}
