// Mirrors the backend DTOs in backend/models.py.

export type NodeId = "planner" | "researcher" | "synthesizer";
export const PIPELINE: NodeId[] = ["planner", "researcher", "synthesizer"];

export const NODE_LABELS: Record<NodeId, string> = {
  planner: "Planner",
  researcher: "Researcher",
  synthesizer: "Synthesizer",
};

export type NodeStatus = "idle" | "active" | "done" | "error";

export type RunStatus = "pending" | "running" | "completed" | "error";

export type ModelId = "gpt-4o" | "gpt-4o-mini";

export type SSEEventType =
  | "node_start"
  | "node_stream"
  | "node_end"
  | "error"
  | "done";

export interface SSEEvent {
  seq: number;
  type: SSEEventType;
  node: string; // NodeId | "pipeline"
  content: string;
}

export interface RunSummary {
  id: string;
  query: string;
  model: string;
  status: RunStatus;
  created_at: string;
  updated_at: string;
}

export interface RunDetail extends RunSummary {
  final_output: string | null;
  error: string | null;
  events: SSEEvent[];
}

export interface CreateRunResponse {
  run_id: string;
  status: RunStatus;
}

export interface HealthResponse {
  status: string;
  mock_mode: boolean;
  real_search: boolean;
}
