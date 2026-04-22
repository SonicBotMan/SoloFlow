"""Simple LRU working memory implementation."""

from collections import OrderedDict
from typing import Optional


class WorkingMemory:
    """Fast LRU-backed working memory for immediate context."""

    def __init__(self, max_size: int = 100):
        self._max_size = max(0, max_size)
        self._memory: OrderedDict[str, dict] = OrderedDict()

    def put(self, key: str, value: dict) -> None:
        if self._max_size <= 0:
            return

        if key in self._memory:
            self._memory.move_to_end(key)

        self._memory[key] = value

        while len(self._memory) > self._max_size:
            self._memory.popitem(last=False)

    def get(self, key: str) -> Optional[dict]:
        if key not in self._memory:
            return None
        self._memory.move_to_end(key)
        return self._memory[key]

    def search(self, query: str, limit: int = 5) -> list[dict]:
        query_lower = query.lower()
        query_words = set(query_lower.split())

        results = []
        for key, value in reversed(self._memory.items()):
            score = 0

            if query_lower in key.lower():
                score += 2

            value_str = str(value).lower()
            for word in query_words:
                if word in value_str:
                    score += 1

            if score > 0:
                results.append({
                    "key": key,
                    "value": value,
                    "score": score,
                    "timestamp": value.get("timestamp", 0),
                })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:limit]

    def clear(self) -> None:
        self._memory.clear()

    def __len__(self) -> int:
        return len(self._memory)

    def __contains__(self, key: str) -> bool:
        return key in self._memory

    def get_all(self) -> list[dict]:
        return [{"key": k, "value": v} for k, v in self._memory.items()]

    def evict_oldest(self, count: int = 1) -> list[dict]:
        evicted = []
        for _ in range(min(count, len(self._memory))):
            key, value = self._memory.popitem(last=False)
            evicted.append({"key": key, "value": value})
        return evicted
