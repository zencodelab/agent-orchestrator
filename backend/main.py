"""AgentForge FastAPI application: run lifecycle + SSE streaming.

Endpoints
  POST /api/runs                 -> start a run, returns {run_id, status}
  GET  /api/runs                 -> list past runs (newest first)
  GET  /api/runs/{id}            -> full detail (all events + final output)
  GET  /api/runs/{id}/stream     -> SSE stream of execution events
"""
from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

import runner
from config import get_settings
from database import init_db
from models import (
    CreateRunRequest,
    CreateRunResponse,
    EventOut,
    RunDetail,
    RunStatus,
    RunSummary,
)

logger = logging.getLogger("agentforge")

settings = get_settings()

# Heartbeat interval for idle SSE connections (seconds). Also bounds how quickly
# we notice a finished run whose end-sentinel we may have missed on (re)connect.
KEEPALIVE_SECS = 12


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="AgentForge", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch anything that escapes route handlers so clients always get JSON, not a bare 500 HTML page."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "internal server error"})


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "mock_mode": settings.mock_mode, "real_search": settings.use_real_search}


# --------------------------------------------------------------------------- #
# Run lifecycle
# --------------------------------------------------------------------------- #
@app.post("/api/runs", response_model=CreateRunResponse)
async def create_run(body: CreateRunRequest) -> CreateRunResponse:
    query = body.query.strip()
    if not query:
        raise HTTPException(status_code=422, detail="query must not be empty")
    model = body.model or settings.default_model
    run = await runner.start_run(query, model, body.simulate_error)
    return CreateRunResponse(run_id=run.id, status=run.status.value)


@app.get("/api/runs", response_model=list[RunSummary])
async def list_runs() -> list[RunSummary]:
    runs = await asyncio.to_thread(runner.list_runs)
    return [
        RunSummary(
            id=r.id,
            query=r.query,
            model=r.model,
            status=r.status.value,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in runs
    ]


@app.get("/api/runs/{run_id}", response_model=RunDetail)
async def get_run(run_id: str) -> RunDetail:
    run = await asyncio.to_thread(runner.get_run, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")
    events = await asyncio.to_thread(runner.get_all_events, run_id)
    return RunDetail(
        id=run.id,
        query=run.query,
        model=run.model,
        status=run.status.value,
        created_at=run.created_at,
        updated_at=run.updated_at,
        final_output=run.final_output,
        error=run.error,
        events=[EventOut(seq=e.seq, type=e.type, node=e.node, content=e.content) for e in events],
    )


# --------------------------------------------------------------------------- #
# SSE stream
# --------------------------------------------------------------------------- #
def _sse(ev: dict) -> str:
    """Format one event in the SSE wire protocol. `id:` enables resume-after."""
    return f"id: {ev['seq']}\ndata: {json.dumps(ev)}\n\n"


@app.get("/api/runs/{run_id}/stream")
async def stream_run(run_id: str, request: Request, last_event_id: int = 0):
    run = await asyncio.to_thread(runner.get_run, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")

    async def event_gen():
        channel = runner.run_manager.get_channel(run_id)

        # Case 1: run already finished (or never had a live channel) -> replay only.
        if channel is None or channel.done:
            for e in await asyncio.to_thread(runner.get_events_after, run_id, last_event_id):
                yield _sse({"seq": e.seq, "type": e.type, "node": e.node, "content": e.content})
            yield ": end\n\n"
            return

        # Case 2: live run. Subscribe FIRST so no event slips through the gap
        # between reading persisted history and going live; dedupe by seq.
        q = channel.subscribe()
        sent = last_event_id
        try:
            for e in await asyncio.to_thread(runner.get_events_after, run_id, last_event_id):
                if e.seq > sent:
                    yield _sse({"seq": e.seq, "type": e.type, "node": e.node, "content": e.content})
                    sent = e.seq

            while True:
                if await request.is_disconnected():
                    break
                try:
                    item = await asyncio.wait_for(q.get(), timeout=KEEPALIVE_SECS)
                except asyncio.TimeoutError:
                    # Idle: keep the connection warm, and make sure we didn't miss
                    # the end of an already-finished run.
                    fresh = await asyncio.to_thread(runner.get_run, run_id)
                    if fresh and fresh.status in (RunStatus.completed, RunStatus.error):
                        for e in await asyncio.to_thread(runner.get_events_after, run_id, sent):
                            yield _sse({"seq": e.seq, "type": e.type, "node": e.node, "content": e.content})
                        break
                    yield ": keepalive\n\n"
                    continue

                if item is runner.STREAM_DONE:
                    break
                if item["seq"] <= sent:
                    continue
                yield _sse(item)
                sent = item["seq"]
        finally:
            channel.unsubscribe(q)

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",  # disable proxy buffering (nginx) for SSE
    }
    return StreamingResponse(event_gen(), media_type="text/event-stream", headers=headers)
