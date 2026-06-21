"""SQLite engine + session helpers.

The engine uses ``check_same_thread=False`` because writes happen from worker
threads (see ``runner._persist_*`` wrapped in ``asyncio.to_thread``) to avoid
blocking the event loop while the SSE stream is open.
"""
from __future__ import annotations

from sqlmodel import Session, SQLModel, create_engine

from config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False},
)


def init_db() -> None:
    # Import models so SQLModel registers the tables before create_all.
    import models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session() -> Session:
    return Session(engine)
