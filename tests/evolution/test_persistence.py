"""Tests for SQLite persistence in PatternDetector and SkillPackager."""

import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from evolution.pattern_detector import PatternDetector
from evolution.skill_packager import SkillPackager


@pytest.fixture
def tmp_db(tmp_path):
    return tmp_path / "test.db"


def _make_execution(i: int = 0, name: str = "persist-test"):
    return {
        "id": f"exec_{i}",
        "name": name,
        "steps": [{"id": "a", "name": "Step A"}, {"id": "b", "name": "Step B"}],
        "edges": [("a", "b")],
    }


# ---------------------------------------------------------------------------
# PatternDetector persistence
# ---------------------------------------------------------------------------

def test_detector_write_and_read(tmp_db):
    """Write executions, close, reopen, read back."""
    det = PatternDetector(db_path=tmp_db)
    for i in range(3):
        det.record_execution(workflow=_make_execution(i), success=True, duration_ms=1000)
    det.close()

    det2 = PatternDetector(db_path=tmp_db)
    assert len(det2.get_executions()) == 3
    det2.close()


def test_detector_patterns_survive_reopen(tmp_db):
    """Detected patterns are re-derivable after reopen."""
    det = PatternDetector(db_path=tmp_db)
    for i in range(3):
        det.record_execution(workflow=_make_execution(i), success=True)
    det.close()

    det2 = PatternDetector(db_path=tmp_db)
    patterns = det2.detect_patterns(min_occurrences=2)
    assert len(patterns) == 1
    assert patterns[0].name == "persist-test"
    assert patterns[0].occurrence_count == 3
    det2.close()


def test_detector_empty_db(tmp_db):
    """Opening a nonexistent DB creates empty state."""
    det = PatternDetector(db_path=tmp_db)
    assert len(det.get_executions()) == 0
    det.close()


def test_detector_incremental(tmp_db):
    """Add executions across multiple sessions."""
    det = PatternDetector(db_path=tmp_db)
    det.record_execution(workflow=_make_execution(0), success=True)
    det.close()

    det2 = PatternDetector(db_path=tmp_db)
    det2.record_execution(workflow=_make_execution(1), success=True)
    assert len(det2.get_executions()) == 2
    det2.close()


# ---------------------------------------------------------------------------
# SkillPackager persistence
# ---------------------------------------------------------------------------

def test_packager_write_and_read(tmp_db):
    """Write skill, close, reopen, read back."""
    det = PatternDetector()
    for i in range(2):
        det.record_execution(workflow=_make_execution(i), success=True)
    patterns = det.detect_patterns(min_occurrences=2)

    pack = SkillPackager(db_path=tmp_db)
    pack.package_pattern(patterns[0])
    pack.close()

    pack2 = SkillPackager(db_path=tmp_db)
    skills = pack2.list_skills()
    assert len(skills) == 1
    assert skills[0].name == "persist-test"
    pack2.close()


def test_packager_empty_db(tmp_db):
    """Opening empty DB returns no skills."""
    pack = SkillPackager(db_path=tmp_db)
    assert pack.list_skills() == []
    pack.close()
