"""Context providers for SoloFlow.

Implements Microsoft Agent Framework-style pluggable context providers:
- Chat history
- Long-term memory
- RAG retrieval
- Custom providers
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger("soloflow.context")


@dataclass
class ContextItem:
    """A single context item."""
    
    source: str  # chat_history, long_term_memory, rag, custom
    content: str
    relevance: float = 1.0
    metadata: dict = field(default_factory=dict)
    
    def to_dict(self) -> dict:
        return {
            "source": self.source,
            "content": self.content,
            "relevance": self.relevance,
            "metadata": self.metadata,
        }


class ContextProvider(ABC):
    """Base class for context providers.
    
    Key insight from Microsoft Agent Framework:
    - Context providers are pluggable
    - Each provider contributes context independently
    - Context is merged before passing to LLM
    """
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name."""
        ...
    
    @abstractmethod
    async def get_context(
        self,
        query: str,
        user_id: str = "default",
        limit: int = 10,
    ) -> list[ContextItem]:
        """Get context items for a query."""
        ...
    
    async def add_context(
        self,
        content: str,
        user_id: str = "default",
        metadata: dict | None = None,
    ) -> None:
        """Add context (optional, not all providers support this)."""
        pass


class ChatHistoryProvider(ContextProvider):
    """Provides recent chat history as context."""
    
    def __init__(self, max_items: int = 50) -> None:
        self._history: list[dict] = []
        self._max_items = max_items
    
    @property
    def name(self) -> str:
        return "chat_history"
    
    async def get_context(
        self,
        query: str,
        user_id: str = "default",
        limit: int = 10,
    ) -> list[ContextItem]:
        """Get recent chat history."""
        items = []
        for msg in self._history[-limit:]:
            items.append(ContextItem(
                source="chat_history",
                content=msg.get("content", ""),
                relevance=0.8,
                metadata={"role": msg.get("role", "user")},
            ))
        return items
    
    async def add_context(
        self,
        content: str,
        user_id: str = "default",
        metadata: dict | None = None,
    ) -> None:
        """Add a message to chat history."""
        self._history.append({
            "content": content,
            "user_id": user_id,
            "metadata": metadata or {},
        })
        
        # Enforce max items
        if len(self._history) > self._max_items:
            self._history = self._history[-self._max_items:]


class LongTermMemoryProvider(ContextProvider):
    """Provides long-term memory as context."""
    
    def __init__(self) -> None:
        self._memories: dict[str, dict] = {}
    
    @property
    def name(self) -> str:
        return "long_term_memory"
    
    async def get_context(
        self,
        query: str,
        user_id: str = "default",
        limit: int = 10,
    ) -> list[ContextItem]:
        """Get relevant memories."""
        # Simple keyword matching (would use vector search in production)
        items = []
        query_lower = query.lower()
        
        for memory_id, memory in self._memories.items():
            content = memory.get("content", "")
            if query_lower in content.lower():
                items.append(ContextItem(
                    source="long_term_memory",
                    content=content,
                    relevance=0.9,
                    metadata=memory.get("metadata", {}),
                ))
        
        return items[:limit]
    
    async def add_context(
        self,
        content: str,
        user_id: str = "default",
        metadata: dict | None = None,
    ) -> None:
        """Add a memory."""
        import uuid
        memory_id = str(uuid.uuid4())
        self._memories[memory_id] = {
            "content": content,
            "user_id": user_id,
            "metadata": metadata or {},
        }


class RAGProvider(ContextProvider):
    """Provides RAG retrieval as context."""
    
    def __init__(self, documents: list[dict] | None = None) -> None:
        self._documents = documents or []
    
    @property
    def name(self) -> str:
        return "rag"
    
    async def get_context(
        self,
        query: str,
        user_id: str = "default",
        limit: int = 10,
    ) -> list[ContextItem]:
        """Get relevant documents."""
        # Simple keyword matching (would use vector search in production)
        items = []
        query_lower = query.lower()
        
        for doc in self._documents:
            content = doc.get("content", "")
            if query_lower in content.lower():
                items.append(ContextItem(
                    source="rag",
                    content=content,
                    relevance=0.85,
                    metadata=doc.get("metadata", {}),
                ))
        
        return items[:limit]


class ContextManager:
    """Manages multiple context providers.
    
    Key pattern from Microsoft Agent Framework:
    - Multiple providers contribute context independently
    - Context is merged and ranked
    - Only relevant context is passed to LLM
    """
    
    def __init__(self) -> None:
        self._providers: dict[str, ContextProvider] = {}
    
    def register_provider(self, provider: ContextProvider) -> None:
        """Register a context provider."""
        self._providers[provider.name] = provider
    
    def get_provider(self, name: str) -> Optional[ContextProvider]:
        """Get a provider by name."""
        return self._providers.get(name)
    
    async def get_context(
        self,
        query: str,
        user_id: str = "default",
        limit: int = 20,
    ) -> list[ContextItem]:
        """Get context from all providers.
        
        Merges and ranks context from all providers.
        """
        all_items = []
        
        for provider in self._providers.values():
            try:
                items = await provider.get_context(query, user_id, limit=5)
                all_items.extend(items)
            except Exception as e:
                logger.warning(f"Provider {provider.name} failed: {e}")
        
        # Sort by relevance
        all_items.sort(key=lambda x: x.relevance, reverse=True)
        
        return all_items[:limit]
    
    async def add_context(
        self,
        content: str,
        provider_name: str | None = None,
        user_id: str = "default",
        metadata: dict | None = None,
    ) -> None:
        """Add context to a specific provider or all providers."""
        if provider_name:
            provider = self._providers.get(provider_name)
            if provider:
                await provider.add_context(content, user_id, metadata)
        else:
            for provider in self._providers.values():
                try:
                    await provider.add_context(content, user_id, metadata)
                except Exception as e:
                    logger.warning(f"Provider {provider.name} add failed: {e}")
    
    def list_providers(self) -> list[str]:
        """List all registered providers."""
        return list(self._providers.keys())
