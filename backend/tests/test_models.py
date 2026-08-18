"""Validation tests for API request DTOs (backend/models.py)."""
import pytest
from pydantic import ValidationError

from models import MAX_QUERY_LENGTH, CreateRunRequest


def test_query_within_limit_is_accepted():
    req = CreateRunRequest(query="a" * MAX_QUERY_LENGTH)
    assert len(req.query) == MAX_QUERY_LENGTH


def test_query_over_limit_is_rejected():
    with pytest.raises(ValidationError):
        CreateRunRequest(query="a" * (MAX_QUERY_LENGTH + 1))


def test_default_model_is_used_when_omitted():
    req = CreateRunRequest(query="hello")
    assert req.model == "gpt-4o-mini"
