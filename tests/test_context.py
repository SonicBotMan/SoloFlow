"""Tests for context providers (Microsoft Agent Framework-inspired)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "hermes-plugin"))

from context import (
    ChatHistoryProvider,
    ContextItem,
    ContextManager,
    LongTermMemoryProvider,
    RAGProvider,
)


class TestContextItem:
    """Tests for ContextItem dataclass."""

    def test_basic_creation(self):
        item = ContextItem(source="test", content="hello")
        assert item.source == "test"
        assert item.content == "hello"
        assert item.relevance == 1.0
        assert item.metadata == {}

    def test_to_dict(self):
        item = ContextItem(
            source="chat_history",
            content="hello world",
            relevance=0.8,
            metadata={"role": "user"},
        )
        d = item.to_dict()
        assert d["source"] == "chat_history"
        assert d["content"] == "hello world"
        assert d["relevance"] == 0.8
        assert d["metadata"] == {"role": "user"}


class TestChatHistoryProvider:
    """Tests for ChatHistoryProvider."""

    @pytest.mark.asyncio
    async def test_add_and_get(self):
        provider = ChatHistoryProvider(max_items=10)
        assert provider.name == "chat_history"

        await provider.add_context("hello", user_id="u1")
        await provider.add_context("world", user_id="u1")

        items = await provider.get_context("query", user_id="u1", limit=5)
        assert len(items) == 2
        assert items[0].content == "hello"
        assert items[1].content == "world"

    @pytest.mark.asyncio
    async def test_max_items_eviction(self):
        provider = ChatHistoryProvider(max_items=3)

        for i in range(5):
            await provider.add_context(f"msg_{i}")

        items = await provider.get_context("query", limit=10)
        assert len(items) == 3
        assert items[0].content == "msg_2"  # oldest kept
        assert items[2].content == "msg_4"  # newest


class TestLongTermMemoryProvider:
    """Tests for LongTermMemoryProvider."""

    @pytest.mark.asyncio
    async def test_add_and_search(self):
        provider = LongTermMemoryProvider()
        assert provider.name == "long_term_memory"

        await provider.add_context("Python is great")
        await provider.add_context("JavaScript is popular")
        await provider.add_context("Python has type hints")

        items = await provider.get_context("python", limit=10)
        assert len(items) == 2
        for item in items:
            assert "python" in item.content.lower() or "Python" in item.content

    @pytest.mark.asyncio
    async def test_no_match(self):
        provider = LongTermMemoryProvider()
        await provider.add_context("hello world")

        items = await provider.get_context("xyz", limit=10)
        assert len(items) == 0


class TestRAGProvider:
    """Tests for RAGProvider."""

    @pytest.mark.asyncio
    async def test_search_documents(self):
        provider = RAGProvider(
            documents=[
                {"content": "Python tutorial", "metadata": {"id": 1}},
                {"content": "JavaScript guide", "metadata": {"id": 2}},
                {"content": "Advanced Python", "metadata": {"id": 3}},
            ]
        )
        assert provider.name == "rag"

        items = await provider.get_context("python", limit=10)
        assert len(items) == 2

    @pytest.mark.asyncio
    async def test_empty_documents(self):
        provider = RAGProvider()
        items = await provider.get_context("query", limit=10)
        assert len(items) == 0


class TestContextManager:
    """Tests for ContextManager."""

    @pytest.mark.asyncio
    async def test_register_and_list(self):
        manager = ContextManager()
        manager.register_provider(ChatHistoryProvider())
        manager.register_provider(LongTermMemoryProvider())

        providers = manager.list_providers()
        assert "chat_history" in providers
        assert "long_term_memory" in providers

    @pytest.mark.asyncio
    async def test_get_context_merges(self):
        manager = ContextManager()

        chat = ChatHistoryProvider()
        await chat.add_context("chat message")
        manager.register_provider(chat)

        ltm = LongTermMemoryProvider()
        await ltm.add_context("chat message stored in memory")
        manager.register_provider(ltm)

        items = await manager.get_context("chat", limit=10)
        assert len(items) == 2
        # Both providers contribute
        sources = {item.source for item in items}
        assert "chat_history" in sources
        assert "long_term_memory" in sources

    @pytest.mark.asyncio
    async def test_sorted_by_relevance(self):
        manager = ContextManager()

        ltm = LongTermMemoryProvider()  # relevance 0.9
        await ltm.add_context("test content")
        manager.register_provider(ltm)

        chat = ChatHistoryProvider()  # relevance 0.8
        await chat.add_context("test content")
        manager.register_provider(chat)

        items = await manager.get_context("test", limit=10)
        assert len(items) == 2
        assert items[0].relevance >= items[1].relevance

    @pytest.mark.asyncio
    async def test_add_to_specific_provider(self):
        manager = ContextManager()

        chat = ChatHistoryProvider()
        ltm = LongTermMemoryProvider()
        manager.register_provider(chat)
        manager.register_provider(ltm)

        await manager.add_context("hello", provider_name="chat_history")

        chat_items = await chat.get_context("hello")
        ltm_items = await ltm.get_context("hello")
        assert len(chat_items) == 1
        assert len(ltm_items) == 0

    @pytest.mark.asyncio
    async def test_get_provider(self):
        manager = ContextManager()
        chat = ChatHistoryProvider()
        manager.register_provider(chat)

        assert manager.get_provider("chat_history") is chat
        assert manager.get_provider("nonexistent") is None
