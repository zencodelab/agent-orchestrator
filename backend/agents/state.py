"""Shared graph state.

LangGraph merges each node's returned dict into this state. Default channel
semantics (last-write-wins) are exactly what we want here — the pipeline is
linear so there are no concurrent writers to a single key.
"""
from __future__ import annotations

from typing import Optional, TypedDict


class AgentState(TypedDict, total=False):
    query: str
    model: str
    simulate_error: Optional[str]

    plan: str
    research: str
    final_output: str
    error: Optional[str]
