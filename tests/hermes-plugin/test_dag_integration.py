"""Tests for DAG engine → PatternDetector integration."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from store.sqlite_store import SQLiteStore
from services.workflow_service import WorkflowService
from evolution.pattern_detector import PatternDetector


@pytest.fixture
def store():
    s = SQLiteStore(Path(":memory:"))
    s.initialize()
    return s


@pytest.fixture
def ws(store):
    return WorkflowService(store)


def test_set_on_complete(ws):
    """WorkflowService accepts a completion callback."""
    recorded = []

    def cb(wf_id, success, duration_ms, wf_def):
        recorded.append((wf_id, success, duration_ms))

    ws.set_on_complete(cb)
    assert ws._on_complete is not None


@pytest.mark.asyncio
async def test_callback_fires_on_completion(ws):
    """Callback fires when all steps complete."""
    recorded = []

    def cb(wf_id, success, duration_ms, wf_def):
        recorded.append({"success": success, "name": wf_def.get("name")})

    ws.set_on_complete(cb)

    wf = await ws.create_workflow(
        name="test-wf",
        description="test",
        steps=[
            {"id": "a", "name": "Step A"},
            {"id": "b", "name": "Step B"},
        ],
        edges=[("a", "b")],
    )
    await ws.start_workflow(wf["id"])
    await ws.advance_step(wf["id"], "a", result="ok")
    # Not done yet — only step A completed
    assert len(recorded) == 0

    await ws.advance_step(wf["id"], "b", result="ok")
    # Now done
    assert len(recorded) == 1
    assert recorded[0]["success"] is True
    assert recorded[0]["name"] == "test-wf"


@pytest.mark.asyncio
async def test_callback_fires_on_failure(ws):
    """Callback fires with success=False when any step fails."""
    recorded = []

    def cb(wf_id, success, duration_ms, wf_def):
        recorded.append({"success": success})

    ws.set_on_complete(cb)

    wf = await ws.create_workflow(
        name="fail-wf",
        description="test",
        steps=[{"id": "a", "name": "A"}],
        edges=[],
    )
    await ws.start_workflow(wf["id"])
    await ws.advance_step(wf["id"], "a", error="boom")

    assert len(recorded) == 1
    assert recorded[0]["success"] is False


@pytest.mark.asyncio
async def test_callback_receives_duration(ws):
    """Callback receives a non-negative duration_ms."""
    recorded = []

    def cb(wf_id, success, duration_ms, wf_def):
        recorded.append(duration_ms)

    ws.set_on_complete(cb)

    wf = await ws.create_workflow(
        name="dur-wf",
        description="test",
        steps=[{"id": "a", "name": "A"}],
        edges=[],
    )
    await ws.start_workflow(wf["id"])
    await ws.advance_step(wf["id"], "a", result="ok")

    assert len(recorded) == 1
    assert recorded[0] >= 0


@pytest.mark.asyncio
async def test_callback_error_does_not_break_advance(ws):
    """If callback raises, advance_step still succeeds."""
    def bad_cb(wf_id, success, duration_ms, wf_def):
        raise RuntimeError("callback exploded")

    ws.set_on_complete(bad_cb)

    wf = await ws.create_workflow(
        name="safe-wf",
        description="test",
        steps=[{"id": "a", "name": "A"}],
        edges=[],
    )
    await ws.start_workflow(wf["id"])
    # Should not raise
    status = await ws.advance_step(wf["id"], "a", result="ok")
    assert status["state"] in ("completed", "failed")


@pytest.mark.asyncio
async def test_dag_to_pattern_detector_roundtrip(ws):
    """Full round-trip: WorkflowService → callback → PatternDetector."""
    detector = PatternDetector()

    def cb(wf_id, success, duration_ms, wf_def):
        steps = wf_def.get("steps", [])
        edges_raw = wf_def.get("edges", [])
        edges = [(e["from"], e["to"]) if isinstance(e, dict) else (e[0], e[1]) for e in edges_raw]
        detector.record_execution(
            workflow={
                "id": wf_id,
                "name": wf_def.get("name", ""),
                "steps": [{"id": s["id"], "name": s.get("name", s["id"]), "prompt": s.get("prompt", "")} for s in steps],
                "edges": edges,
            },
            success=success,
            duration_ms=duration_ms,
        )

    ws.set_on_complete(cb)

    # Execute same workflow 3 times
    for i in range(3):
        wf = await ws.create_workflow(
            name="repeatable",
            description="test",
            steps=[
                {"id": "search", "name": "Search"},
                {"id": "write", "name": "Write"},
            ],
            edges=[("search", "write")],
        )
        await ws.start_workflow(wf["id"])
        await ws.advance_step(wf["id"], "search", result="found")
        await ws.advance_step(wf["id"], "write", result="done")

    # Should detect pattern
    patterns = detector.detect_patterns(min_occurrences=2)
    assert len(patterns) == 1
    assert patterns[0].name == "repeatable"
    assert patterns[0].occurrence_count == 3
    assert patterns[0].success_rate == 1.0
