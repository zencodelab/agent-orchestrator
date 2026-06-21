import { create } from "zustand";

import {
  NODE_LABELS,
  PIPELINE,
  type ModelId,
  type NodeId,
  type NodeStatus,
  type RunDetail,
  type RunStatus,
  type RunSummary,
  type SSEEvent,
} from "@/lib/types";

export interface NodeRuntime {
  status: NodeStatus;
  statusMessage?: string;
  error?: string;
}

type ViewStatus = RunStatus | "idle";

interface ReducibleState {
  nodes: Record<NodeId, NodeRuntime>;
  logs: Record<NodeId, string>;
  runStatus: ViewStatus;
  finalOutput: string | null;
}

interface RunStoreState extends ReducibleState {
  // Input form
  query: string;
  model: ModelId;

  // Current run being viewed (live or historical)
  currentRunId: string | null;
  // Non-null only while a LIVE run is actively streaming (drives useSSEStream).
  streamingRunId: string | null;
  lastSeq: number;

  // History
  history: RunSummary[];

  // Actions
  setQuery: (q: string) => void;
  setModel: (m: ModelId) => void;
  beginRun: (runId: string, query: string, model: ModelId) => void;
  attachToLiveRun: (runId: string) => void;
  applyEvent: (runId: string, ev: SSEEvent) => void;
  finishStreaming: () => void;
  loadCompletedRun: (detail: RunDetail) => void;
  reset: () => void;
  setHistory: (h: RunSummary[]) => void;
}

const isNodeId = (n: string): n is NodeId => (PIPELINE as string[]).includes(n);

const idleNodes = (): Record<NodeId, NodeRuntime> => ({
  planner: { status: "idle" },
  researcher: { status: "idle" },
  synthesizer: { status: "idle" },
});

const emptyLogs = (): Record<NodeId, string> => ({
  planner: "",
  researcher: "",
  synthesizer: "",
});

/**
 * Pure reducer: apply one event to the reducible slice. Used both for live
 * events and for folding a stored run's event log on replay.
 */
function reduce(state: ReducibleState, ev: SSEEvent): ReducibleState {
  const nodes = { ...state.nodes };
  const logs = { ...state.logs };
  let runStatus = state.runStatus;
  let finalOutput = state.finalOutput;

  switch (ev.type) {
    case "node_start":
      if (isNodeId(ev.node)) nodes[ev.node] = { status: "active", statusMessage: ev.content };
      runStatus = "running";
      break;
    case "node_stream":
      if (isNodeId(ev.node)) {
        if (nodes[ev.node].status === "idle") {
          nodes[ev.node] = { ...nodes[ev.node], status: "active" };
        }
        logs[ev.node] = (logs[ev.node] ?? "") + ev.content;
      }
      break;
    case "node_end":
      if (isNodeId(ev.node)) {
        nodes[ev.node] = { ...nodes[ev.node], status: "done", statusMessage: undefined };
      }
      break;
    case "error":
      if (isNodeId(ev.node)) nodes[ev.node] = { status: "error", error: ev.content };
      else runStatus = "error";
      break;
    case "done": {
      const anyError = Object.values(nodes).some((n) => n.status === "error");
      runStatus = anyError ? "error" : "completed";
      if (ev.content) finalOutput = ev.content;
      break;
    }
  }

  return { nodes, logs, runStatus, finalOutput };
}

export const useRunStore = create<RunStoreState>((set, get) => ({
  nodes: idleNodes(),
  logs: emptyLogs(),
  runStatus: "idle",
  finalOutput: null,

  query: "",
  model: "gpt-4o-mini",

  currentRunId: null,
  streamingRunId: null,
  lastSeq: 0,

  history: [],

  setQuery: (q) => set({ query: q }),
  setModel: (m) => set({ model: m }),

  beginRun: (runId, query, model) =>
    set({
      currentRunId: runId,
      streamingRunId: runId,
      runStatus: "running",
      nodes: idleNodes(),
      logs: emptyLogs(),
      finalOutput: null,
      lastSeq: 0,
      query,
      model,
    }),

  attachToLiveRun: (runId) =>
    set({
      currentRunId: runId,
      streamingRunId: runId,
      runStatus: "running",
      nodes: idleNodes(),
      logs: emptyLogs(),
      finalOutput: null,
      lastSeq: 0,
    }),

  applyEvent: (runId, ev) => {
    const s = get();
    if (runId !== s.currentRunId) return; // event for a run we're no longer viewing
    if (ev.seq <= s.lastSeq) return; // duplicate (e.g. replay overlap on reconnect)
    const next = reduce(s, ev);
    set({ ...next, lastSeq: ev.seq });
  },

  finishStreaming: () => set({ streamingRunId: null }),

  loadCompletedRun: (detail) => {
    let acc: ReducibleState = {
      nodes: idleNodes(),
      logs: emptyLogs(),
      runStatus: "running",
      finalOutput: null,
    };
    for (const ev of detail.events) acc = reduce(acc, ev);
    const lastSeq = detail.events.length ? detail.events[detail.events.length - 1].seq : 0;
    set({
      ...acc,
      runStatus: detail.status,
      finalOutput: detail.final_output ?? acc.finalOutput,
      currentRunId: detail.id,
      streamingRunId: null,
      lastSeq,
      query: detail.query,
      model: (detail.model as ModelId) ?? "gpt-4o-mini",
    });
  },

  reset: () =>
    set({
      currentRunId: null,
      streamingRunId: null,
      runStatus: "idle",
      nodes: idleNodes(),
      logs: emptyLogs(),
      finalOutput: null,
      lastSeq: 0,
    }),

  setHistory: (h) => set({ history: h }),
}));

export { NODE_LABELS };
