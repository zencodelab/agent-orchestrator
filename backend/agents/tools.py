"""Web search tool used by the Researcher.

Uses Tavily when ``TAVILY_API_KEY`` is set, otherwise returns deterministic mock
results so the tool-call flow is always demonstrable.
"""
from __future__ import annotations

import asyncio

import httpx

from config import get_settings

TAVILY_URL = "https://api.tavily.com/search"


async def web_search(query: str, max_results: int = 4) -> list[dict]:
    """Return a list of {title, url, content} results."""
    settings = get_settings()
    if settings.use_real_search:
        try:
            return await _tavily_search(query, settings.tavily_api_key, max_results)
        except Exception:
            # Fall back to mock rather than failing the whole run on a search hiccup.
            return _mock_search(query, max_results)
    await asyncio.sleep(0.25)  # simulate network latency for a realistic stream
    return _mock_search(query, max_results)


async def _tavily_search(query: str, api_key: str, max_results: int) -> list[dict]:
    payload = {
        "api_key": api_key,
        "query": query,
        "max_results": max_results,
        "search_depth": "basic",
    }
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(TAVILY_URL, json=payload)
        resp.raise_for_status()
        data = resp.json()
    return [
        {
            "title": r.get("title", "Untitled"),
            "url": r.get("url", ""),
            "content": r.get("content", ""),
        }
        for r in data.get("results", [])
    ]


def _mock_search(query: str, max_results: int) -> list[dict]:
    base = query.strip().rstrip("?.")[:60] or "the topic"
    slug = "-".join(base.lower().split())[:40]
    templates = [
        ("Overview: {q}", "example.com/overview/{s}",
         "A broad introduction to {q}, covering core concepts and common use cases."),
        ("{q} — best practices in 2026", "devnotes.io/{s}",
         "Practical guidance and trade-offs when working with {q}, with recent updates."),
        ("Comparing approaches to {q}", "compare.dev/{s}",
         "A side-by-side look at the leading approaches to {q} and when to pick each."),
        ("Case study: {q} in production", "engineeringblog.example/{s}",
         "Lessons learned applying {q} at scale, including pitfalls and metrics."),
    ]
    out = []
    for title, url, content in templates[:max_results]:
        out.append(
            {
                "title": title.format(q=base),
                "url": "https://" + url.format(s=slug),
                "content": content.format(q=base),
            }
        )
    return out
