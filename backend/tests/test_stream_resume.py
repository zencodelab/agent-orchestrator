"""Unit tests for the SSE resume-cursor resolution in ``main._resume_point``."""
from __future__ import annotations

from main import _resume_point


def test_query_param_takes_precedence():
    assert _resume_point(5, "2") == 5


def test_falls_back_to_last_event_id_header():
    assert _resume_point(0, "7") == 7


def test_negative_query_param_is_ignored_in_favour_of_header():
    # ``ge=0`` on the route already blocks negatives, but the helper is defensive.
    assert _resume_point(-1, "3") == 3


def test_garbage_header_is_treated_as_no_resume():
    assert _resume_point(0, "not-a-number") == 0


def test_negative_header_is_clamped_to_zero():
    assert _resume_point(0, "-4") == 0


def test_no_cursor_anywhere_starts_from_zero():
    assert _resume_point(0, None) == 0
