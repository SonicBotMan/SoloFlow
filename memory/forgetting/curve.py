"""Ebbinghaus Forgetting Curve implementation for SoloFlow.

Implements the mathematical model of memory decay:
    R(t) = base * e^(-t / stability)

Where:
    R(t) = retention at time t
    base = initial retention (1.0 = 100%)
    t = time elapsed since last access
    stability = memory stability (higher = slower decay)
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class MemoryEntry:
    """A memory entry with forgetting curve parameters."""
    
    key: str
    content: dict
    created_at: float = field(default_factory=time.time)
    last_access_at: float = field(default_factory=time.time)
    access_count: int = 0
    stability: float = 1.0
    base_retention: float = 1.0
    
    @property
    def time_since_last_access(self) -> float:
        """Time elapsed since last access (in seconds)."""
        return time.time() - self.last_access_at
    
    @property
    def age(self) -> float:
        """Total age of this memory (in seconds)."""
        return time.time() - self.created_at
    
    def current_retention(self, curve: Optional[ForgettingCurve] = None) -> float:
        """Calculate current retention using forgetting curve."""
        if curve is None:
            curve = ForgettingCurve()
        return curve.retention(self.time_since_last_access, self.stability, self.base_retention)
    
    def access(self) -> None:
        """Record an access to this memory."""
        self.access_count += 1
        self.last_access_at = time.time()
    
    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "key": self.key,
            "content": self.content,
            "created_at": self.created_at,
            "last_access_at": self.last_access_at,
            "access_count": self.access_count,
            "stability": self.stability,
            "base_retention": self.base_retention,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> MemoryEntry:
        """Create from dictionary."""
        return cls(
            key=data["key"],
            content=data["content"],
            created_at=data.get("created_at", time.time()),
            last_access_at=data.get("last_access_at", time.time()),
            access_count=data.get("access_count", 0),
            stability=data.get("stability", 1.0),
            base_retention=data.get("base_retention", 1.0),
        )


class ForgettingCurve:
    """Ebbinghaus forgetting curve implementation.
    
    The forgetting curve describes how memory decays over time:
        R(t) = base * e^(-t / stability)
    
    Where:
        - R(t) is the retention at time t
        - base is the initial retention (typically 1.0)
        - t is the time elapsed
        - stability is the memory stability factor
    
    Higher stability means slower decay. Stability increases with
    each successful retrieval (spacing effect).
    """
    
    # Default parameters
    DEFAULT_STABILITY = 1.0
    DEFAULT_BASE_RETENTION = 1.0
    
    # Stability growth factor (how much stability increases per access)
    STABILITY_GROWTH_FACTOR = 1.5
    
    # Minimum retention threshold (below this, memory is considered "forgotten")
    MIN_RETENTION_THRESHOLD = 0.1
    
    def __init__(
        self,
        stability_growth_factor: float = STABILITY_GROWTH_FACTOR,
        min_retention_threshold: float = MIN_RETENTION_THRESHOLD,
    ) -> None:
        self.stability_growth_factor = stability_growth_factor
        self.min_retention_threshold = min_retention_threshold
    
    def retention(
        self,
        time_elapsed: float,
        stability: float = DEFAULT_STABILITY,
        base_retention: float = DEFAULT_BASE_RETENTION,
    ) -> float:
        """Calculate retention at a given time.
        
        Args:
            time_elapsed: Time elapsed since last access (in seconds)
            stability: Memory stability factor
            base_retention: Initial retention (0.0 to 1.0)
            
        Returns:
            Retention value (0.0 to 1.0)
        """
        if stability <= 0:
            return 0.0
        
        retention = base_retention * math.exp(-time_elapsed / stability)
        return max(0.0, min(1.0, retention))
    
    def should_consolidate(
        self,
        entry: MemoryEntry,
        threshold: float | None = None,
    ) -> bool:
        """Determine if a memory should be consolidated.
        
        A memory should be consolidated if its current retention
        has dropped below the threshold.
        
        Args:
            entry: Memory entry to check
            threshold: Retention threshold (default: min_retention_threshold)
            
        Returns:
            True if memory should be consolidated
        """
        if threshold is None:
            threshold = self.min_retention_threshold
        
        current_retention = entry.current_retention(self)
        return current_retention < threshold
    
    def consolidate(self, entry: MemoryEntry) -> MemoryEntry:
        """Consolidate a memory (increase stability).
        
        When a memory is successfully retrieved, its stability
        increases, making it decay slower in the future.
        
        Args:
            entry: Memory entry to consolidate
            
        Returns:
            Updated memory entry
        """
        # Increase stability
        entry.stability *= self.stability_growth_factor
        
        # Reset retention base
        entry.base_retention = 1.0
        
        # Record access
        entry.access()
        
        return entry
    
    def time_until_forget(
        self,
        stability: float = DEFAULT_STABILITY,
        base_retention: float = DEFAULT_BASE_RETENTION,
        target_retention: float = 0.5,
    ) -> float:
        """Calculate time until retention drops to target.
        
        Args:
            stability: Memory stability factor
            base_retention: Initial retention
            target_retention: Target retention level
            
        Returns:
            Time in seconds until retention drops to target
        """
        if base_retention <= 0 or target_retention <= 0:
            return 0.0
        
        # R(t) = base * e^(-t / stability)
        # target = base * e^(-t / stability)
        # t = -stability * ln(target / base)
        ratio = target_retention / base_retention
        if ratio >= 1.0:
            return float('inf')
        
        return -stability * math.log(ratio)
    
    def decay_schedule(
        self,
        stability: float = DEFAULT_STABILITY,
        base_retention: float = DEFAULT_BASE_RETENTION,
        num_points: int = 10,
    ) -> list[tuple[float, float]]:
        """Generate a decay schedule showing retention over time.
        
        Args:
            stability: Memory stability factor
            base_retention: Initial retention
            num_points: Number of points to generate
            
        Returns:
            List of (time, retention) tuples
        """
        # Calculate time until 10% retention
        max_time = self.time_until_forget(stability, base_retention, 0.1)
        
        schedule = []
        for i in range(num_points):
            t = (i / (num_points - 1)) * max_time
            r = self.retention(t, stability, base_retention)
            schedule.append((t, r))
        
        return schedule
