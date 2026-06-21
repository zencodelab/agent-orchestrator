import type {
  CreateRunResponse,
  HealthResponse,
  ModelId,
  RunDetail,
  RunSummary,
} from "./types";

// Empty base => same-origin relative URLs (dev proxy / nginx handle routing).
const BASE = import.meta.env.VITE_API_BASE ?? "";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health(): Promise<HealthResponse> {
    return fetch(`${BASE}/api/health`).then((r) => json<HealthResponse>(r));
  },

  createRun(query: string, model: ModelId): Promise<CreateRunResponse> {
    return fetch(`${BASE}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, model }),
    }).then((r) => json<CreateRunResponse>(r));
  },

  listRuns(): Promise<RunSummary[]> {
    return fetch(`${BASE}/api/runs`).then((r) => json<RunSummary[]>(r));
  },

  getRun(id: string): Promise<RunDetail> {
    return fetch(`${BASE}/api/runs/${id}`).then((r) => json<RunDetail>(r));
  },

  streamUrl(id: string, lastSeq: number): string {
    return `${BASE}/api/runs/${id}/stream?last_event_id=${lastSeq}`;
  },
};
