"""
Tests for SoloFlow evolution module.
"""

import sys
import tempfile
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from evolution.pattern_detector import PatternDetector, Pattern
from evolution.skill_packager import SkillPackager, Skill
from evolution.quality_scorer import QualityScorer, QualityScore


def test_pattern_detector():
    """Test PatternDetector functionality."""
    print("Testing PatternDetector...")
    
    detector = PatternDetector()
    
    # Test recording executions
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
    
    assert len(detector.get_executions()) == 3
    
    # Test pattern detection
    patterns = detector.detect_patterns(min_occurrences=2)
    assert len(patterns) == 1
    
    pattern = patterns[0]
    assert pattern.name == "test-workflow"
    assert pattern.occurrence_count == 3
    assert pattern.success_rate == 1.0
    
    print("✓ PatternDetector tests passed")
    return detector


def test_skill_packager(detector: PatternDetector):
    """Test SkillPackager functionality."""
    print("Testing SkillPackager...")
    
    packager = SkillPackager()
    
    # Get pattern
    patterns = detector.detect_patterns(min_occurrences=2)
    assert len(patterns) > 0
    
    pattern = patterns[0]
    
    # Package skill
    skill = packager.package_pattern(pattern)
    
    assert skill.name == "test-workflow"
    assert skill.category == "custom"
    assert skill.description != ""
    assert skill.skill_md_content != ""
    assert skill.plugin_py_content != ""
    
    # Test listing skills
    skills = packager.list_skills()
    assert len(skills) == 1
    
    print("✓ SkillPackager tests passed")
    return packager, skill


def test_quality_scorer(skill: Skill, pattern: Pattern):
    """Test QualityScorer functionality."""
    print("Testing QualityScorer...")
    
    scorer = QualityScorer()
    
    # Score skill
    score = scorer.score_skill(skill, pattern)
    
    assert 0 <= score.overall_score <= 1
    assert score.grade in ["A", "B", "C", "D", "F"]
    assert 0 <= score.reliability_score <= 1
    assert 0 <= score.efficiency_score <= 1
    assert 0 <= score.maturity_score <= 1
    assert 0 <= score.reusability_score <= 1
    
    # Test ranking
    ranked = scorer.rank_skills([skill], {pattern.pattern_id: pattern})
    assert len(ranked) == 1
    assert ranked[0][0] == skill
    
    # Test update score
    updated_score = scorer.update_score(skill, success=True, duration_ms=500)
    assert skill.use_count == 1
    assert skill.success_count == 1
    
    print("✓ QualityScorer tests passed")


def test_integration():
    """Test full integration."""
    print("\nTesting full integration...")
    
    # Initialize
    detector = PatternDetector()
    packager = SkillPackager()
    scorer = QualityScorer()
    
    # Simulate multiple workflow types
    workflows = [
        {
            "id": "research_1",
            "name": "research-report",
            "steps": [
                {"id": "search", "name": "Search"},
                {"id": "analyze", "name": "Analyze"},
                {"id": "write", "name": "Write"},
            ],
            "edges": [("search", "analyze"), ("analyze", "write")],
        },
        {
            "id": "research_2",
            "name": "research-report",
            "steps": [
                {"id": "search", "name": "Search"},
                {"id": "analyze", "name": "Analyze"},
                {"id": "write", "name": "Write"},
            ],
            "edges": [("search", "analyze"), ("analyze", "write")],
        },
        {
            "id": "deploy_1",
            "name": "deploy-service",
            "steps": [
                {"id": "build", "name": "Build"},
                {"id": "test", "name": "Test"},
                {"id": "deploy", "name": "Deploy"},
            ],
            "edges": [("build", "test"), ("test", "deploy")],
        },
    ]
    
    for wf in workflows:
        detector.record_execution(
            workflow=wf,
            success=True,
            duration_ms=2000,
            tools_used=["tool_a"],
        )
    
    # Detect patterns
    patterns = detector.detect_patterns(min_occurrences=2)
    assert len(patterns) == 1  # Only research-report appears 2x
    
    # Package and score
    pattern = patterns[0]
    skill = packager.package_pattern(pattern)
    score = scorer.score_skill(skill, pattern)
    
    print(f"   Pattern: {pattern.name}")
    print(f"   Skill: {skill.name}")
    print(f"   Score: {score.overall_score:.2f} ({score.grade})")
    
    print("✓ Integration tests passed")


def main():
    """Run all tests."""
    print("=" * 50)
    print("SoloFlow Evolution Module Tests")
    print("=" * 50)
    
    try:
        detector = test_pattern_detector()
        packager, skill = test_skill_packager(detector)
        test_quality_scorer(skill, detector.detect_patterns(min_occurrences=2)[0])
        test_integration()
        
        print("\n" + "=" * 50)
        print("✓ All tests passed!")
        print("=" * 50)
        
    except Exception as e:
        print(f"\n✗ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())
