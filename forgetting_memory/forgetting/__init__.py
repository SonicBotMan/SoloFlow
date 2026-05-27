"""Ebbinghaus Forgetting Curve module for SoloFlow.

Implements memory decay modeling and automatic consolidation.
"""

from .curve import ForgettingCurve, MemoryEntry
from .consolidation import MemoryConsolidator

__all__ = ["ForgettingCurve", "MemoryEntry", "MemoryConsolidator"]
