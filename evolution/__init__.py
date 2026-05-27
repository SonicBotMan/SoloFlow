"""Skill Auto-Evolution for SoloFlow.

Detects repeated workflow patterns, packages them into reusable skills,
and exposes them as MCP tools.
"""

from .pattern_detector import PatternDetector, Pattern
from .skill_packager import SkillPackager, Skill
from .quality_scorer import QualityScorer, QualityScore

__all__ = [
    "PatternDetector", "Pattern",
    "SkillPackager", "Skill",
    "QualityScorer", "QualityScore",
]
