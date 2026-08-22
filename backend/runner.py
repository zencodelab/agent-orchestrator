"""Run orchestration: start a run, drive the graph, persist + fan out events.

Decoupling ``POST /api/runs`` (which starts execution immediately) from
``GET /stream`` (which may connect later, disconnect, and reconnect) requires two
things working together:

  1. **Persistence** — every event is written to ``RunEvent`` with a monotonic
     ``seq``. A reconnecting client replays everything after its last seq.
  2. **Live fan-out** — an in-memory ``RunChannel`` pushes new events to any
     currently-connected subscribers so streaming feels real-time.

For a single-instance demo this in-memory channel is the right call. The README's
Design Decisions section notes Redis pub/sub as the multi-instance upgrade path.
"""
from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field

from sqlmodel import select

from agents.graph import get_graph
from database import get_session
from models import Run, RunEvent, RunStatus, utcnow

# Sentinel pushed onto subscriber queues to signal end-of-stream.
STREAM_DONE = object()


# --------------------------------------------------------------------------- #
# In-memory pub/sub
# --------------------------------------------------------------------------- #
@dataclass
class RunChannel:
    subscribers: set[asyncio.Queue] = field(default_factory=set)
    done: bool = False

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self.subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self.subscribers.discard(q)

    def publish(self, item) -> None:
        for q in list(self.subscribers):
            q.put_nowait(item)


class RunManager:
    def __init__(self) -> None:
        self._channels: dict[str, RunChannel] = {}
        self._tasks: set[asyncio.Task] = set()

    def get_channel(self, run_id: str) -> RunChannel | None:
        return self._channels.get(run_id)

    def open_channel(self, run_id: str) -> RunChannel:
        ch = RunChannel()
        self._channels[run_id] = ch
        return ch

    def close_channel(self, run_id: str) -> None:
        self._channels.pop(run_id, None)

    def spawn(self, coro) -> None:
        task = asyncio.create_task(coro)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)


run_manager = RunManager()


# --------------------------------------------------------------------------- #
# DB helpers (sync — always called via asyncio.to_thread from async code)
# --------------------------------------------------------------------------- #
def _create_run_row(query: str, model: str, simulate_error: str | None) -> Run:
    run = Run(
        id=uuid.uuid4().hex[:12],
        query=query,
        model=model,
        simulate_error=simulate_error,
        status=RunStatus.pending,
    )
    with get_session() as session:
        session.add(run)
        session.commit()
        session.refresh(run)
    return run


def _set_status(run_id: str, status: RunStatus) -> None:
    with get_session() as session:
        run = session.get(Run, run_id)
        if run:
            run.status = status
            run.updated_at = utcnow()
            session.add(run)
            session.commit()


def _finalize_run(run_id: str, status: RunStatus, final_output: str | None, error: str | None) -> None:
    with get_session() as session:
        run = session.get(Run, run_id)
        if run:
            run.status = status
            run.final_output = final_output
            run.error = error
            run.updated_at = utcnow()
            session.add(run)
            session.commit()


def _persist_event(run_id: str, ev: dict) -> None:
    with get_session() as session:
        session.add(
            RunEvent(
                run_id=run_id,
                seq=ev["seq"],
                type=ev["type"],
                node=ev["node"],
                content=ev.get("content", ""),
            )
        )
        session.commit()


def get_run(run_id: str) -> Run | None:
    with get_session() as session:
        return session.get(Run, run_id)


def list_runs(limit: int = 50, status: RunStatus | None = None, search: str | None = None) -> list[Run]:
    with get_session() as session:
        stmt = select(Run).order_by(Run.created_at.desc())
        if status is not None:
            stmt = stmt.where(Run.status == status)
        if search:
            stmt = stmt.where(Run.query.ilike(f"%{search}%"))
        stmt = stmt.limit(limit)
        return list(session.exec(stmt))


def get_events_after(run_id: str, after_seq: int) -> list[RunEvent]:
    with get_session() as session:
        stmt = (
            select(RunEvent)
            .where(RunEvent.run_id == run_id, RunEvent.seq > after_seq)
            .order_by(RunEvent.seq)
        )
        return list(session.exec(stmt))


def get_all_events(run_id: str) -> list[RunEvent]:
    return get_events_after(run_id, 0)


def delete_run(run_id: str) -> bool:
    """Delete a run and its events. Returns False if the run doesn't exist."""
    with get_session() as session:
        run = session.get(Run, run_id)
        if run is None:
            return False
        stmt = select(RunEvent).where(RunEvent.run_id == run_id)
        for event in session.exec(stmt):
            session.delete(event)
        session.delete(run)
        session.commit()
        return True


# --------------------------------------------------------------------------- #
# Public entry points
# --------------------------------------------------------------------------- #
async def start_run(query: str, model: str, simulate_error: str | None = None) -> Run:
    """Create the run row, open its channel, and kick off execution in the background."""
    run = await asyncio.to_thread(_create_run_row, query, model, simulate_error)
    run_manager.open_channel(run.id)
    run_manager.spawn(execute_run(run.id))
    return run


async def execute_run(run_id: str) -> None:
    channel = run_manager.get_channel(run_id) or run_manager.open_channel(run_id)
    run = await asyncio.to_thread(get_run, run_id)
    if run is None:
        return

    seq = {"n": 0}

    async def emit(ev: dict) -> None:
        seq["n"] += 1
        ev = {"seq": seq["n"], **ev}
        await asyncio.to_thread(_persist_event, run_id, ev)
        channel.publish(ev)

    await asyncio.to_thread(_set_status, run_id, RunStatus.running)

    final_output: str | None = None
    error: str | None = None
    try:
        result = await get_graph().ainvoke(
            {
                "query": run.query,
                "model": run.model,
                "simulate_error": run.simulate_error,
            },
            config={"configurable": {"emit": emit}},
        )
        final_output = result.get("final_output") or None
        error = result.get("error")
    except Exception as exc:  # noqa: BLE001 - unexpected (graph-level) failure
        error = str(exc)
        await emit({"type": "error", "node": "pipeline", "content": str(exc)})

    status = RunStatus.error if error else RunStatus.completed
    await asyncio.to_thread(_finalize_run, run_id, status, final_output, error)
    await emit({"type": "done", "node": "pipeline", "content": final_output or ""})

    channel.done = True
    channel.publish(STREAM_DONE)
