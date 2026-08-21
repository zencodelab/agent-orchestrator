"""Shared test fixtures.

Points the app at an isolated, throwaway SQLite file so tests never touch the
real ``agentforge.db`` used by local dev / prod, then creates and drops the
schema around every test for full isolation.
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp_db.name}"
os.environ["USE_MOCK_LLM"] = "true"

from database import engine  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402


@pytest.fixture(autouse=True)
def _clean_db():
    import models  # noqa: F401  (registers tables)

    SQLModel.metadata.create_all(engine)
    yield
    SQLModel.metadata.drop_all(engine)
