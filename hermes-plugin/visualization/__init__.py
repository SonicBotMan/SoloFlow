"""Workflow visualization for SoloFlow.

Generates Mermaid diagrams and SVG visualizations of workflows.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any


@dataclass
class WorkflowNode:
    """A node in the workflow visualization."""
    
    id: str
    label: str
    status: str = "pending"
    discipline: str = "general"


@dataclass
class WorkflowEdge:
    """An edge in the workflow visualization."""
    
    source: str
    target: str


class WorkflowVisualizer:
    """Generates visual representations of workflows.
    
    Usage:
        visualizer = WorkflowVisualizer()
        
        # Generate Mermaid diagram
        mermaid = visualizer.to_mermaid(steps, edges)
        
        # Generate HTML with embedded diagram
        html = visualizer.to_html(steps, edges)
    """
    
    # Status colors for Mermaid
    STATUS_COLORS = {
        "pending": "#e2e8f0",      # gray
        "ready": "#fef3c7",        # yellow
        "running": "#bfdbfe",      # blue
        "completed": "#bbf7d0",    # green
        "failed": "#fecaca",       # red
        "cancelled": "#e2e8f0",    # gray
    }
    
    def to_mermaid(
        self,
        steps: list[dict[str, Any]],
        edges: list[tuple[str, str]],
        title: str = "Workflow",
    ) -> str:
        """Generate Mermaid flowchart syntax.
        
        Args:
            steps: List of step dicts with id, name, status, discipline
            edges: List of (from_id, to_id) tuples
            title: Diagram title
            
        Returns:
            Mermaid flowchart syntax string
        """
        lines = [f"flowchart TD"]
        lines.append(f"    %% {title}")
        lines.append("")
        
        # Add nodes
        for step in steps:
            step_id = step.get("id", "")
            name = step.get("name", step_id)
            status = step.get("status", "pending")
            discipline = step.get("discipline", "general")
            
            # Get color based on status
            color = self.STATUS_COLORS.get(status, "#e2e8f0")
            
            # Create node with styling
            lines.append(f"    {step_id}[\"{name}\"]")
            lines.append(f"    style {step_id} fill:{color}")
        
        lines.append("")
        
        # Add edges
        for source, target in edges:
            lines.append(f"    {source} --> {target}")
        
        return "\n".join(lines)
    
    def to_html(
        self,
        steps: list[dict[str, Any]],
        edges: list[tuple[str, str]],
        title: str = "Workflow",
    ) -> str:
        """Generate HTML with embedded Mermaid diagram.
        
        Args:
            steps: List of step dicts
            edges: List of (from_id, to_id) tuples
            title: Diagram title
            
        Returns:
            HTML string with embedded Mermaid
        """
        mermaid_code = self.to_mermaid(steps, edges, title)
        
        return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{title}</title>
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #fafafa;
        }}
        h1 {{
            color: #1a1a1a;
            font-weight: 300;
        }}
        .mermaid {{
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }}
        .legend {{
            margin-top: 20px;
            display: flex;
            gap: 16px;
            flex-wrap: wrap;
        }}
        .legend-item {{
            display: flex;
            align-items: center;
            gap: 8px;
        }}
        .legend-color {{
            width: 16px;
            height: 16px;
            border-radius: 4px;
        }}
    </style>
</head>
<body>
    <h1>{title}</h1>
    <div class="mermaid">
{mermaid_code}
    </div>
    <div class="legend">
        <div class="legend-item">
            <div class="legend-color" style="background: #e2e8f0;"></div>
            <span>Pending</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #fef3c7;"></div>
            <span>Ready</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #bfdbfe;"></div>
            <span>Running</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #bbf7d0;"></div>
            <span>Completed</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #fecaca;"></div>
            <span>Failed</span>
        </div>
    </div>
    <script>
        mermaid.initialize({{ startOnLoad: true, theme: 'default' }});
    </script>
</body>
</html>"""
    
    def to_dict(
        self,
        steps: list[dict[str, Any]],
        edges: list[tuple[str, str]],
    ) -> dict:
        """Convert workflow to dictionary format for JSON export.
        
        Args:
            steps: List of step dicts
            edges: List of (from_id, to_id) tuples
            
        Returns:
            Dictionary with nodes and edges
        """
        nodes = [
            {
                "id": step.get("id"),
                "label": step.get("name", step.get("id")),
                "status": step.get("status", "pending"),
                "discipline": step.get("discipline", "general"),
            }
            for step in steps
        ]
        
        edge_list = [
            {"source": source, "target": target}
            for source, target in edges
        ]
        
        return {
            "nodes": nodes,
            "edges": edge_list,
        }
