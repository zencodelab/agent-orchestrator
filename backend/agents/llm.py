"""LLM abstraction with a deterministic mock fallback.

Nodes depend only on ``LLMClient.astream_text`` (an async token iterator), so the
rest of the pipeline is identical whether we're hitting OpenAI or the mock. This
is what lets the whole app be demoed offline with no API key.
"""
from __future__ import annotations

import asyncio
import re
from functools import lru_cache
from typing import AsyncIterator

from config import get_settings


class LLMClient:
    async def astream_text(
        self, system: str, user: str, *, role: str = "generic"
    ) -> AsyncIterator[str]:  # pragma: no cover - interface
        raise NotImplementedError
        yield  # pragma: no cover


class OpenAILLM(LLMClient):
    """Streams tokens from OpenAI via langchain-openai."""

    def __init__(self, model: str) -> None:
        from langchain_openai import ChatOpenAI

        settings = get_settings()
        self._llm = ChatOpenAI(
            model=model,
            api_key=settings.openai_api_key,
            temperature=0.3,
            streaming=True,
        )

    async def astream_text(self, system: str, user: str, *, role: str = "generic") -> AsyncIterator[str]:
        from langchain_core.messages import HumanMessage, SystemMessage

        messages = [SystemMessage(content=system), HumanMessage(content=user)]
        async for chunk in self._llm.astream(messages):
            text = chunk.content
            if isinstance(text, str) and text:
                yield text


class MockLLM(LLMClient):
    """Deterministic, role-aware token stream — no network required."""

    def __init__(self, model: str) -> None:
        self.model = model

    async def astream_text(self, system: str, user: str, *, role: str = "generic") -> AsyncIterator[str]:
        delay = get_settings().mock_token_delay_ms / 1000
        text = _mock_for_role(role, _extract_topic(user))
        for token in _tokenize(text):
            await asyncio.sleep(delay)  # make streaming visible in the UI
            yield token


@lru_cache(maxsize=8)
def get_llm_client(model: str) -> LLMClient:
    settings = get_settings()
    if settings.mock_mode:
        return MockLLM(model)
    return OpenAILLM(model)


# --------------------------------------------------------------------------- #
# Mock helpers
# --------------------------------------------------------------------------- #
def _tokenize(text: str) -> list[str]:
    """Split into word+trailing-whitespace tokens so the stream reads naturally."""
    return re.findall(r"\S+\s*", text) or [text]


def _extract_topic(user: str) -> str:
    """Pull a short topic string out of a node's user message for the mock text."""
    topic = user.strip()
    for prefix in ("User goal:", "Plan:", "Goal:"):
        if topic.startswith(prefix):
            topic = topic[len(prefix):].strip()
            break
    topic = topic.splitlines()[0] if topic else "the request"
    return topic[:120].strip() or "the request"


def _mock_for_role(role: str, topic: str) -> str:
    if role == "planner":
        return (
            f"- Clarify the core question behind \"{topic}\" and define what a strong answer looks like.\n"
            "- Gather current, authoritative sources and recent developments.\n"
            "- Compare the main approaches and their trade-offs.\n"
            "- Identify concrete recommendations and any open risks.\n"
            "- Distill everything into a clear, actionable summary."
        )
    if role == "researcher":
        return (
            f"Across the gathered sources on {topic}, a few consistent themes emerge. "
            "The most credible references agree on the fundamentals while highlighting "
            "practical trade-offs to weigh, and several note recent changes worth tracking.\n\n"
            "- Fundamentals are well established and broadly agreed upon.\n"
            "- Key trade-offs center on cost, complexity, and time-to-value.\n"
            "- Recent developments meaningfully affect new projects."
        )
    if role == "synthesizer":
        return (
            f"## Summary\n\nHere is a concise synthesis addressing **{topic}**.\n\n"
            "### Key points\n"
            "1. The fundamentals are well established and broadly agreed upon.\n"
            "2. The main trade-offs come down to cost, complexity, and time-to-value.\n"
            "3. Recent developments make a measurable difference for new projects.\n\n"
            "### Recommendation\n"
            "Start with the simplest approach that satisfies the core requirement, then iterate. "
            "Validate against the sources above before committing to a direction.\n\n"
            "> _Generated in mock mode (no `OPENAI_API_KEY` set). Add a key to stream live GPT-4o output._"
        )
    return f"Response regarding {topic}."
