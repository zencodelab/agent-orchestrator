"""LangGraph wiring: a linear Planner -> Researcher -> Synthesizer pipeline.

The graph is compiled once at import time and reused across runs; per-run data
(the ``emit`` callback) is injected via ``config`` at invocation time, so a single
compiled graph is safe to share.
"""
from __future__ import annotations

from functools import lru_cache

from langgraph.graph import END, START, StateGraph

from agents.nodes import planner_node, researcher_node, synthesizer_node
from agents.state import AgentState


def build_graph():
    graph = StateGraph(AgentState)
    graph.add_node("planner", planner_node)
    graph.add_node("researcher", researcher_node)
    graph.add_node("synthesizer", synthesizer_node)

    graph.add_edge(START, "planner")
    graph.add_edge("planner", "researcher")
    graph.add_edge("researcher", "synthesizer")
    graph.add_edge("synthesizer", END)

    return graph.compile()


@lru_cache(maxsize=1)
def get_graph():
    return build_graph()


# Node order is the single source of truth for the frontend graph layout too.
PIPELINE_NODES = ["planner", "researcher", "synthesizer"]
