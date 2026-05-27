"""Tests for SoloFlow Skill Auto-Evolution."""

from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from evolution.pattern_detector import PatternDetector, Pattern
from evolution.skill_packager import SkillPackager, Skill
from evolution.quality_scorer import QualityScorer, QualityScore


@pytest.fixture
def db_path(tmp_path):
    """Create a temporary database path."""
    return tmp_path / "test.db"


@pytest.fixture
def detector(db_path):
    """Create a test pattern detector."""
    return PatternDetector(db_path=db_path)


@pytest.fixture
def packager(tmp_path):
    """Create a test skill packager."""
    return SkillPackager(db_path=tmp_path / "skills.db")


@pytest.fixture
def scorer():
    """Create a test quality scorer."""
    return QualityScorer()


class TestPattern:
    """Tests for Pattern."""
    
    def test_creation(self):
        """Test creating a pattern."""
        pattern = Pattern(
            pattern_id="test_pattern",
            name="Test Pattern",
            description="A test pattern",
            steps=[{"name": "step1"}, {"name": "step2"}],
            edges=[("step1", "step2")],
        )
        
        assert pattern.pattern_id == "test_pattern"
        assert pattern.name == "Test Pattern"
        assert len(pattern.steps) == 2
        assert len(pattern.edges) == 1
    
    def test_fingerprint(self):
        """Test fingerprint computation."""
        pattern = Pattern(
            pattern_id="test",
            name="Test",
            description="",
            steps=[{"name": "step1"}, {"name": "step2"}],
            edges=[("step1", "step2")],
        )
        
        assert pattern.fingerprint != ""
        assert len(pattern.fingerprint) == 12
    
    def test_success_rate(self):
        """Test success rate calculation."""
        pattern = Pattern(
            pattern_id="test",
            name="Test",
            description="",
            steps=[],
            edges=[],
            success_count=8,
            failure_count=2,
        )
        
        assert pattern.success_rate == 0.8
    
    def test_is_reliable(self):
        """Test reliability check."""
        # Reliable: 80% success, 3 occurrences
        reliable = Pattern(
            pattern_id="test",
            name="Test",
            description="",
            steps=[],
            edges=[],
            occurrence_count=3,
            success_count=3,
            failure_count=0,
        )
        assert reliable.is_reliable is True
        
        # Unreliable: only 2 occurrences
        unreliable = Pattern(
            pattern_id="test",
            name="Test",
            description="",
            steps=[],
            edges=[],
            occurrence_count=2,
            success_count=2,
            failure_count=0,
        )
        assert unreliable.is_reliable is False


class TestPatternDetector:
    """Tests for PatternDetector."""
    
    def test_record_execution(self, detector):
        """Test recording an execution."""
        workflow = {
            "id": "wf1",
            "name": "Test Workflow",
            "steps": [{"name": "step1"}, {"name": "step2"}],
            "edges": [("step1", "step2")],
        }
        
        detector.record_execution(workflow, success=True, duration_ms=1000)
        
        assert detector.get_execution_count() == 1
    
    def test_detect_patterns(self, detector):
        """Test detecting patterns."""
        workflow = {
            "id": "wf1",
            "name": "Test Workflow",
            "steps": [{"name": "step1"}, {"name": "step2"}],
            "edges": [("step1", "step2")],
        }
        
        # Record multiple executions
        for _ in range(5):
            detector.record_execution(workflow, success=True, duration_ms=1000)
        
        patterns = detector.detect_patterns(min_occurrences=3)
        
        assert len(patterns) == 1
        assert patterns[0].occurrence_count == 5
    
    def test_get_pattern(self, detector):
        """Test getting a pattern."""
        workflow = {
            "id": "wf1",
            "name": "Test Workflow",
            "steps": [{"name": "step1"}],
            "edges": [],
        }
        
        detector.record_execution(workflow, success=True)
        
        patterns = detector.detect_patterns(min_occurrences=1)
        assert len(patterns) == 1
        
        pattern = detector.get_pattern(patterns[0].pattern_id)
        assert pattern is not None


class TestSkill:
    """Tests for Skill."""
    
    def test_creation(self):
        """Test creating a skill."""
        skill = Skill(
            skill_id="test_skill",
            name="test_skill",
            version="1.0.0",
            description="A test skill",
            pattern_id="test_pattern",
            steps=[{"name": "step1"}],
            edges=[],
            input_schema={"type": "object", "properties": {}},
            output_schema={"type": "object", "properties": {}},
        )
        
        assert skill.skill_id == "test_skill"
        assert skill.version == "1.0.0"
    
    def test_to_mcp_tool(self):
        """Test converting to MCP tool."""
        skill = Skill(
            skill_id="test_skill",
            name="test_skill",
            version="1.0.0",
            description="A test skill",
            pattern_id="test_pattern",
            steps=[],
            edges=[],
            input_schema={"type": "object", "properties": {}},
            output_schema={"type": "object", "properties": {}},
        )
        
        mcp_tool = skill.to_mcp_tool()
        
        assert mcp_tool["name"] == "soloflow_skill_test_skill"
        assert mcp_tool["description"] == "A test skill"


class TestSkillPackager:
    """Tests for SkillPackager."""
    
    def test_package_pattern(self, packager):
        """Test packaging a pattern."""
        pattern = Pattern(
            pattern_id="test_pattern",
            name="Test Pattern",
            description="A test pattern",
            steps=[{"name": "step1", "prompt": "Do something"}],
            edges=[],
            occurrence_count=5,
            success_count=5,
        )
        
        skill = packager.package_pattern(pattern)
        
        assert skill.skill_id.startswith("skill_")
        assert skill.pattern_id == "test_pattern"
        assert skill.version == "1.0.0"
    
    def test_list_skills(self, packager):
        """Test listing skills."""
        pattern = Pattern(
            pattern_id="test_pattern",
            name="Test Pattern",
            description="",
            steps=[{"name": "step1"}],
            edges=[],
        )
        
        packager.package_pattern(pattern)
        
        skills = packager.list_skills()
        assert len(skills) == 1
    
    def test_get_skill(self, packager):
        """Test getting a skill."""
        pattern = Pattern(
            pattern_id="test_pattern",
            name="Test Pattern",
            description="",
            steps=[{"name": "step1"}],
            edges=[],
        )
        
        skill = packager.package_pattern(pattern)
        
        retrieved = packager.get_skill(skill.skill_id)
        assert retrieved is not None
        assert retrieved.skill_id == skill.skill_id


class TestQualityScorer:
    """Tests for QualityScorer."""
    
    def test_score_skill(self, scorer):
        """Test scoring a skill."""
        skill = Skill(
            skill_id="test_skill",
            name="test_skill",
            version="1.0.0",
            description="A test skill",
            pattern_id="test_pattern",
            steps=[{"name": "step1"}],
            edges=[],
            input_schema={"type": "object", "properties": {"input_1": {"type": "string", "description": "test"}}},
            output_schema={"type": "object", "properties": {"result": {"type": "string"}}},
        )
        
        pattern = Pattern(
            pattern_id="test_pattern",
            name="Test Pattern",
            description="",
            steps=[],
            edges=[],
            occurrence_count=10,
            success_count=9,
            failure_count=1,
            avg_duration_ms=3000,
        )
        
        score = scorer.score_skill(skill, pattern)
        
        assert 0.0 <= score.overall_score <= 1.0
        assert score.grade in ["A", "B", "C", "D", "F"]
    
    def test_reliability_score(self, scorer):
        """Test reliability scoring."""
        skill = Skill(
            skill_id="test",
            name="test",
            version="1.0.0",
            description="",
            pattern_id="test",
            steps=[],
            edges=[],
            input_schema={},
            output_schema={},
        )
        
        # High reliability pattern
        pattern = Pattern(
            pattern_id="test",
            name="Test",
            description="",
            steps=[],
            edges=[],
            occurrence_count=10,
            success_count=10,
        )
        
        score = scorer.score_skill(skill, pattern)
        assert score.reliability_score == 1.0
    
    def test_rank_skills(self, scorer):
        """Test ranking skills."""
        skill1 = Skill(
            skill_id="skill1",
            name="skill1",
            version="1.0.0",
            description="",
            pattern_id="pattern1",
            steps=[],
            edges=[],
            input_schema={"type": "object", "properties": {"input_1": {"type": "string", "description": "test"}}},
            output_schema={"type": "object", "properties": {}},
        )
        
        skill2 = Skill(
            skill_id="skill2",
            name="skill2",
            version="1.0.0",
            description="",
            pattern_id="pattern2",
            steps=[],
            edges=[],
            input_schema={},
            output_schema={},
        )
        
        pattern1 = Pattern(
            pattern_id="pattern1",
            name="Pattern 1",
            description="",
            steps=[],
            edges=[],
            occurrence_count=10,
            success_count=10,
            avg_duration_ms=1000,
        )
        
        pattern2 = Pattern(
            pattern_id="pattern2",
            name="Pattern 2",
            description="",
            steps=[],
            edges=[],
            occurrence_count=2,
            success_count=1,
            avg_duration_ms=5000,
        )
        
        ranked = scorer.rank_skills(
            [skill1, skill2],
            patterns={"pattern1": pattern1, "pattern2": pattern2},
        )
        
        assert len(ranked) == 2
        # skill1 should rank higher
        assert ranked[0][0].skill_id == "skill1"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
