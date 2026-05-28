"""Tests for pipeline components."""

import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from pipeline import Pipeline, PipelineComponent, ComponentStatus, ComponentResult


@pytest.fixture
def pipeline():
    p = Pipeline("test-pipeline")
    return p


class TestPipelineComponent:
    @pytest.mark.asyncio
    async def test_run_success(self):
        async def handler(text):
            return {"result": text.upper()}
        
        component = PipelineComponent(
            component_id="test",
            name="Test",
            handler=handler,
        )
        
        result = await component.run(text="hello")
        assert result.status == ComponentStatus.COMPLETED
        assert result.output["result"] == "HELLO"
    
    @pytest.mark.asyncio
    async def test_run_failure(self):
        async def handler():
            raise ValueError("Test error")
        
        component = PipelineComponent(
            component_id="test",
            name="Test",
            handler=handler,
        )
        
        result = await component.run()
        assert result.status == ComponentStatus.FAILED
        assert "Test error" in result.error


class TestPipeline:
    def test_add_component(self, pipeline):
        component = PipelineComponent(
            component_id="c1",
            name="Component 1",
        )
        pipeline.add_component(component)
        assert "c1" in pipeline._components
    
    def test_add_edge(self, pipeline):
        pipeline.add_edge("c1", "c2")
        assert ("c1", "c2") in pipeline._edges
    
    @pytest.mark.asyncio
    async def test_run_single_component(self, pipeline):
        async def handler(text):
            return {"result": text.upper()}
        
        component = PipelineComponent(
            component_id="c1",
            name="Upper",
            handler=handler,
        )
        pipeline.add_component(component)
        
        result = await pipeline.run({"text": "hello"})
        assert result["success"] is True
        assert result["output"]["result"] == "HELLO"
    
    @pytest.mark.asyncio
    async def test_run_pipeline_failure(self, pipeline):
        async def handler():
            raise ValueError("Failed")
        
        component = PipelineComponent(
            component_id="c1",
            name="Fail",
            handler=handler,
        )
        pipeline.add_component(component)
        
        result = await pipeline.run({})
        assert result["success"] is False
        assert "Failed" in result["error"]
    
    def test_to_dict(self, pipeline):
        component = PipelineComponent(
            component_id="c1",
            name="Test",
        )
        pipeline.add_component(component)
        pipeline.add_edge("c1", "c2")
        
        d = pipeline.to_dict()
        assert d["name"] == "test-pipeline"
        assert len(d["components"]) == 1
        assert len(d["edges"]) == 1
