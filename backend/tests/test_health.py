"""Tests for the /api/health endpoint."""
from __future__ import annotations

from fastapi.testclient import TestClient

import main


def test_health_reports_ok_and_runtime_context():
    with TestClient(main.app) as client:
        resp = client.get("/api/health")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["version"] == main.app.version
    assert isinstance(body["mock_mode"], bool)
    assert isinstance(body["real_search"], bool)
    assert isinstance(body["uptime_seconds"], (int, float))
    assert body["uptime_seconds"] >= 0
