"""Unit tests for the run-persistence helpers in ``runner.py``."""
from __future__ import annotations

import runner
from models import RunStatus


def test_create_run_row_defaults_to_pending():
    run = runner._create_run_row("hello world", "gpt-4o-mini", None)

    assert run.id
    assert run.query == "hello world"
    assert run.status == RunStatus.pending
    assert run.final_output is None


def test_get_run_round_trips():
    created = runner._create_run_row("q", "gpt-4o-mini", None)

    fetched = runner.get_run(created.id)

    assert fetched is not None
    assert fetched.id == created.id
    assert fetched.query == "q"


def test_get_run_missing_returns_none():
    assert runner.get_run("does-not-exist") is None


def test_list_runs_orders_newest_first():
    first = runner._create_run_row("first", "gpt-4o-mini", None)
    second = runner._create_run_row("second", "gpt-4o-mini", None)

    runs = runner.list_runs()

    assert [r.id for r in runs][:2] == [second.id, first.id]


def test_list_runs_respects_limit():
    for i in range(3):
        runner._create_run_row(f"q{i}", "gpt-4o-mini", None)

    assert len(runner.list_runs(limit=2)) == 2


def test_set_status_updates_run():
    run = runner._create_run_row("q", "gpt-4o-mini", None)

    runner._set_status(run.id, RunStatus.running)

    assert runner.get_run(run.id).status == RunStatus.running


def test_finalize_run_sets_output_and_error():
    run = runner._create_run_row("q", "gpt-4o-mini", None)

    runner._finalize_run(run.id, RunStatus.completed, "the answer", None)

    updated = runner.get_run(run.id)
    assert updated.status == RunStatus.completed
    assert updated.final_output == "the answer"
    assert updated.error is None


def test_persist_and_fetch_events_in_seq_order():
    run = runner._create_run_row("q", "gpt-4o-mini", None)
    runner._persist_event(run.id, {"seq": 2, "type": "node_end", "node": "planner", "content": "b"})
    runner._persist_event(run.id, {"seq": 1, "type": "node_start", "node": "planner", "content": "a"})

    events = runner.get_all_events(run.id)

    assert [e.seq for e in events] == [1, 2]


def test_get_events_after_filters_by_seq():
    run = runner._create_run_row("q", "gpt-4o-mini", None)
    for seq in (1, 2, 3):
        runner._persist_event(run.id, {"seq": seq, "type": "node_stream", "node": "planner", "content": str(seq)})

    events = runner.get_events_after(run.id, after_seq=1)

    assert [e.seq for e in events] == [2, 3]
