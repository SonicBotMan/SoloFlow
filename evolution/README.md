# SoloFlow Skill Auto-Evolution

Automatic pattern detection and skill packaging.

## Overview

This module implements the skill auto-evolution pipeline:

```
pattern → detect → package → skill → MCP tool
```

1. **Pattern Detection**: Analyze workflow execution history to find repeated patterns
2. **Skill Packaging**: Package reliable patterns into versioned, reusable skills
3. **Quality Scoring**: Evaluate skills across reliability, efficiency, maturity, and reusability

## Quick Start

```python
from evolution import PatternDetector, SkillPackager, QualityScorer

# 1. Record workflow executions
detector = PatternDetector(db_path=Path("patterns.db"))

for workflow in workflow_history:
    detector.record_execution(
        workflow=workflow,
        success=True,
        duration_ms=1000,
    )

# 2. Detect patterns
patterns = detector.detect_patterns(min_occurrences=3)
print(f"Found {len(patterns)} patterns")

# 3. Package patterns into skills
packager = SkillPackager(db_path=Path("skills.db"))

for pattern in patterns:
    if pattern.is_reliable:
        skill = packager.package_pattern(pattern)
        print(f"Created skill: {skill.name} v{skill.version}")

# 4. Score and rank skills
scorer = QualityScorer()
skills = packager.list_skills()
ranked = scorer.rank_skills(skills)

for skill, score in ranked:
    print(f"{skill.name}: {score.grade} ({score.overall_score:.2f})")
```

## Architecture

```
evolution/
├── __init__.py          # Package exports
├── pattern_detector.py  # Pattern detection from workflow history
├── skill_packager.py    # Package patterns into versioned skills
└── quality_scorer.py    # Evaluate skill quality

tests/evolution/
└── test_evolution.py    # Tests (15 passing)
```

## API Reference

### Pattern

```python
pattern = Pattern(
    pattern_id="pattern_123",
    name="Research Workflow",
    description="...",
    steps=[{"name": "search"}, {"name": "analyze"}],
    edges=[("search", "analyze")],
    occurrence_count=10,
    success_count=9,
)

print(pattern.success_rate)  # 0.9
print(pattern.is_reliable)   # True
print(pattern.fingerprint)   # "a1b2c3d4e5f6"
```

### PatternDetector

```python
detector = PatternDetector(db_path=Path("patterns.db"))

# Record executions
detector.record_execution(workflow, success=True, duration_ms=1000)

# Detect patterns
patterns = detector.detect_patterns(
    min_occurrences=3,
    min_success_rate=0.5,
)

# Get specific pattern
pattern = detector.get_pattern("pattern_id")
```

### SkillPackager

```python
packager = SkillPackager(db_path=Path("skills.db"))

# Package a pattern
skill = packager.package_pattern(pattern)

# List skills
skills = packager.list_skills(limit=50)

# Get skill by ID
skill = packager.get_skill("skill_id")

# Convert to MCP tool
mcp_tool = skill.to_mcp_tool()
```

### QualityScorer

```python
scorer = QualityScorer(
    weights={
        "reliability": 0.4,  # Success rate
        "efficiency": 0.2,   # Execution speed
        "maturity": 0.2,     # Occurrence count
        "reusability": 0.2,  # Schema quality
    }
)

# Score a skill
score = scorer.score_skill(skill, pattern)
print(score.grade)  # "A", "B", "C", "D", "F"

# Rank skills
ranked = scorer.rank_skills(skills, patterns={"pattern_id": pattern})
```

## Testing

```bash
python -m pytest tests/evolution/ -v
```

## License

MIT
