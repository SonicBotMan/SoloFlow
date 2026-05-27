"""Tests for SoloFlow Discipline-Aware Routing."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from routing.classifier import TaskClassifier, Discipline, ClassificationResult
from routing.router import DisciplineRouter, Executor, RoutingResult


@pytest.fixture
def classifier():
    """Create a test classifier."""
    return TaskClassifier()


@pytest.fixture
def router(classifier):
    """Create a test router."""
    return DisciplineRouter(classifier=classifier)


class TestTaskClassifier:
    """Tests for TaskClassifier."""
    
    def test_simple_task(self, classifier):
        """Test classifying a simple task."""
        result = classifier.classify("Summarize this article in 3 bullet points")
        
        assert result.discipline == Discipline.QUICK
        assert result.confidence > 0
    
    def test_complex_task(self, classifier):
        """Test classifying a complex task."""
        result = classifier.classify(
            "Analyze the economic implications of AI adoption across multiple industries, "
            "considering both short-term disruptions and long-term benefits"
        )
        
        assert result.discipline == Discipline.DEEP
        assert result.confidence > 0
    
    def test_visual_task(self, classifier):
        """Test classifying a visual task."""
        result = classifier.classify("Generate an image of a sunset over mountains")
        
        assert result.discipline == Discipline.VISUAL
        assert result.confidence > 0
    
    def test_multi_agent_task(self, classifier):
        """Test classifying a multi-agent task."""
        result = classifier.classify(
            "Debate the pros and cons of remote work from multiple perspectives"
        )
        
        assert result.discipline == Discipline.ULTRABRAIN
        assert result.confidence > 0
    
    def test_code_task(self, classifier):
        """Test classifying a code task."""
        result = classifier.classify("Write a Python function to sort a list")
        
        # Code tasks can be QUICK or DEEP depending on complexity
        assert result.discipline in [Discipline.QUICK, Discipline.DEEP]
    
    def test_extract_features(self, classifier):
        """Test feature extraction."""
        features = classifier.extract_features("Analyze and compare these options")
        
        assert features["complex"] is True
        assert features["simple"] is False
    
    def test_classify_batch(self, classifier):
        """Test batch classification."""
        tasks = [
            "Summarize this",
            "Analyze the implications",
            "Draw a diagram",
        ]
        
        results = classifier.classify_batch(tasks)
        
        assert len(results) == 3
        assert results[0].discipline == Discipline.QUICK
        assert results[2].discipline == Discipline.VISUAL
    
    def test_ambiguous_task(self, classifier):
        """Test classification of ambiguous tasks."""
        # "Do something" might match simple patterns
        result = classifier.classify("Do something")
        
        # Should still return a valid discipline
        assert result.discipline in Discipline
        assert result.confidence >= 0


class TestDisciplineRouter:
    """Tests for DisciplineRouter."""
    
    def test_register_executor(self, router):
        """Test registering an executor."""
        async def handler(task: str) -> str:
            return f"Result: {task}"
        
        executor = Executor(
            name="quick-agent",
            discipline=Discipline.QUICK,
            handler=handler,
        )
        
        router.register_executor(executor)
        
        assert "quick-agent" in router.list_executors().get("quick", [])
    
    def test_route_task(self, router):
        """Test routing a task."""
        async def handler(task: str) -> str:
            return f"Result: {task}"
        
        router.register_executor(Executor(
            name="quick-agent",
            discipline=Discipline.QUICK,
            handler=handler,
        ))
        
        result = router.route("Summarize this article")
        
        assert result.executor.name == "quick-agent"
        assert result.classification.discipline == Discipline.QUICK
    
    @pytest.mark.asyncio
    async def test_route_and_execute(self, router):
        """Test routing and executing a task."""
        async def handler(task: str) -> str:
            return f"Result: {task}"
        
        router.register_executor(Executor(
            name="quick-agent",
            discipline=Discipline.QUICK,
            handler=handler,
        ))
        
        result = await router.route_and_execute("Summarize this article")
        
        assert result == "Result: Summarize this article"
    
    def test_fallback_to_default(self, router):
        """Test fallback to default discipline."""
        async def handler(task: str) -> str:
            return f"Result: {task}"
        
        # Only register DEEP executor
        router.register_executor(Executor(
            name="deep-agent",
            discipline=Discipline.DEEP,
            handler=handler,
        ))
        
        # Route a visual task (no executor registered)
        result = router.route("Generate an image")
        
        # Should fall back to DEEP
        assert result.executor.name == "deep-agent"
    
    def test_list_executors(self, router):
        """Test listing executors."""
        async def handler(task: str) -> str:
            return f"Result: {task}"
        
        router.register_executor(Executor(
            name="quick-agent",
            discipline=Discipline.QUICK,
            handler=handler,
        ))
        
        router.register_executor(Executor(
            name="deep-agent",
            discipline=Discipline.DEEP,
            handler=handler,
        ))
        
        executors = router.list_executors()
        
        assert "quick" in executors
        assert "deep" in executors
        assert "quick-agent" in executors["quick"]
        assert "deep-agent" in executors["deep"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
