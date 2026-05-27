"""Quality scorer for SoloFlow skills.

Evaluates skill quality based on various metrics.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from .skill_packager import Skill
from .pattern_detector import Pattern


@dataclass
class QualityScore:
    """Quality score for a skill."""
    
    skill_id: str
    overall_score: float  # 0.0 to 1.0
    reliability_score: float  # Based on success rate
    efficiency_score: float  # Based on duration
    maturity_score: float  # Based on occurrence count
    reusability_score: float  # Based on schema quality
    timestamp: float
    
    @property
    def grade(self) -> str:
        """Get letter grade for score."""
        if self.overall_score >= 0.9:
            return "A"
        elif self.overall_score >= 0.8:
            return "B"
        elif self.overall_score >= 0.7:
            return "C"
        elif self.overall_score >= 0.6:
            return "D"
        else:
            return "F"
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "skill_id": self.skill_id,
            "overall_score": self.overall_score,
            "reliability_score": self.reliability_score,
            "efficiency_score": self.efficiency_score,
            "maturity_score": self.maturity_score,
            "reusability_score": self.reusability_score,
            "grade": self.grade,
            "timestamp": self.timestamp,
        }


class QualityScorer:
    """Evaluates skill quality.
    
    Quality is measured across four dimensions:
    - Reliability: Success rate of the underlying pattern
    - Efficiency: Execution speed compared to similar skills
    - Maturity: Number of occurrences (more = better)
    - Reusability: Quality of input/output schemas
    
    Usage:
        scorer = QualityScorer()
        score = scorer.score_skill(skill, pattern)
        print(f"Grade: {score.grade}")  # "A", "B", etc.
    """
    
    # Weight for each dimension
    WEIGHTS = {
        "reliability": 0.4,
        "efficiency": 0.2,
        "maturity": 0.2,
        "reusability": 0.2,
    }
    
    # Benchmarks for efficiency scoring
    FAST_THRESHOLD_MS = 5000  # < 5s is fast
    SLOW_THRESHOLD_MS = 60000  # > 60s is slow
    
    def __init__(self, weights: dict[str, float] | None = None) -> None:
        """Initialize the scorer.
        
        Args:
            weights: Custom weights for each dimension
        """
        if weights:
            self.weights = weights
        else:
            self.weights = self.WEIGHTS
    
    def score_skill(
        self,
        skill: Skill,
        pattern: Pattern | None = None,
    ) -> QualityScore:
        """Score a skill.
        
        Args:
            skill: Skill to score
            pattern: Associated pattern (for reliability/efficiency metrics)
            
        Returns:
            Quality score
        """
        # Calculate each dimension
        reliability = self._score_reliability(pattern)
        efficiency = self._score_efficiency(pattern)
        maturity = self._score_maturity(pattern)
        reusability = self._score_reusability(skill)
        
        # Calculate weighted overall score
        overall = (
            reliability * self.weights["reliability"]
            + efficiency * self.weights["efficiency"]
            + maturity * self.weights["maturity"]
            + reusability * self.weights["reusability"]
        )
        
        return QualityScore(
            skill_id=skill.skill_id,
            overall_score=overall,
            reliability_score=reliability,
            efficiency_score=efficiency,
            maturity_score=maturity,
            reusability_score=reusability,
            timestamp=time.time(),
        )
    
    def _score_reliability(self, pattern: Pattern | None) -> float:
        """Score reliability based on success rate."""
        if pattern is None:
            return 0.5  # Default score if no pattern
        
        return pattern.success_rate
    
    def _score_efficiency(self, pattern: Pattern | None) -> float:
        """Score efficiency based on execution duration."""
        if pattern is None or pattern.avg_duration_ms <= 0:
            return 0.5  # Default score
        
        duration = pattern.avg_duration_ms
        
        if duration <= self.FAST_THRESHOLD_MS:
            return 1.0
        elif duration >= self.SLOW_THRESHOLD_MS:
            return 0.0
        else:
            # Linear interpolation between fast and slow
            range_ms = self.SLOW_THRESHOLD_MS - self.FAST_THRESHOLD_MS
            return 1.0 - ((duration - self.FAST_THRESHOLD_MS) / range_ms)
    
    def _score_maturity(self, pattern: Pattern | None) -> float:
        """Score maturity based on occurrence count."""
        if pattern is None:
            return 0.0
        
        count = pattern.occurrence_count
        
        # Logarithmic scaling: 10 occurrences = 0.5, 100 = 1.0
        import math
        if count <= 0:
            return 0.0
        
        return min(1.0, math.log10(count) / 2.0)
    
    def _score_reusability(self, skill: Skill) -> float:
        """Score reusability based on schema quality."""
        score = 0.0
        
        # Check input schema
        input_schema = skill.input_schema
        if input_schema:
            # Has properties
            if "properties" in input_schema:
                score += 0.3
            
            # Has required fields
            if "required" in input_schema:
                score += 0.2
            
            # Has descriptions
            properties = input_schema.get("properties", {})
            has_descriptions = any(
                "description" in prop for prop in properties.values()
            )
            if has_descriptions:
                score += 0.2
        
        # Check output schema
        output_schema = skill.output_schema
        if output_schema:
            if "properties" in output_schema:
                score += 0.2
            
            if "type" in output_schema:
                score += 0.1
        
        return min(1.0, score)
    
    def score_skills(
        self,
        skills: list[Skill],
        patterns: dict[str, Pattern] | None = None,
    ) -> list[QualityScore]:
        """Score multiple skills.
        
        Args:
            skills: List of skills to score
            patterns: Dictionary of pattern_id -> Pattern
            
        Returns:
            List of quality scores
        """
        scores = []
        for skill in skills:
            pattern = patterns.get(skill.pattern_id) if patterns else None
            scores.append(self.score_skill(skill, pattern))
        
        return scores
    
    def rank_skills(
        self,
        skills: list[Skill],
        patterns: dict[str, Pattern] | None = None,
    ) -> list[tuple[Skill, QualityScore]]:
        """Rank skills by quality.
        
        Args:
            skills: List of skills to rank
            patterns: Dictionary of pattern_id -> Pattern
            
        Returns:
            List of (skill, score) tuples sorted by score descending
        """
        scored = []
        for skill in skills:
            pattern = patterns.get(skill.pattern_id) if patterns else None
            score = self.score_skill(skill, pattern)
            scored.append((skill, score))
        
        # Sort by overall score descending
        scored.sort(key=lambda x: x[1].overall_score, reverse=True)
        
        return scored
