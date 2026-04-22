"""Memory system facade providing unified access to all memory tiers."""

from memory.working_memory import WorkingMemory
from memory.episodic_memory import EpisodicMemory
from memory.semantic_memory import SemanticMemory


class MemorySystem:
    """Unified memory system facade.

    Provides access to three memory tiers:
    - Working: Fast LRU cache for immediate context
    - Episodic: SQLite-backed conversation history
    - Semantic: Pattern extraction and template storage
    """

    def __init__(self, store):
        """Initialize the memory system.

        Args:
            store: SQLiteStore instance for persistence
        """
        self.working = WorkingMemory(max_size=100)
        self.episodic = EpisodicMemory(store)
        self.semantic = SemanticMemory(store)

    async def record_turn(
        self,
        session_id: str,
        user_content: str,
        assistant_content: str,
    ) -> dict:
        """Record a conversation turn to episodic memory.

        Args:
            session_id: Unique session identifier
            user_content: User's message content
            assistant_content: Assistant's response content

        Returns:
            Recorded episode dict
        """
        return await self.episodic.record(
            execution_id=session_id,
            event_type="turn",
            data={
                "user_content": user_content,
                "assistant_content": assistant_content,
            },
        )

    async def recall(
        self,
        query: str,
        limit: int = 10,
    ) -> list[dict]:
        """Search across all memory tiers.

        Args:
            query: Search query string
            limit: Maximum results to return

        Returns:
            List of matching memory entries from all tiers
        """
        results = []

        # Search working memory
        working_results = self.working.search(query, limit=limit)
        for r in working_results:
            r["memory_tier"] = "working"
            results.append(r)

        # Search episodic memory
        episodic_results = await self.episodic.search(query, limit=limit)
        for r in episodic_results:
            r["memory_tier"] = "episodic"
            results.append(r)

        # Search semantic memory
        semantic_results = await self.semantic.search(query, limit=limit)
        for r in semantic_results:
            r["memory_tier"] = "semantic"
            results.append(r)

        # Sort by relevance score if available, then by timestamp
        def sort_key(item):
            score = item.get("score", 0)
            timestamp = item.get("timestamp", 0)
            return (score, timestamp)

        results.sort(key=sort_key, reverse=True)
        return results[:limit]

    def get_context(self, query: str) -> str:
        """Get formatted memory context for prompts.

        Args:
            query: Query to search memories for

        Returns:
            Formatted string suitable for inclusion in prompts
        """
        import asyncio

        # Run sync search in working memory, async for others
        working_results = self.working.search(query, limit=3)

        context_parts = []

        if working_results:
            context_parts.append("## Recent Context (Working Memory)")
            for i, result in enumerate(working_results, 1):
                key = result.get("key", "unknown")
                value = result.get("value", {})
                context_parts.append(f"{i}. [{key}] {value}")

        # Try to get episodic context
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # Create a new loop if we're in an async context
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    future = pool.submit(
                        asyncio.run,
                        self.episodic.get_recent(limit=3)
                    )
                    episodic_results = future.result(timeout=5)
            else:
                episodic_results = asyncio.run(
                    self.episodic.get_recent(limit=3)
                )
        except Exception:
            episodic_results = []

        if episodic_results:
            context_parts.append("\n## Recent History (Episodic Memory)")
            for ep in episodic_results:
                data = ep.get("data", {})
                user = data.get("user_content", "")[:100]
                assistant = data.get("assistant_content", "")[:100]
                context_parts.append(
                    f"- User: {user}... | Assistant: {assistant}..."
                )

        if context_parts:
            return "\n".join(context_parts)
        return ""
