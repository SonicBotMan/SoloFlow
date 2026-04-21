"""Simple LRU working memory implementation."""

from collections import OrderedDict
from typing import Optional


class WorkingMemory:
    """Fast LRU-backed working memory for immediate context.

    Provides O(1) key-value storage with automatic eviction
    of least-recently-used entries when max_size is exceeded.
    """

    def __init__(self, max_size: int = 100):
        """Initialize working memory.

        Args:
            max_size: Maximum number of entries to store
        """
        self._max_size = max_size
        self._memory: OrderedDict[str, dict] = OrderedDict()

    def put(self, key: str, value: dict) -> None:
        """Store a value in working memory.

        If the key already exists, it's moved to the end (most recent).
        If storage is full, the least-recently-used entry is evicted.

        Args:
            key: Unique identifier for this memory entry
            value: Dict containing the memory data
        """
        if key in self._memory:
            # Move to end (most recently used)
            self._memory.move_to_end(key)

        self._memory[key] = value

        # Evict oldest if over capacity
        while len(self._memory) > self._max_size:
            self._memory.popitem(last=False)

    def get(self, key: str) -> Optional[dict]:
        """Retrieve a value from working memory.

        Accessing a key moves it to the end (most recently used).

        Args:
            key: Unique identifier for the memory entry

        Returns:
            The stored dict, or None if not found
        """
        if key not in self._memory:
            return None

        # Move to end (most recently used)
        self._memory.move_to_end(key)
        return self._memory[key]

    def search(self, query: str, limit: int = 5) -> list[dict]:
        """Search working memory for entries matching query.

        Performs simple keyword matching against stored values.

        Args:
            query: Search query string
            limit: Maximum number of results to return

        Returns:
            List of matching memory entries with relevance scores
        """
        query_lower = query.lower()
        query_words = set(query_lower.split())

        results = []
        for key, value in reversed(self._memory.items()):
            score = 0

            # Check key match
            if query_lower in key.lower():
                score += 2

            # Check value match
            value_str = str(value).lower()
            for word in query_words:
                if word in value_str:
                    score += 1

            if score > 0:
                results.append(
                    {
                        "key": key,
                        "value": value,
                        "score": score,
                        "timestamp": value.get("timestamp", 0),
                    }
                )

        # Sort by score descending
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:limit]

    def clear(self) -> None:
        """Clear all entries from working memory."""
        self._memory.clear()

    def __len__(self) -> int:
        """Return the number of entries in working memory."""
        return len(self._memory)

    def __contains__(self, key: str) -> bool:
        """Check if a key exists in working memory."""
        return key in self._memory

    def get_all(self) -> list[dict]:
        """Get all entries as a list, most recent last.

        Returns:
            List of all memory entries
        """
        return [{"key": k, "value": v} for k, v in self._memory.items()]

    def evict_oldest(self, count: int = 1) -> list[dict]:
        """Evict and return the oldest entries.

        Args:
            count: Number of entries to evict

        Returns:
            List of evicted entries
        """
        evicted = []
        for _ in range(min(count, len(self._memory))):
            key, value = self._memory.popitem(last=False)
            evicted.append({"key": key, "value": value})
        return evicted
