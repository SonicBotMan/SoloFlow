"""Tests for Ebbinghaus Forgetting Curve implementation."""

from __future__ import annotations

import math
import sys
import time
from pathlib import Path

import pytest

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from memory.forgetting.curve import ForgettingCurve, MemoryEntry
from memory.forgetting.consolidation import MemoryConsolidator


@pytest.fixture
def curve():
    """Create a test forgetting curve."""
    return ForgettingCurve()


@pytest.fixture
def db_path(tmp_path):
    """Create a temporary database path."""
    return tmp_path / "test_memory.db"


@pytest.fixture
def consolidator(db_path):
    """Create a test memory consolidator."""
    return MemoryConsolidator(db_path=db_path, consolidation_interval=1.0)


class TestForgettingCurve:
    """Tests for ForgettingCurve."""
    
    def test_retention_at_zero(self, curve):
        """Retention at t=0 should be base_retention."""
        assert curve.retention(0) == 1.0
    
    def test_retention_decay(self, curve):
        """Retention should decay over time."""
        # At t=stability, retention should be ~37% (1/e)
        r = curve.retention(1.0, stability=1.0)
        assert abs(r - 1/math.e) < 0.01
    
    def test_retention_with_stability(self, curve):
        """Higher stability should mean slower decay."""
        r_low = curve.retention(10, stability=1.0)
        r_high = curve.retention(10, stability=10.0)
        assert r_high > r_low
    
    def test_retention_clamped(self, curve):
        """Retention should be clamped to [0, 1]."""
        assert curve.retention(0) == 1.0
        assert curve.retention(1000, stability=0.1) >= 0.0
    
    def test_should_consolidate(self, curve):
        """Should consolidate when retention is low."""
        entry = MemoryEntry(
            key="test",
            content={"data": "value"},
            last_access_at=time.time() - 100,  # 100 seconds ago
            stability=1.0,
        )
        # With stability=1.0 and 100 seconds elapsed, retention is very low
        assert curve.should_consolidate(entry) is True
    
    def test_consolidate_increases_stability(self, curve):
        """Consolidation should increase stability."""
        entry = MemoryEntry(
            key="test",
            content={"data": "value"},
            stability=1.0,
        )
        
        initial_stability = entry.stability
        entry = curve.consolidate(entry)
        
        assert entry.stability > initial_stability
        assert entry.access_count == 1
    
    def test_time_until_forget(self, curve):
        """Should calculate time until target retention."""
        # Time until 50% retention with stability=1.0
        t = curve.time_until_forget(stability=1.0, target_retention=0.5)
        # Should be approximately ln(2) ≈ 0.693
        assert abs(t - math.log(2)) < 0.01
    
    def test_decay_schedule(self, curve):
        """Should generate a decay schedule."""
        schedule = curve.decay_schedule(stability=1.0, num_points=5)
        
        assert len(schedule) == 5
        # First point should be at t=0 with retention=1.0
        assert schedule[0][1] == 1.0
        # Retention should decrease
        for i in range(1, len(schedule)):
            assert schedule[i][1] <= schedule[i-1][1]


class TestMemoryEntry:
    """Tests for MemoryEntry."""
    
    def test_creation(self):
        """Test creating a memory entry."""
        entry = MemoryEntry(
            key="test",
            content={"data": "value"},
        )
        
        assert entry.key == "test"
        assert entry.content == {"data": "value"}
        assert entry.access_count == 0
        assert entry.stability == 1.0
    
    def test_access(self):
        """Test accessing a memory."""
        entry = MemoryEntry(key="test", content={})
        
        initial_time = entry.last_access_at
        time.sleep(0.01)
        entry.access()
        
        assert entry.access_count == 1
        assert entry.last_access_at > initial_time
    
    def test_current_retention(self):
        """Test calculating current retention."""
        entry = MemoryEntry(
            key="test",
            content={},
            last_access_at=time.time(),
            stability=1.0,
        )
        
        # Retention should be close to 1.0 right after creation
        r = entry.current_retention()
        assert r > 0.9
    
    def test_to_dict_from_dict(self):
        """Test serialization."""
        entry = MemoryEntry(
            key="test",
            content={"data": "value"},
            stability=2.0,
            access_count=5,
        )
        
        d = entry.to_dict()
        entry2 = MemoryEntry.from_dict(d)
        
        assert entry2.key == entry.key
        assert entry2.content == entry.content
        assert entry2.stability == entry.stability
        assert entry2.access_count == entry.access_count


class TestMemoryConsolidator:
    """Tests for MemoryConsolidator."""
    
    @pytest.mark.asyncio
    async def test_add_memory(self, consolidator):
        """Test adding a memory."""
        entry = await consolidator.add_memory(
            key="test",
            content={"data": "value"},
        )
        
        assert entry.key == "test"
        assert entry.content == {"data": "value"}
    
    @pytest.mark.asyncio
    async def test_get_memory(self, consolidator):
        """Test getting a memory."""
        await consolidator.add_memory(
            key="test",
            content={"data": "value"},
        )
        
        entry = await consolidator.get_memory("test")
        assert entry is not None
        assert entry.key == "test"
        assert entry.access_count == 1  # Accessed once
    
    @pytest.mark.asyncio
    async def test_get_nonexistent_memory(self, consolidator):
        """Test getting a nonexistent memory."""
        entry = await consolidator.get_memory("nonexistent")
        assert entry is None
    
    @pytest.mark.asyncio
    async def test_search_memories(self, consolidator):
        """Test searching memories."""
        await consolidator.add_memory("key1", {"topic": "AI"})
        await consolidator.add_memory("key2", {"topic": "ML"})
        await consolidator.add_memory("key3", {"topic": "AI"})
        
        results = await consolidator.search_memories("AI")
        assert len(results) == 2
    
    @pytest.mark.asyncio
    async def test_search_by_tier(self, consolidator):
        """Test searching by tier."""
        await consolidator.add_memory("key1", {"data": "a"}, tier="working")
        await consolidator.add_memory("key2", {"data": "b"}, tier="episodic")
        
        results = await consolidator.search_memories("data", tier="working")
        assert len(results) == 1
        assert results[0].key == "key1"
    
    @pytest.mark.asyncio
    async def test_consolidate_all(self, consolidator):
        """Test consolidating all memories."""
        # Add some memories
        await consolidator.add_memory("key1", {"data": "a"}, stability=1.0)
        await consolidator.add_memory("key2", {"data": "b"}, stability=1.0)
        
        stats = await consolidator.consolidate_all()
        
        assert "consolidated" in stats
        assert "expired" in stats
        assert "promoted" in stats
    
    @pytest.mark.asyncio
    async def test_get_memory_stats(self, consolidator):
        """Test getting memory stats."""
        await consolidator.add_memory("key1", {"data": "a"}, tier="working")
        await consolidator.add_memory("key2", {"data": "b"}, tier="episodic")
        
        stats = await consolidator.get_memory_stats()
        
        assert stats["total_active"] == 2
        assert "working" in stats
        assert "episodic" in stats


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
