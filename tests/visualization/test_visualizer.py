import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "hermes-plugin"))

from visualization import WorkflowVisualizer

@pytest.fixture
def visualizer():
    return WorkflowVisualizer()

@pytest.fixture
def sample_steps():
    return [
        {"id": "a", "name": "Step A", "status": "completed", "discipline": "quick"},
        {"id": "b", "name": "Step B", "status": "running", "discipline": "deep"},
        {"id": "c", "name": "Step C", "status": "pending", "discipline": "quick"},
    ]

@pytest.fixture
def sample_edges():
    return [("a", "b"), ("b", "c")]

def test_to_mermaid(visualizer, sample_steps, sample_edges):
    mermaid = visualizer.to_mermaid(sample_steps, sample_edges)
    assert "flowchart TD" in mermaid
    assert "Step A" in mermaid
    assert "a --> b" in mermaid

def test_to_html(visualizer, sample_steps, sample_edges):
    html = visualizer.to_html(sample_steps, sample_edges)
    assert "<!DOCTYPE html>" in html
    assert "mermaid" in html

def test_to_dict(visualizer, sample_steps, sample_edges):
    result = visualizer.to_dict(sample_steps, sample_edges)
    assert len(result["nodes"]) == 3
    assert len(result["edges"]) == 2
