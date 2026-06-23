/**
 * Client-side demo backend.
 *
 * When the app is built with VITE_DEMO_MODE=true (e.g. for the GitHub Pages
 * deploy), there is no FastAPI server. This module reproduces the backend's
 * behaviour entirely in the browser:
 *   - the same deterministic Planner -> Researcher -> Synthesizer event stream,
 *   - localStorage persistence so history + replay + refresh-safety still work.
 *
 * The real `api`/`useSSEStream` delegate here when `DEMO` is true; otherwise
 * they hit the network exactly as before.
 */
import type {
  CreateRunResponse,
  HealthResponse,
  ModelId,
  RunDetail,
  RunStatus,
  RunSummary,
  SSEEvent,
} from "./types";

export const DEMO = import.meta.env.VITE_DEMO_MODE === "true";

const STORAGE_KEY = "agentforge.demo.runs.v1";
const DEMO_TOKEN_MS = 22; // per-token delay during the visual replay
const DEMO_STEP_MS = 140; // pause between structural events

interface StoredRun extends RunDetail {}

// --------------------------------------------------------------------------- //
// localStorage persistence
// --------------------------------------------------------------------------- //
function loadAll(): StoredRun[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredRun[]) : [];
  } catch {
    return [];
  }
}

function saveAll(runs: StoredRun[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  } catch {
    /* quota / unavailable — degrade to in-memory for this session */
  }
}

function loadRun(id: string): StoredRun | undefined {
  return loadAll().find((r) => r.id === id);
}

// --------------------------------------------------------------------------- //
// Deterministic mock content (mirrors backend/agents/llm.py + tools.py)
// --------------------------------------------------------------------------- //
function tokenize(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text];
}

function plannerText(topic: string): string {
  return [
    `- Clarify the core question behind "${topic}" and define what a strong answer looks like.`,
    "- Gather current, authoritative sources and recent developments.",
    "- Compare the main approaches and their trade-offs.",
    "- Identify concrete recommendations and any open risks.",
    "- Distill everything into a clear, actionable summary.",
  ].join("\n");
}

function researcherText(topic: string): string {
  return (
    `Across the gathered sources on ${topic}, a few consistent themes emerge. ` +
    "The most credible references agree on the fundamentals while highlighting " +
    "practical trade-offs to weigh, and several note recent changes worth tracking.\n\n" +
    "- Fundamentals are well established and broadly agreed upon.\n" +
    "- Key trade-offs center on cost, complexity, and time-to-value.\n" +
    "- Recent developments meaningfully affect new projects."
  );
}

function synthText(topic: string): string {
  return [
    "## Summary",
    "",
    `Here is a concise synthesis addressing **${topic}**.`,
    "",
    "### Key points",
    "1. The fundamentals are well established and broadly agreed upon.",
    "2. The main trade-offs come down to cost, complexity, and time-to-value.",
    "3. Recent developments make a measurable difference for new projects.",
    "",
    "### Recommendation",
    "Start with the simplest approach that satisfies the core requirement, then iterate. " +
      "Validate against the sources above before committing to a direction.",
    "",
    "> _Client-side demo mode (no backend). Clone the repo and run the FastAPI backend to stream live GPT-4o output._",
  ].join("\n");
}

function mockSearch(query: string): { title: string; url: string; content: string }[] {
  const base = query.trim().replace(/[?.]+$/, "").slice(0, 60) || "the topic";
  const slug = base.toLowerCase().split(/\s+/).join("-").slice(0, 40);
  const templates: [string, string, string][] = [
    ["Overview: {q}", "example.com/overview/{s}", "A broad introduction to {q}, covering core concepts and common use cases."],
    ["{q} — best practices in 2026", "devnotes.io/{s}", "Practical guidance and trade-offs when working with {q}, with recent updates."],
    ["Comparing approaches to {q}", "compare.dev/{s}", "A side-by-side look at the leading approaches to {q} and when to pick each."],
  ];
  return templates.map(([t, u, c]) => ({
    title: t.replace("{q}", base),
    url: "https://" + u.replace("{s}", slug),
    content: c.replace(/\{q\}/g, base),
  }));
}

function deriveQueries(plan: string, fallback: string): string[] {
  const lines = plan
    .split("\n")
    .map((l) => l.replace(/^[\s\-•*]+/, "").trim())
    .filter((l) => l.length > 8);
  return lines.length ? lines.slice(0, 2) : [fallback];
}

function buildEvents(query: string): { events: SSEEvent[]; finalOutput: string } {
  const topic = query.slice(0, 120);
  const events: SSEEvent[] = [];
  let seq = 0;
  const push = (type: SSEEvent["type"], node: string, content = "") =>
    events.push({ seq: ++seq, type, node, content });

  // Planner
  push("node_start", "planner", "Breaking the goal into a plan…");
  const plan = plannerText(topic);
  for (const tok of tokenize(plan)) push("node_stream", "planner", tok);
  push("node_end", "planner", plan);

  // Researcher (with tool-call events)
  push("node_start", "researcher", "Researching the plan…");
  for (const q of deriveQueries(plan, topic)) {
    push("node_stream", "researcher", `🔧 web_search("${q}")\n`);
    for (const r of mockSearch(q)) {
      push("node_stream", "researcher", `   ↳ ${r.title} — ${r.url}\n`);
    }
  }
  push("node_stream", "researcher", "\n📝 Summarizing findings…\n\n");
  const research = researcherText(topic);
  for (const tok of tokenize(research)) push("node_stream", "researcher", tok);
  push("node_end", "researcher", research);

  // Synthesizer
  push("node_start", "synthesizer", "Writing the final answer…");
  const final = synthText(topic);
  for (const tok of tokenize(final)) push("node_stream", "synthesizer", tok);
  push("node_end", "synthesizer", final);

  push("done", "pipeline", final);
  return { events, finalOutput: final };
}

// --------------------------------------------------------------------------- //
// Public API (matches the real `api` surface)
// --------------------------------------------------------------------------- //
function summarize(r: StoredRun): RunSummary {
  return {
    id: r.id,
    query: r.query,
    model: r.model,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function demoHealth(): Promise<HealthResponse> {
  return { status: "ok", mock_mode: true, real_search: false };
}

export async function demoCreateRun(query: string, model: ModelId): Promise<CreateRunResponse> {
  const id = `demo-${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`;
  const now = new Date().toISOString();
  const { events, finalOutput } = buildEvents(query.trim());
  // Persist the completed run immediately so a mid-stream refresh is safe.
  const run: StoredRun = {
    id,
    query: query.trim(),
    model,
    status: "completed",
    final_output: finalOutput,
    error: null,
    created_at: now,
    updated_at: now,
    events,
  };
  saveAll([run, ...loadAll()].slice(0, 50));
  // Report "running" so the UI animates the stream; the visual completes via SSE.
  return { run_id: id, status: "running" as RunStatus };
}

export async function demoListRuns(): Promise<RunSummary[]> {
  return loadAll()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map(summarize);
}

export async function demoGetRun(id: string): Promise<RunDetail> {
  const run = loadRun(id);
  if (!run) throw new Error("run not found");
  return run;
}

/**
 * Replays a stored run's events with delays to recreate the live streaming feel.
 * Mirrors the real SSE hook's contract: returns a cancel function.
 */
export function demoStreamRun(
  runId: string,
  opts: { getLastSeq: () => number; onEvent: (ev: SSEEvent) => void; onDone: () => void },
): () => void {
  let cancelled = false;
  const timers: number[] = [];
  const run = loadRun(runId);
  if (!run) {
    opts.onDone();
    return () => {};
  }
  const lastSeq = opts.getLastSeq();
  let delay = 0;
  for (const ev of run.events) {
    if (ev.seq <= lastSeq) continue;
    delay += ev.type === "node_stream" ? DEMO_TOKEN_MS : DEMO_STEP_MS;
    const handle = window.setTimeout(() => {
      if (cancelled) return;
      opts.onEvent(ev);
      if (ev.type === "done") opts.onDone();
    }, delay);
    timers.push(handle);
  }
  return () => {
    cancelled = true;
    for (const t of timers) clearTimeout(t);
  };
}
