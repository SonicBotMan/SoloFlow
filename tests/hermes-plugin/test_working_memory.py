"""Tests for memory working memory."""

import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from memory.working_memory import WorkingMemory

@pytest.fixture
def memory():
    return WorkingMemory(max_size=3)

def test_put_and_get(memory):
    memory.put("key1", {"value": "a"})
    result = memory.get("key1")
    assert result == {"value": "a"}

def test_get_nonexistent(memory):
    result = memory.get("nonexistent")
    assert result is None

def test_eviction(memory):
    memory.put("key1", {"value": "a"})
    memory.put("key2", {"value": "b"})
    memory.put("key3", {"value": "c"})
    memory.put("key4", {"value": "d"})  # Should evict key1
    
    assert memory.get("key1") is None
    assert memory.get("key4") is not None

def test_search(memory):
    memory.put("topic_ai", {"content": "artificial intelligence"})
    memory.put("topic_ml", {"content": "machine learning"})
    memory.put("topic_web", {"content": "web development"})
    
    results = memory.search("artificial")
    assert len(results) > 0
    assert results[0]["key"] == "topic_ai"

def test_len(memory):
    assert len(memory) == 0
    memory.put("key1", {"value": "a"})
    assert len(memory) == 1

def test_contains(memory):
    assert "key1" not in memory
    memory.put("key1", {"value": "a"})
    assert "key1" in memory

def test_clear(memory):
    memory.put("key1", {"value": "a"})
    memory.put("key2", {"value": "b"})
    memory.clear()
    assert len(memory) == 0
