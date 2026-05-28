"""Pipeline components for SoloFlow.

Implements Haystack-style component-based orchestration:
- Components = atomic capability units
- Pipelines = data flow + branching + looping
- Full observability at component level
"""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Awaitable, Optional

logger = logging.getLogger("soloflow.pipeline")


class ComponentStatus(str, Enum):
    """Status of a pipeline component."""
    
    IDLE = "idle"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class ComponentResult:
    """Result from a pipeline component."""
    
    component_id: str
    status: ComponentStatus
    output: Any = None
    error: Optional[str] = None
    duration_ms: float = 0.0
    token_usage: dict = field(default_factory=dict)
    
    def to_dict(self) -> dict:
        return {
            "component_id": self.component_id,
            "status": self.status.value,
            "output": self.output,
            "error": self.error,
            "duration_ms": self.duration_ms,
            "token_usage": self.token_usage,
        }


@dataclass
class PipelineComponent:
    """A component in a pipeline.
    
    Key insight from Haystack:
    - Components are atomic capability units
    - Each component has clear input/output
    - Full observability at component level
    """
    
    component_id: str
    name: str
    description: str = ""
    handler: Callable[..., Awaitable[Any]] | None = None
    input_schema: dict = field(default_factory=dict)
    output_schema: dict = field(default_factory=dict)
    
    async def run(self, **kwargs) -> ComponentResult:
        """Run the component."""
        start_time = time.time()
        
        try:
            if self.handler:
                output = await self.handler(**kwargs)
            else:
                output = kwargs
            
            duration_ms = (time.time() - start_time) * 1000
            
            return ComponentResult(
                component_id=self.component_id,
                status=ComponentStatus.COMPLETED,
                output=output,
                duration_ms=duration_ms,
            )
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            return ComponentResult(
                component_id=self.component_id,
                status=ComponentStatus.FAILED,
                error=str(e),
                duration_ms=duration_ms,
            )
    
    def to_dict(self) -> dict:
        return {
            "component_id": self.component_id,
            "name": self.name,
            "description": self.description,
        }


class Pipeline:
    """A pipeline of components with data flow.
    
    Key patterns from Haystack:
    - Pipeline defines data flow between components
    - Supports branching and looping
    - Full observability at each step
    """
    
    def __init__(self, name: str) -> None:
        self.name = name
        self._components: dict[str, PipelineComponent] = {}
        self._edges: list[tuple[str, str]] = []
        self._results: list[ComponentResult] = []
    
    def add_component(self, component: PipelineComponent) -> None:
        """Add a component to the pipeline."""
        self._components[component.component_id] = component
    
    def add_edge(self, from_id: str, to_id: str) -> None:
        """Add an edge between components."""
        self._edges.append((from_id, to_id))
    
    async def run(self, initial_input: dict) -> dict:
        """Run the pipeline.
        
        Returns:
            Final output from the last component
        """
        # Find start components (no incoming edges)
        incoming = {e[1] for e in self._edges}
        start_components = [
            cid for cid in self._components
            if cid not in incoming
        ]
        
        if not start_components:
            start_components = list(self._components.keys())[:1]
        
        # Run components in topological order
        current_input = initial_input
        final_output = None
        
        for comp_id in start_components:
            component = self._components.get(comp_id)
            if not component:
                continue
            
            result = await component.run(**current_input)
            self._results.append(result)
            
            if result.status == ComponentStatus.FAILED:
                return {
                    "success": False,
                    "error": result.error,
                    "failed_component": comp_id,
                }
            
            final_output = result.output
            current_input = result.output if isinstance(result.output, dict) else {"result": result.output}
        
        return {
            "success": True,
            "output": final_output,
            "components_run": len(self._results),
        }
    
    def get_results(self) -> list[dict]:
        """Get results from all components."""
        return [r.to_dict() for r in self._results]
    
    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "components": [c.to_dict() for c in self._components.values()],
            "edges": self._edges,
        }


# Predefined components
class PromptBuilderComponent(PipelineComponent):
    """Builds prompts from templates and context."""
    
    def __init__(self) -> None:
        super().__init__(
            component_id="prompt_builder",
            name="Prompt Builder",
            description="Builds prompts from templates and context",
        )
    
    async def run(self, template: str = "", context: dict | None = None, **kwargs) -> ComponentResult:
        start_time = time.time()
        
        prompt = template
        if context:
            for key, value in context.items():
                prompt = prompt.replace(f"{{{key}}}", str(value))
        
        duration_ms = (time.time() - start_time) * 1000
        return ComponentResult(
            component_id=self.component_id,
            status=ComponentStatus.COMPLETED,
            output={"prompt": prompt},
            duration_ms=duration_ms,
        )


class RouterComponent(PipelineComponent):
    """Routes to different paths based on conditions."""
    
    def __init__(self) -> None:
        super().__init__(
            component_id="router",
            name="Router",
            description="Routes to different paths based on conditions",
        )
    
    async def run(self, input_text: str = "", **kwargs) -> ComponentResult:
        start_time = time.time()
        
        # Simple routing logic
        if len(input_text) < 100:
            route = "quick"
        elif "analyze" in input_text.lower():
            route = "deep"
        else:
            route = "default"
        
        duration_ms = (time.time() - start_time) * 1000
        return ComponentResult(
            component_id=self.component_id,
            status=ComponentStatus.COMPLETED,
            output={"route": route, "input": input_text},
            duration_ms=duration_ms,
        )
