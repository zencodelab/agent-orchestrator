# AgentForge

> Real-time multi-agent orchestration platform — watch a **Planner → Researcher → Synthesizer** pipeline execute live, token by token, on an observable agent graph.

AgentForge runs a [LangGraph](https://langchain-ai.github.io/langgraph/) pipeline on a FastAPI backend and streams every step to a React UI over **Server-Sent Events**. The graph nodes light up as each agent runs (grey → blue → green/red), each agent's output streams into a live log, and every run is persisted so you can refresh, reconnect, or replay it later.

It runs **fully offline with no API keys** thanks to a deterministic mock LLM, so you can demo the entire streaming architecture in one command.

**▶️ Live demo:** **https://zencodelab.github.io/agent-orchestrator/** — a static GitHub Pages build that runs the full UI with an in-browser mock backend (no server). Runs are simulated and persisted to `localStorage`, so streaming, history, and replay all work standalone. For real GPT-4o output, run the FastAPI backend locally (see below). The site is published from the `gh-pages` branch — re-deploy after changes with `./scripts/deploy-pages.sh`.

---

## Highlights

- **Token-by-token streaming** end to end — LLM tokens are emitted as SSE events the instant they're produced, not after the full response.
- **Observable execution graph** — React Flow nodes transition idle → active (pulsing) → done/error; edges animate during handoffs.
- **Resumable streams** — events are persisted with a monotonic sequence id; the client reconnects with `last_event_id` and the server replays only what was missed. Refreshing the page never loses a run.
- **Resilient agents** — a failing agent turns red with its error shown inline, while the rest of the pipeline still completes.
- **Tool calls in the stream** — the Researcher's `web_search` calls (Tavily, or mocked) surface as distinct events.
- **Zero-config demo** — no `OPENAI_API_KEY`? It transparently falls back to a deterministic mock so everything still streams.

---

## Architecture

```
┌──────────────────────────── Browser (React + TS) ────────────────────────────┐
│                                                                               │
│   RunInput ──POST /api/runs──┐         Zustand store ◀── useSSEStream         │
│                              │            ▲   │            (fetch + resume)   │
│   AgentGraph (React Flow) ◀──┘            │   │                  ▲            │
│   LogPanel  (live tokens)  ◀──────────────┘   └──▶ RunHistory    │ SSE events │
│                                                                  │            │
└──────────────────────────────────────────────────────────────┼─────────────┘
              │ POST /api/runs                 GET /api/runs/{id}/stream
              ▼                                                  │
┌──────────────────────────── FastAPI backend ──────────────────┼─────────────┐
│                                                                │             │
│   RunManager  ── in-memory pub/sub channel ──── fan-out ───────┘             │
│       ▲                                                                       │
│       │  emit(event):  assign seq → persist → publish                        │
│       │                                                                       │
│   LangGraph:   Planner ──▶ Researcher ──▶ Synthesizer                        │
│                   │            │  web_search()  (Tavily API │ mock)           │
│                   ▼            ▼            ▼                                  │
│             SQLite via SQLModel:   Run,  RunEvent(seq)  ◀── replay source     │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────┘
```

**Event contract** (one JSON object per SSE frame, `id:` = `seq`):

```jsonc
{ "seq": 12, "type": "node_start" | "node_stream" | "node_end" | "error" | "done",
  "node": "planner" | "researcher" | "synthesizer" | "pipeline", "content": "…" }
```

---

## Tech stack

| Layer    | Tech |
|----------|------|
| Frontend | React 18, TypeScript, Vite, React Flow, Zustand, Tailwind CSS, shadcn-style UI, react-markdown |
| Backend  | FastAPI, LangGraph, langchain-openai, SQLModel (SQLite), SSE via `StreamingResponse` |
| Dev/Ops  | Docker Compose (frontend + backend + optional Redis) |

---

## Quick start

### Option A — Docker (one command)

```bash
docker compose up --build
# Frontend → http://localhost:5173
# Backend  → http://localhost:8000  (docs at /docs)
```

No keys needed — it boots in mock mode. To use real models, drop them in `backend/.env` first (see below).

### Option B — Run locally

**Backend** (Python 3.11 recommended):

```bash
cd backend
python3.11 -m venv .venv && source .venv/bin/activate   # or: uv venv --python 3.11 .venv
pip install -r requirements.txt                          # or: uv pip install -r requirements.txt
cp .env.example .env                                     # optional — add keys
uvicorn main:app --reload --port 8000
```

**Frontend** (Node 18+):

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173 (proxies /api → http://localhost:8000)
```

---

## Configuration

All config is via `backend/.env` (see `backend/.env.example`). Everything is optional:

| Variable | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | — | Live GPT-4o / GPT-4o-mini. **Unset → deterministic mock LLM.** |
| `TAVILY_API_KEY` | — | Real web search for the Researcher. Unset → mock results. |
| `USE_MOCK_LLM` | `false` | Force mock mode even with a key set. |
| `DEFAULT_MODEL` | `gpt-4o-mini` | Fallback model. |
| `MOCK_TOKEN_DELAY_MS` | `20` | Per-token delay for the mock stream (raise it to make streaming more visible in demos). |
| `DATABASE_URL` | `sqlite:///./agentforge.db` | SQLModel connection string. |
| `CORS_ORIGINS` | localhost:5173,… | Comma-separated allowed origins. |

The frontend talks to `/api` on its own origin by default (dev proxy in `vite.config.ts`, nginx proxy in Docker). Override with `VITE_API_BASE` only if the backend lives elsewhere.

---

## API reference

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/runs` | Start a run. Body: `{ query, model, simulate_error? }`. Returns `{ run_id, status }`. |
| `GET`  | `/api/runs/{id}/stream?last_event_id=N` | SSE stream; replays events after `N`, then streams live. |
| `GET`  | `/api/runs` | List past runs (newest first). |
| `GET`  | `/api/runs/{id}` | Full run detail: all events + final output. |
| `GET`  | `/api/health` | Status + whether mock LLM / real search are active. |

```bash
# Try it from the shell (mock mode):
RID=$(curl -s -X POST localhost:8000/api/runs -H 'Content-Type: application/json' \
      -d '{"query":"Explain SSE vs WebSockets","model":"gpt-4o-mini"}' | jq -r .run_id)
curl -N "localhost:8000/api/runs/$RID/stream?last_event_id=0"
```

### Demoing the error path

`simulate_error` deliberately fails one node (the UI never sets it — it's for testing the resilience path):

```bash
curl -s -X POST localhost:8000/api/runs -H 'Content-Type: application/json' \
  -d '{"query":"demo error","model":"gpt-4o","simulate_error":"researcher"}'
```

The Researcher turns red with its error inline; Planner and Synthesizer still complete; the run is saved with status `error`.

---

## Design decisions

### Why SSE over WebSockets?
The data flow is **one-directional**: the server streams execution events, the client only listens. SSE fits this exactly and is dramatically simpler operationally — it's plain HTTP, so it works through standard proxies/load balancers, needs no upgrade handshake, and supports resumption natively via the `Last-Event-ID` mechanism (which this app uses for reconnection). WebSockets would add bidirectional machinery, heartbeats, and reconnection logic we don't need. The one SSE caveat (HTTP/1.1's 6-connections-per-domain limit) is irrelevant here — one stream per active run.

### Why LangGraph?
The pipeline is a small **state machine** (Planner → Researcher → Synthesizer with a shared state object), which is precisely LangGraph's model. It gives explicit, inspectable nodes/edges (mirrored 1:1 in the UI graph), a typed shared state, and per-node `config` injection — which is how the `emit` callback reaches each node without threading it through every function. It also leaves a clean path to conditional edges/loops (e.g. a reflector that re-plans) without restructuring. A hand-rolled `async` chain would work for three steps but wouldn't scale to branching.

### Why React Flow?
The product *is* the graph — nodes and edges are the core UX, not decoration. React Flow handles the node/edge rendering, layout, panning/zoom, and custom node components, so the effort goes into the agent-status visuals instead of SVG plumbing. Node state is derived from the Zustand store, so React Flow stays a pure view of run state.

### Streaming & persistence architecture
`POST /api/runs` starts execution **immediately** in a background task; the SSE connection is separate and may attach late, drop, and reconnect. To make that robust, every event is (1) persisted to `RunEvent` with a monotonic `seq` and (2) published to an in-memory channel. A connecting client subscribes **first**, then replays persisted history, deduping by `seq` — so nothing is lost in the gap and nothing is doubled. Reconnects pass `last_event_id`, so the server replays only the tail. This same persisted log powers refresh-safety and the "replay a past run" feature.

### Where this would go to scale
The in-memory pub/sub is single-instance by design (right call for v1). The documented next step is **Redis pub/sub** (the optional `--profile scale` service): publish events to Redis so any backend instance can serve any run's stream, and move run metadata to Postgres. The event-sourced `RunEvent` log already makes the system horizontally scalable without changing the client.

---

## Project structure

```
agent-orchestrator/
├── backend/
│   ├── main.py            # FastAPI app, CORS, routes, SSE endpoint
│   ├── runner.py          # RunManager (pub/sub), execution loop, persistence
│   ├── models.py          # SQLModel tables (Run, RunEvent) + API DTOs
│   ├── database.py        # SQLite engine / session
│   ├── config.py          # env-driven settings
│   └── agents/
│       ├── graph.py       # LangGraph wiring
│       ├── nodes.py       # planner / researcher / synthesizer
│       ├── llm.py         # LLM abstraction + deterministic mock
│       ├── tools.py       # web_search (Tavily | mock)
│       ├── prompts.py     # system prompts
│       └── state.py       # shared graph state
├── frontend/
│   └── src/
│       ├── components/    # AgentGraph, LogPanel, RunHistory, RunInput, ErrorBoundary, ui/
│       ├── store/         # Zustand store (single reducer for live + replay)
│       ├── hooks/         # useSSEStream (resume/backoff), useRunHistory
│       ├── lib/           # api client, types, utils
│       └── App.tsx
└── docker-compose.yml
```

---

## Non-goals (v1)

No auth / multi-user, no custom agent-builder UI, no real-time collaboration. The agent prompts are intentionally minimal — the focus is the streaming/observability architecture and execution flow, not prompt sophistication.
