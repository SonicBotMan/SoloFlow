"""Task classifier for SoloFlow discipline-aware routing.

Classifies tasks by complexity and determines the appropriate
agent discipline for execution.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Any


class Discipline(str, Enum):
    """Agent discipline types.
    
    Each discipline represents a different execution strategy:
    - quick: Fast single-shot responses (~2s)
    - deep: Extended reasoning (~30s)
    - visual: UI and image tasks
    - ultrabrain: Multi-agent coordination for complex tasks
    """
    
    QUICK = "quick"
    DEEP = "deep"
    VISUAL = "visual"
    ULTRABRAIN = "ultrabrain"


@dataclass
class DisciplineConfig:
    """Configuration for a discipline."""
    
    name: Discipline
    max_tokens: int
    timeout_seconds: int
    description: str
    
    # Execution parameters
    temperature: float = 0.7
    use_chain_of_thought: bool = False
    parallel_agents: int = 1


# Default discipline configurations
DISCIPLINE_CONFIGS: dict[Discipline, DisciplineConfig] = {
    Discipline.QUICK: DisciplineConfig(
        name=Discipline.QUICK,
        max_tokens=500,
        timeout_seconds=10,
        description="Fast single-shot responses for simple tasks",
        temperature=0.3,
        use_chain_of_thought=False,
        parallel_agents=1,
    ),
    Discipline.DEEP: DisciplineConfig(
        name=Discipline.DEEP,
        max_tokens=4000,
        timeout_seconds=60,
        description="Extended reasoning for complex analysis",
        temperature=0.7,
        use_chain_of_thought=True,
        parallel_agents=1,
    ),
    Discipline.VISUAL: DisciplineConfig(
        name=Discipline.VISUAL,
        max_tokens=2000,
        timeout_seconds=30,
        description="UI and image generation tasks",
        temperature=0.5,
        use_chain_of_thought=False,
        parallel_agents=1,
    ),
    Discipline.ULTRABRAIN: DisciplineConfig(
        name=Discipline.ULTRABRAIN,
        max_tokens=8000,
        timeout_seconds=120,
        description="Multi-agent coordination for hard problems",
        temperature=0.8,
        use_chain_of_thought=True,
        parallel_agents=3,
    ),
}


@dataclass
class ClassificationResult:
    """Result of task classification."""
    
    discipline: Discipline
    confidence: float  # 0.0 to 1.0
    reasoning: str
    features: dict[str, Any]
    
    @property
    def config(self) -> DisciplineConfig:
        """Get the discipline configuration."""
        return DISCIPLINE_CONFIGS[self.discipline]


class TaskClassifier:
    """Classifies tasks by complexity and determines discipline.
    
    Uses a rule-based approach with optional LLM fallback:
    1. Extract features from task description
    2. Apply rules to determine discipline
    3. Return classification with confidence score
    
    Usage:
        classifier = TaskClassifier()
        result = classifier.classify("Summarize this article in 3 bullet points")
        print(result.discipline)  # Discipline.QUICK
    """
    
    # Feature extraction patterns
    PATTERNS = {
        # Complexity indicators
        "simple": [
            r"\b(summarize|list|count|find|get|show|display)\b",
            r"\b(yes/no|true/false|boolean)\b",
            r"\b(one|single|simple|quick|brief)\b",
        ],
        "complex": [
            r"\b(analyze|compare|evaluate|assess|design|architect)\b",
            r"\b(explain why|reason about|think through|consider)\b",
            r"\b(multiple|several|various|different)\b",
            r"\b(step.by.step|detailed|comprehensive|thorough)\b",
        ],
        "visual": [
            r"\b(image|photo|picture|diagram|chart|graph|visual)\b",
            r"\b(draw|sketch|illustrate|render|generate)\b",
            r"\b(ui|ux|interface|design|layout|mockup)\b",
            r"\b(css|html|svg|canvas|webgl)\b",
        ],
        "multi_agent": [
            r"\b(debate|discuss|collaborate|coordinate)\b",
            r"\b(multiple perspectives|different viewpoints)\b",
            r"\b(team|group|committee|panel)\b",
            r"\b(brainstorm|ideate|explore options)\b",
        ],
        
        # Length indicators
        "short_input": [
            r"^.{0,100}$",
        ],
        "long_input": [
            r"^.{500,}$",
        ],
        
        # Task type indicators
        "code": [
            r"\b(code|program|function|class|method|api)\b",
            r"\b(debug|fix|refactor|optimize)\b",
            r"\b(python|javascript|typescript|java|c\+\+)\b",
        ],
        "writing": [
            r"\b(write|draft|compose|author|essay|article)\b",
            r"\b(blog|post|report|document|story)\b",
        ],
        "research": [
            r"\b(research|investigate|study|survey|review)\b",
            r"\b(literature|papers|articles|sources)\b",
        ],
        "math": [
            r"\b(calculate|compute|solve|equation|formula)\b",
            r"\b(math|statistics|probability|algebra)\b",
        ],
    }
    
    # Rule weights for classification
    RULE_WEIGHTS = {
        Discipline.QUICK: {
            "simple": 0.4,
            "short_input": 0.2,
            "code": 0.1,
            "writing": 0.1,
        },
        Discipline.DEEP: {
            "complex": 0.3,
            "long_input": 0.2,
            "research": 0.2,
            "math": 0.2,
            "code": 0.1,
        },
        Discipline.VISUAL: {
            "visual": 0.8,
            "writing": 0.1,
        },
        Discipline.ULTRABRAIN: {
            "multi_agent": 0.4,
            "complex": 0.3,
            "long_input": 0.2,
        },
    }
    
    def __init__(self, custom_patterns: dict[str, list[str]] | None = None) -> None:
        """Initialize the classifier.
        
        Args:
            custom_patterns: Additional patterns to add
        """
        self.patterns = dict(self.PATTERNS)
        if custom_patterns:
            self.patterns.update(custom_patterns)
        
        # Compile patterns
        self._compiled_patterns: dict[str, list[re.Pattern]] = {}
        for name, patterns in self.patterns.items():
            self._compiled_patterns[name] = [
                re.compile(p, re.IGNORECASE) for p in patterns
            ]
    
    def extract_features(self, task_description: str) -> dict[str, bool]:
        """Extract features from task description.
        
        Args:
            task_description: Task description text
            
        Returns:
            Dictionary of feature name -> present
        """
        features = {}
        
        for name, patterns in self._compiled_patterns.items():
            features[name] = any(
                p.search(task_description) for p in patterns
            )
        
        return features
    
    def classify(self, task_description: str) -> ClassificationResult:
        """Classify a task and determine discipline.
        
        Args:
            task_description: Task description text
            
        Returns:
            ClassificationResult with discipline and confidence
        """
        features = self.extract_features(task_description)
        
        # Calculate scores for each discipline
        scores: dict[Discipline, float] = {}
        
        for discipline, weights in self.RULE_WEIGHTS.items():
            score = 0.0
            for feature, weight in weights.items():
                if features.get(feature, False):
                    score += weight
            scores[discipline] = score
        
        # Find best discipline
        best_discipline = max(scores, key=lambda d: scores[d])
        best_score = scores[best_discipline]
        
        # If no strong signal, default to DEEP
        if best_score < 0.2:
            best_discipline = Discipline.DEEP
            best_score = 0.5
        
        # Normalize confidence to [0, 1]
        confidence = min(1.0, best_score)
        
        # Generate reasoning
        reasoning = self._generate_reasoning(best_discipline, features, scores)
        
        return ClassificationResult(
            discipline=best_discipline,
            confidence=confidence,
            reasoning=reasoning,
            features=features,
        )
    
    def _generate_reasoning(
        self,
        discipline: Discipline,
        features: dict[str, bool],
        scores: dict[Discipline, float],
    ) -> str:
        """Generate human-readable reasoning for classification."""
        active_features = [name for name, active in features.items() if active]
        
        if not active_features:
            return f"No strong features detected, defaulting to {discipline.value}"
        
        feature_str = ", ".join(active_features[:3])
        return (
            f"Detected features: {feature_str}. "
            f"Scores: {', '.join(f'{d.value}={s:.2f}' for d, s in scores.items())}. "
            f"Selected: {discipline.value}"
        )
    
    def classify_batch(self, task_descriptions: list[str]) -> list[ClassificationResult]:
        """Classify multiple tasks.
        
        Args:
            task_descriptions: List of task descriptions
            
        Returns:
            List of classification results
        """
        return [self.classify(desc) for desc in task_descriptions]
