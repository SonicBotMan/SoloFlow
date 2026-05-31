"""
Tests for SoloFlow evolution module.
"""

import sys
import tempfile
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from evolution.pattern_detector import PatternDetector, Pattern
from evolution.skill_packager import SkillPackager, Skill
from evolution.quality_scorer import QualityScorer, QualityScore


def _make_detector() -> PatternDetector:
    """Create a detector with 3 identical workflow executions."""
    detector = PatternDetector()
    for i in range(3):
        detector.record_execution(
            workflow={
                "id": f"test_{i}",
                "name": "test-workflow",
                "steps": [
                    {"id": "step1", "name": "Step 1"},
                    {"id": "step2", "name": "Step 2"},
                ],
                "edges": [("step1", "step2")],
            },
            success=True,
            duration_ms=1000 + i * 100,
            tools_used=["tool_a", "tool_b"],
        )
    return detector


def test_pattern_detector_basic():
    """Test basic PatternDetector functionality."""
    detector = PatternDetector()

    # Empty state
    assert len(detector.get_executions()) == 0
    assert len(detector.detect_patterns(min_occurrences=2)) == 0

    # Record one execution
    detector.record_execution(
        workflow={"id": "x", "name": "wf", "steps": [{"id": "a", "name": "A"}], "edges": []},
        success=True,
    )
    assert len(detector.get_executions()) == 1


def test_pattern_detector_fingerprinting():
    """Test that same structure → same fingerprint, different structure → different fingerprint."""
    detector = PatternDetector()

    # Two workflows with SAME structure but different ids
    for i in range(2):
        detector.record_execution(
            workflow={
                "id": f"id_{i}",
                "name": "research",
                "steps": [{"id": "a", "name": "Search"}, {"id": "b", "name": "Analyze"}],
                "edges": [("a", "b")],
            },
            success=True,
        )

    # One workflow with DIFFERENT structure
    detector.record_execution(
        workflow={
            "id": "deploy",
            "name": "deploy",
            "steps": [{"id": "x", "name": "Build"}, {"id": "y", "name": "Deploy"}],
            "edges": [("x", "y")],
        },
        success=True,
    )

    patterns = detector.detect_patterns(min_occurrences=2)
    assert len(patterns) == 1
    assert patterns[0].name == "research"
    assert patterns[0].occurrence_count == 2


def test_pattern_detector_success_rate():
    """Test success rate calculation."""
    detector = PatternDetector()

    for i, success in enumerate([True, True, False]):
        detector.record_execution(
            workflow={
                "id": f"f_{i}",
                "name": "flaky",
                "steps": [{"id": "a", "name": "Run"}],
                "edges": [],
            },
            success=success,
        )

    patterns = detector.detect_patterns(min_occurrences=2)
    assert len(patterns) == 1
    assert patterns[0].success_rate == 2 / 3


def test_skill_packager_basic():
    """Test SkillPackager packages a pattern into a skill."""
    detector = _make_detector()
    patterns = detector.detect_patterns(min_occurrences=2)
    assert len(patterns) == 1

    packager = SkillPackager()
    skill = packager.package_pattern(patterns[0])

    assert isinstance(skill, Skill)
    assert skill.name == "test-workflow"
    assert skill.skill_md_content != ""
    assert plugin_has_register(skill.plugin_py_content)


def test_skill_packager_category_detection():
    """Test auto-detection of skill category."""
    detector = PatternDetector()
    for i in range(2):
        detector.record_execution(
            workflow={
                "id": f"g_{i}",
                "name": "git-pr-workflow",
                "steps": [{"id": "a", "name": "commit"}, {"id": "b", "name": "push"}],
                "edges": [("a", "b")],
            },
            success=True,
            tools_used=["git", "gh"],
        )

    patterns = detector.detect_patterns(min_occurrences=2)
    packager = SkillPackager()
    skill = packager.package_pattern(patterns[0])

    assert skill.category == "software-development"


def test_skill_packager_install(tmp_path):
    """Test skill installation to a directory."""
    detector = _make_detector()
    patterns = detector.detect_patterns(min_occurrences=2)
    packager = SkillPackager()
    skill = packager.package_pattern(patterns[0])

    hermes_dir = tmp_path / ".hermes"
    installed = packager.install_skill(skill, hermes_dir=hermes_dir)

    assert len(installed) == 2
    assert installed[0].exists()
    assert installed[1].exists()
    assert installed[0].name == "SKILL.md"
    assert installed[1].name == "test-workflow.py"


def test_quality_scorer_dimensions():
    """Test all four scoring dimensions."""
    detector = _make_detector()
    patterns = detector.detect_patterns(min_occurrences=2)
    packager = SkillPackager()
    skill = packager.package_pattern(patterns[0])

    scorer = QualityScorer()
    score = scorer.score_skill(skill, patterns[0])

    assert isinstance(score, QualityScore)
    assert 0 <= score.overall_score <= 1
    assert score.grade in ("A", "B", "C", "D", "F")
    assert 0 <= score.reliability_score <= 1
    assert 0 <= score.efficiency_score <= 1
    assert 0 <= score.maturity_score <= 1
    assert 0 <= score.reusability_score <= 1


def test_quality_scorer_ranking():
    """Test skill ranking by quality score."""
    detector = PatternDetector()

    # Skill A: high reliability
    for i in range(5):
        detector.record_execution(
            workflow={
                "id": f"a_{i}",
                "name": "reliable",
                "steps": [{"id": "x", "name": "X"}],
                "edges": [],
            },
            success=True,
        )

    # Skill B: lower reliability
    for i in range(3):
        detector.record_execution(
            workflow={
                "id": f"b_{i}",
                "name": "flaky",
                "steps": [{"id": "y", "name": "Y"}],
                "edges": [],
            },
            success=(i != 2),
        )

    patterns = detector.detect_patterns(min_occurrences=2)
    packager = SkillPackager()
    scorer = QualityScorer()

    skills = [packager.package_pattern(p) for p in patterns]
    ranked = scorer.rank_skills(skills, {p.pattern_id: p for p in patterns})

    assert len(ranked) == 2
    # First should be the higher-scoring one
    assert ranked[0][1].overall_score >= ranked[1][1].overall_score


def test_quality_scorer_update():
    """Test score update after usage."""
    detector = _make_detector()
    patterns = detector.detect_patterns(min_occurrences=2)
    packager = SkillPackager()
    skill = packager.package_pattern(patterns[0])

    scorer = QualityScorer()
    assert skill.use_count == 0

    scorer.update_score(skill, success=True, duration_ms=500)
    assert skill.use_count == 1
    assert skill.success_count == 1

    scorer.update_score(skill, success=False)
    assert skill.use_count == 2
    assert skill.success_count == 1


def test_integration_multi_workflow():
    """Full integration: detect → package → score → install."""
    detector = PatternDetector()

    # Workflow A: appears 3 times
    for i in range(3):
        detector.record_execution(
            workflow={
                "id": f"r_{i}",
                "name": "research-report",
                "steps": [
                    {"id": "search", "name": "Search"},
                    {"id": "analyze", "name": "Analyze"},
                    {"id": "write", "name": "Write"},
                ],
                "edges": [("search", "analyze"), ("analyze", "write")],
            },
            success=True,
            duration_ms=2000,
            tools_used=["perplexity", "gbrain"],
        )

    # Workflow B: appears 1 time (should NOT be detected)
    detector.record_execution(
        workflow={
            "id": "d_0",
            "name": "deploy",
            "steps": [{"id": "build", "name": "Build"}, {"id": "ship", "name": "Ship"}],
            "edges": [("build", "ship")],
        },
        success=True,
    )

    # Detect
    patterns = detector.detect_patterns(min_occurrences=2)
    assert len(patterns) == 1
    assert patterns[0].name == "research-report"
    assert patterns[0].occurrence_count == 3

    # Package
    packager = SkillPackager()
    skill = packager.package_pattern(patterns[0])
    assert skill.category == "research"
    assert "Search" in skill.skill_md_content or "search" in skill.skill_md_content.lower()

    # Score
    scorer = QualityScorer()
    score = scorer.score_skill(skill, patterns[0])
    assert score.reliability_score == 1.0  # 3/3 success
    assert score.grade in ("A", "B", "C", "D", "F")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def plugin_has_register(content: str) -> bool:
    """Check that generated plugin.py contains a register() function."""
    return "def register(hermes):" in content
