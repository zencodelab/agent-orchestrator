"""The three agent nodes.

Each node receives the LangGraph ``config`` and pulls an ``emit`` coroutine out of
``config["configurable"]``. ``emit`` both persists the event and fans it out to any
connected SSE subscribers — see ``runner.execute_run``.

Errors are caught *inside* each node: the node emits an ``error`` event and returns
partial state so the graph continues. That's what lets a failed agent turn red while
the rest of the pipeline still completes.
"""
from __future__ import annotations

from typing import Any, Awaitable, Callable

from langchain_core.runnables import RunnableConfig

from agents.llm import get_llm_client
from agents.prompts import PLANNER_SYSTEM, RESEARCHER_SYSTEM, SYNTHESIZER_SYSTEM
from agents.state import AgentState
from agents.tools import web_search

EmitFn = Callable[[dict], Awaitable[None]]


def _emitter(config: dict) -> EmitFn:
    return config["configurable"]["emit"]


async def _emit(config: dict, type: str, node: str, content: str = "") -> None:
    await _emitter(config)({"type": type, "node": node, "content": content})


def _maybe_fail(state: AgentState, node: str) -> None:
    if state.get("simulate_error") == node:
        raise RuntimeError(f"Simulated failure in '{node}' agent")


# --------------------------------------------------------------------------- #
# Planner
# --------------------------------------------------------------------------- #
async def planner_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    node = "planner"
    await _emit(config, "node_start", node, "Breaking the goal into a plan…")
    try:
        _maybe_fail(state, node)
        llm = get_llm_client(state["model"])
        chunks: list[str] = []
        async for tok in llm.astream_text(
            PLANNER_SYSTEM, f"User goal: {state['query']}", role="planner"
        ):
            chunks.append(tok)
            await _emit(config, "node_stream", node, tok)
        plan = "".join(chunks).strip()
        await _emit(config, "node_end", node, plan)
        return {"plan": plan}
    except Exception as exc:  # noqa: BLE001 - surfaced to the UI
        await _emit(config, "error", node, str(exc))
        return {"plan": "", "error": f"{node}: {exc}"}


# --------------------------------------------------------------------------- #
# Researcher
# --------------------------------------------------------------------------- #
async def researcher_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    node = "researcher"
    await _emit(config, "node_start", node, "Researching the plan…")
    try:
        _maybe_fail(state, node)
        queries = _derive_queries(state.get("plan", ""), state["query"])
        findings: list[str] = []
        for q in queries:
            # Tool-call events are surfaced as node_stream lines (prefixed with the
            # tool glyph) so the UI can render them distinctly without a new event type.
            await _emit(config, "node_stream", node, f'🔧 web_search("{q}")\n')
            results = await web_search(q)
            for r in results:
                await _emit(config, "node_stream", node, f"   ↳ {r['title']} — {r['url']}\n")
                findings.append(f"{r['title']}: {r['content']}")

        await _emit(config, "node_stream", node, "\n📝 Summarizing findings…\n\n")
        llm = get_llm_client(state["model"])
        notes = (
            f"Plan:\n{state.get('plan', '(none)')}\n\n"
            f"Raw findings:\n" + "\n".join(findings)
        )
        chunks: list[str] = []
        async for tok in llm.astream_text(RESEARCHER_SYSTEM, notes, role="researcher"):
            chunks.append(tok)
            await _emit(config, "node_stream", node, tok)
        research = "".join(chunks).strip()
        await _emit(config, "node_end", node, research)
        return {"research": research}
    except Exception as exc:  # noqa: BLE001
        await _emit(config, "error", node, str(exc))
        return {"research": "", "error": f"{node}: {exc}"}


# --------------------------------------------------------------------------- #
# Synthesizer
# --------------------------------------------------------------------------- #
async def synthesizer_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    node = "synthesizer"
    await _emit(config, "node_start", node, "Writing the final answer…")
    try:
        _maybe_fail(state, node)
        llm = get_llm_client(state["model"])
        user = (
            f"User goal: {state['query']}\n\n"
            f"Plan:\n{state.get('plan', '(none)')}\n\n"
            f"Research brief:\n{state.get('research', '(none)')}"
        )
        chunks: list[str] = []
        async for tok in llm.astream_text(SYNTHESIZER_SYSTEM, user, role="synthesizer"):
            chunks.append(tok)
            await _emit(config, "node_stream", node, tok)
        final = "".join(chunks).strip()
        await _emit(config, "node_end", node, final)
        return {"final_output": final}
    except Exception as exc:  # noqa: BLE001
        await _emit(config, "error", node, str(exc))
        return {"final_output": "", "error": f"{node}: {exc}"}


def _derive_queries(plan: str, fallback: str) -> list[str]:
    """Turn the plan's bullet lines into 1-3 search queries."""
    lines = [
        ln.strip(" -•\t")
        for ln in plan.splitlines()
        if ln.strip().startswith(("-", "•", "*"))
    ]
    queries = [ln for ln in lines if len(ln) > 8][:3]
    return queries or [fallback]
