"""Tests for SoloFlow data models (models.py)."""

import pytest

from models import (
    DAG,
    Discipline,
    Edge,
    Layer,
    Step,
    StepState,
    Workflow,
    WorkflowConfig,
    WorkflowState,
)


class TestEdge:
    """Tests for Edge dataclass."""

    def test_creation(self):
        """Edge should store from_id and to_id."""
        edge = Edge(from_id="A", to_id="B")
        assert edge.from_id == "A"
        assert edge.to_id == "B"

    def test_equality(self):
        """Edges with same values should be equal."""
        e1 = Edge(from_id="A", to_id="B")
        e2 = Edge(from_id="A", to_id="B")
        assert e1 == e2


class TestLayer:
    """Tests for Layer dataclass."""

    def test_creation(self):
        """Layer should store index and step_ids."""
        layer = Layer(index=0, step_ids=["A", "B"])
        assert layer.index == 0
        assert layer.step_ids == ["A", "B"]

    def test_empty_layer(self):
        """Layer can have empty step_ids."""
        layer = Layer(index=1, step_ids=[])
        assert layer.step_ids == []


class TestDAG:
    """Tests for DAG dataclass."""

    def test_default_values(self):
        """DAG should have empty defaults."""
        dag = DAG()
        assert dag.nodes == {}
        assert dag.edges == []
        assert dag.layers == []

    def test_with_data(self):
        """DAG should store provided data."""
        dag = DAG(
            nodes={"A": {"id": "A"}},
            edges=[Edge(from_id="A", to_id="B")],
            layers=[Layer(index=0, step_ids=["A"])],
        )
        assert len(dag.nodes) == 1
        assert len(dag.edges) == 1
        assert len(dag.layers) == 1


class TestWorkflowState:
    """Tests for WorkflowState enum."""

    def test_all_states(self):
        """All workflow states should be defined."""
        assert WorkflowState.DRAFT.value == "draft"
        assert WorkflowState.ACTIVE.value == "active"
        assert WorkflowState.RUNNING.value == "running"
        assert WorkflowState.COMPLETED.value == "completed"
        assert WorkflowState.FAILED.value == "failed"
        assert WorkflowState.CANCELLED.value == "cancelled"

    def test_string_comparison(self):
        """WorkflowState should be comparable to strings."""
        assert WorkflowState.DRAFT == "draft"
        assert WorkflowState.ACTIVE == "active"


class TestStepState:
    """Tests for StepState enum."""

    def test_all_states(self):
        """All step states should be defined."""
        assert StepState.PENDING.value == "pending"
        assert StepState.READY.value == "ready"
        assert StepState.RUNNING.value == "running"
        assert StepState.COMPLETED.value == "completed"
        assert StepState.FAILED.value == "failed"
        assert StepState.SKIPPED.value == "skipped"
        assert StepState.CANCELLED.value == "cancelled"


class TestStep:
    """Tests for Step dataclass."""

    def test_default_state(self):
        """New step should default to PENDING."""
        step = Step(
            id="test",
            workflow_id="wf-1",
            name="Test Step",
            description="A test",
            discipline=Discipline.QUICK,
            prompt="Do something",
        )
        assert step.state == StepState.PENDING
        assert step.retry_count == 0
        assert step.max_retries == 3
        assert step.timeout_seconds == 300

    def test_with_custom_values(self):
        """Step should accept custom values."""
        step = Step(
            id="custom",
            workflow_id="wf-1",
            name="Custom Step",
            description="Custom",
            discipline=Discipline.DEEP,
            prompt="Be thorough",
            state=StepState.RUNNING,
            retry_count=2,
            max_retries=5,
            timeout_seconds=600,
        )
        assert step.state == StepState.RUNNING
        assert step.retry_count == 2
        assert step.max_retries == 5
        assert step.timeout_seconds == 600


class TestWorkflow:
    """Tests for Workflow dataclass."""

    def test_default_state(self):
        """New workflow should default to DRAFT."""
        wf = Workflow(id="wf-1", name="Test Workflow", description="A test")
        assert wf.state == WorkflowState.DRAFT
        assert wf.steps == {}
        assert isinstance(wf.config, WorkflowConfig)

    def test_with_steps(self):
        """Workflow should hold steps."""
        step = Step(
            id="s1",
            workflow_id="wf-1",
            name="Step 1",
            description="First",
            discipline=Discipline.QUICK,
            prompt="Go",
        )
        wf = Workflow(
            id="wf-1",
            name="Test",
            description="Test",
            steps={"s1": step},
        )
        assert len(wf.steps) == 1
        assert wf.steps["s1"].id == "s1"


class TestWorkflowConfig:
    """Tests for WorkflowConfig."""

    def test_defaults(self):
        """Config should have sensible defaults."""
        config = WorkflowConfig()
        assert config.max_parallelism == 4
        assert config.default_timeout == 300
        assert config.retry_delay == 5
        assert config.max_retries == 2

    def test_custom_values(self):
        """Config should accept custom values."""
        config = WorkflowConfig(
            max_parallelism=8,
            default_timeout=600,
            retry_delay=10,
            max_retries=5,
        )
        assert config.max_parallelism == 8
        assert config.default_timeout == 600
        assert config.retry_delay == 10
        assert config.max_retries == 5
