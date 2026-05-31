"""
SoloFlow — Quality Scorer

Scores skills based on multiple quality dimensions:
- Reliability: Success rate and consistency
- Efficiency: Duration and resource usage
- Maturity: Usage count and iteration history
- Reusability: Generalization potential and dependency count
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from .pattern_detector import Pattern
from .skill_packager import Skill


@dataclass
class QualityScore:
    """Quality score breakdown for a skill."""
    overall_score: float  # 0-1
    grade: str  # A, B, C, D, F
    reliability_score: float  # 0-1
    efficiency_score: float  # 0-1
    maturity_score: float  # 0-1
    reusability_score: float  # 0-1
    details: dict[str, Any]


class QualityScorer:
    """
    Scores skills based on multiple quality dimensions.
    
    Scoring formula:
    overall = (reliability * 0.4) + (efficiency * 0.2) + (maturity * 0.2) + (reusability * 0.2)
    
    Grades:
    - A: 0.9-1.0 (Excellent)
    - B: 0.8-0.89 (Good)
    - C: 0.7-0.79 (Acceptable)
    - D: 0.6-0.69 (Poor)
    - F: 0-0.59 (Failing)
    """
    
    # Grade thresholds
    GRADE_THRESHOLDS = {
        "A": 0.9,
        "B": 0.8,
        "C": 0.7,
        "D": 0.6,
        "F": 0.0,
    }
    
    # Weights for overall score calculation
    WEIGHTS = {
        "reliability": 0.4,
        "efficiency": 0.2,
        "maturity": 0.2,
        "reusability": 0.2,
    }
    
    # Baseline duration for efficiency calculation (ms)
    # Workflows under this duration get full efficiency score
    BASELINE_DURATION_MS = 5000  # 5 seconds
    
    def score_skill(
        self,
        skill: Skill,
        pattern: Optional[Pattern] = None,
    ) -> QualityScore:
        """
        Score a skill based on multiple quality dimensions.
        
        Args:
            skill: The skill to score
            pattern: The source pattern (for additional metrics)
        
        Returns:
            QualityScore with breakdown
        """
        # Calculate individual scores
        reliability = self._calculate_reliability(skill, pattern)
        efficiency = self._calculate_efficiency(skill, pattern)
        maturity = self._calculate_maturity(skill)
        reusability = self._calculate_reusability(skill, pattern)
        
        # Calculate weighted overall score
        overall = (
            reliability * self.WEIGHTS["reliability"] +
            efficiency * self.WEIGHTS["efficiency"] +
            maturity * self.WEIGHTS["maturity"] +
            reusability * self.WEIGHTS["reusability"]
        )
        
        # Determine grade
        grade = self._calculate_grade(overall)
        
        return QualityScore(
            overall_score=overall,
            grade=grade,
            reliability_score=reliability,
            efficiency_score=efficiency,
            maturity_score=maturity,
            reusability_score=reusability,
            details={
                "use_count": skill.use_count,
                "success_count": skill.success_count,
                "pattern_occurrences": pattern.occurrence_count if pattern else 0,
                "avg_duration_ms": pattern.avg_duration_ms if pattern else 0,
                "tools_count": len(pattern.tools_used) if pattern else 0,
                "steps_count": len(pattern.steps) if pattern else 0,
            },
        )
    
    def _calculate_reliability(
        self,
        skill: Skill,
        pattern: Optional[Pattern] = None,
    ) -> float:
        """
        Calculate reliability score based on success rate.
        
        Formula:
        - If we have skill usage data: success_count / use_count
        - If we have pattern data: pattern.success_rate
        - Default: 0.5 (unknown)
        """
        # Prefer skill-level success rate
        if skill.use_count > 0:
            return skill.success_count / skill.use_count
        
        # Fall back to pattern-level success rate
        if pattern and pattern.occurrence_count > 0:
            return pattern.success_rate
        
        # Default: assume moderate reliability
        return 0.5
    
    def _calculate_efficiency(
        self,
        skill: Skill,
        pattern: Optional[Pattern] = None,
    ) -> float:
        """
        Calculate efficiency score based on duration.
        
        Formula:
        - score = 1.0 - min(1.0, avg_duration / baseline_duration)
        - Faster workflows get higher scores
        """
        # Get average duration from pattern
        if pattern and pattern.avg_duration_ms > 0:
            duration = pattern.avg_duration_ms
        else:
            # No duration data: assume moderate efficiency
            return 0.5
        
        # Calculate efficiency: faster = better
        # Score decreases as duration increases
        efficiency = 1.0 - min(1.0, duration / self.BASELINE_DURATION_MS)
        
        # Ensure minimum score
        return max(0.1, efficiency)
    
    def _calculate_maturity(self, skill: Skill) -> float:
        """
        Calculate maturity score based on usage count and history.
        
        Formula:
        - score = min(1.0, log2(use_count + 1) / 10)
        - More usage = higher maturity (with diminishing returns)
        """
        import math
        
        if skill.use_count <= 0:
            return 0.0
        
        # Logarithmic scale: 1 use = 0.1, 10 uses = 0.33, 100 uses = 0.66, 1000 uses = 1.0
        maturity = math.log2(skill.use_count + 1) / 10
        
        return min(1.0, maturity)
    
    def _calculate_reusability(
        self,
        skill: Skill,
        pattern: Optional[Pattern] = None,
    ) -> float:
        """
        Calculate reusability score based on generalization potential.
        
        Factors:
        - Fewer dependencies = more reusable
        - Fewer tools required = more reusable
        - Generic category = more reusable
        - Has tags = more reusable
        """
        score = 0.5  # Base score
        
        # Fewer dependencies = more reusable
        if pattern:
            num_edges = len(pattern.edges)
            if num_edges == 0:
                score += 0.2  # No dependencies = highly reusable
            elif num_edges <= 2:
                score += 0.1
            else:
                score -= 0.1 * (num_edges - 2)  # Penalty for complexity
        
        # Fewer tools = more reusable (simpler to set up)
        if pattern:
            num_tools = len(pattern.tools_used)
            if num_tools == 0:
                score += 0.1
            elif num_tools <= 2:
                score += 0.05
            else:
                score -= 0.05 * (num_tools - 2)
        
        # Generic categories are more reusable
        generic_categories = ["custom", "automation", "productivity"]
        if skill.category in generic_categories:
            score += 0.1
        
        # Having tags suggests better documentation
        if len(skill.tags) >= 3:
            score += 0.1
        
        # Clamp to [0, 1]
        return max(0.0, min(1.0, score))
    
    def _calculate_grade(self, score: float) -> str:
        """Calculate letter grade from numeric score."""
        if score >= self.GRADE_THRESHOLDS["A"]:
            return "A"
        elif score >= self.GRADE_THRESHOLDS["B"]:
            return "B"
        elif score >= self.GRADE_THRESHOLDS["C"]:
            return "C"
        elif score >= self.GRADE_THRESHOLDS["D"]:
            return "D"
        else:
            return "F"
    
    def rank_skills(
        self,
        skills: list[Skill],
        patterns: Optional[dict[str, Pattern]] = None,
    ) -> list[tuple[Skill, QualityScore]]:
        """
        Rank skills by quality score.
        
        Args:
            skills: List of skills to rank
            patterns: Optional dict mapping pattern_id to Pattern
        
        Returns:
            List of (skill, score) tuples sorted by overall_score (highest first)
        """
        scored = []
        
        for skill in skills:
            pattern = None
            if patterns and skill.pattern_id in patterns:
                pattern = patterns[skill.pattern_id]
            
            score = self.score_skill(skill, pattern)
            scored.append((skill, score))
        
        # Sort by overall score (highest first)
        scored.sort(key=lambda x: x[1].overall_score, reverse=True)
        
        return scored
    
    def update_score(
        self,
        skill: Skill,
        success: bool,
        duration_ms: Optional[int] = None,
    ) -> QualityScore:
        """
        Update skill score after a new execution.
        
        Args:
            skill: The skill to update
            success: Whether the execution succeeded
            duration_ms: Optional duration of the execution
        
        Returns:
            Updated QualityScore
        """
        # Update usage counts
        skill.use_count += 1
        if success:
            skill.success_count += 1
        
        # Update last used timestamp
        import time
        skill.last_used_at = time.time()
        
        # Recalculate scores
        score = self.score_skill(skill)
        
        # Update skill's quality scores
        skill.quality_score = score.overall_score
        skill.reliability_score = score.reliability_score
        skill.efficiency_score = score.efficiency_score
        skill.maturity_score = score.maturity_score
        skill.reusability_score = score.reusability_score
        skill.updated_at = time.time()
        
        return score
