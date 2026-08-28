"""HTTP-level tests for the read-only and validation paths of the API.

These exercise the FastAPI routing/validation layer via ``TestClient`` without
starting a real run, so they stay fast and deterministic. Run-lifecycle
behaviour is covered separately in ``test_runner.py``.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

import main

client = TestClient(main.app)


def test_health_reports_ok_and_mode_flags():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert set(body) == {"status", "mock_mode", "real_search"}
    assert isinstance(body["mock_mode"], bool)
    assert isinstance(body["real_search"], bool)


def test_list_runs_is_empty_by_default():
    resp = client.get("/api/runs")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_runs_rejects_out_of_range_limit():
    assert client.get("/api/runs", params={"limit": 0}).status_code == 422
    assert client.get("/api/runs", params={"limit": 201}).status_code == 422


def test_list_runs_rejects_unknown_status_filter():
    assert client.get("/api/runs", params={"status": "bogus"}).status_code == 422


def test_get_unknown_run_returns_404():
    resp = client.get("/api/runs/does-not-exist")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "run not found"


def test_delete_unknown_run_returns_404():
    resp = client.delete("/api/runs/does-not-exist")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "run not found"


def test_create_run_rejects_blank_query():
    assert client.post("/api/runs", json={"query": ""}).status_code == 422
    assert client.post("/api/runs", json={"query": "   "}).status_code == 422
