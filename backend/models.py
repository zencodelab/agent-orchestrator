"""SQLModel tables + API DTOs.

Two persisted tables:
  * ``Run``      — one row per pipeline execution.
  * ``RunEvent`` — append-only log of every SSE event, keyed by (run_id, seq).

Persisting events lets the SSE endpoint *replay* a run from any point, which is
what powers both reconnection and the "view past run" feature.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class RunStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    error = "error"


# --------------------------------------------------------------------------- #
# Tables
# --------------------------------------------------------------------------- #
class Run(SQLModel, table=True):
    id: str = Field(primary_key=True)
    query: str
    model: str
    status: RunStatus = Field(default=RunStatus.pending)
    final_output: Optional[str] = None
    error: Optional[str] = None
    # Optional demo hook: name of a node to fail on purpose ("planner" | ...).
    simulate_error: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class RunEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: str = Field(index=True, foreign_key="run.id")
    seq: int = Field(index=True)  # monotonic per run; used as the SSE event id
    type: str  # node_start | node_stream | node_end | error | done
    node: str
    content: str = ""
    created_at: datetime = Field(default_factory=utcnow)


# --------------------------------------------------------------------------- #
# API DTOs
# --------------------------------------------------------------------------- #
# Kept in sync with the frontend's RunInput character counter/cap.
MAX_QUERY_LENGTH = 2000


class CreateRunRequest(BaseModel):
    query: str = Field(max_length=MAX_QUERY_LENGTH)
    model: str = "gpt-4o-mini"
    # Only used for demoing the error path; the UI never sets it.
    simulate_error: Optional[str] = None


class CreateRunResponse(BaseModel):
    run_id: str
    status: str


class EventOut(BaseModel):
    seq: int
    type: str
    node: str
    content: str


class RunSummary(BaseModel):
    id: str
    query: str
    model: str
    status: str
    created_at: datetime
    updated_at: datetime


class RunDetail(RunSummary):
    final_output: Optional[str] = None
    error: Optional[str] = None
    events: list[EventOut] = []
