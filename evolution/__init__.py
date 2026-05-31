"""
SoloFlow — Evolution Module

Auto-detect workflow patterns and package them as reusable skills.
"""

from .pattern_detector import PatternDetector
from .skill_packager import SkillPackager
from .quality_scorer import QualityScorer

__all__ = ["PatternDetector", "SkillPackager", "QualityScorer"]
