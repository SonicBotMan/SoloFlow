"""Discipline-Aware Routing for SoloFlow.

Automatically classifies tasks by complexity and routes them
to the appropriate agent discipline.
"""

from .classifier import TaskClassifier, Discipline, ClassificationResult
from .router import DisciplineRouter

__all__ = ["TaskClassifier", "Discipline", "ClassificationResult", "DisciplineRouter"]
