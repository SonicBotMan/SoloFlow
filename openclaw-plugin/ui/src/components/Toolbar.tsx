import { useCallback, useState } from 'react';
import {
  Save,
  FolderOpen,
  Play,
  CheckCircle2,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Maximize,
  LayoutGrid,
} from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import { useWorkflowStore } from '../hooks/useWorkflowStore';
import { validateWorkflow } from '../lib/validation';
import { flowToDag } from '../lib/flowToDag';
import { DISCIPLINE_META, type Discipline } from '../lib/types';

function useAutoLayout() {
  const { fitView } = useReactFlow();
  const setNodes = useWorkflowStore((s) => s.setNodes);

  return useCallback(
    (nodes: Node[], edges: Edge[]) => {
      const g = new dagre.graphlib.Graph();
      g.setDefaultEdgeLabel(() => ({}));
      g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 100 });

      for (const node of nodes) {
        g.setNode(node.id, { width: 220, height: 100 });
      }
      for (const edge of edges) {
        g.setEdge(edge.source, edge.target);
      }

      dagre.layout(g);

      const layouted = nodes.map((node) => {
        const pos = g.node(node.id);
        return {
          ...node,
          position: { x: pos.x - 110, y: pos.y - 50 },
        };
      });

      setNodes(layouted);
      requestAnimationFrame(() => fitView({ padding: 0.2, duration: 300 }));
    },
    [setNodes, fitView]
  );
}

export function Toolbar() {
  const [validating, setValidating] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const isDirty = useWorkflowStore((s) => s.isDirty);
  const validationErrors = useWorkflowStore((s) => s.validationErrors);
  const setValidationErrors = useWorkflowStore((s) => s.setValidationErrors);
  const setWorkflow = useWorkflowStore((s) => s.setWorkflow);
  const addNode = useWorkflowStore((s) => s.addNode);

  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const autoLayout = useAutoLayout();

  const handleValidate = useCallback(() => {
    setValidating(true);
    const result = validateWorkflow(nodes, edges);
    setValidationErrors(result.errors);
    setShowErrors(true);
    setTimeout(() => setValidating(false), 600);
  }, [nodes, edges, setValidationErrors]);

  const handleSave = useCallback(async () => {
    const dag = flowToDag(nodes, edges, workflowName);
    try {
      const res = await fetch('/api/workflow/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dag),
      });
      if (!res.ok) throw new Error('Save failed');
    } catch {
      localStorage.setItem('soloflow-workflow', JSON.stringify(dag));
    }
  }, [nodes, edges, workflowName]);

  const handleLoad = useCallback(() => {
    const raw = localStorage.getItem('soloflow-workflow');
    if (raw) {
      try {
        const dag = JSON.parse(raw);
        setWorkflow(dag);
      } catch { /* ignore malformed data */ }
    }
  }, [setWorkflow]);

  const handleRun = useCallback(async () => {
    const dag = flowToDag(nodes, edges, workflowName);
    try {
      await fetch('/api/workflow/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dag),
      });
    } catch { /* Backend not connected */ }
  }, [nodes, edges, workflowName]);

  const hasErrors = validationErrors.length > 0;

  return (
    <div className="flex items-center justify-between h-11 px-3 bg-surface-1 shadow-toolbar border-b border-border-subtle z-50 relative">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 mr-3">
          <div className="w-2 h-2 rounded-full bg-accent" />
          <span className="text-sm font-semibold text-text-primary tracking-tight">
            SoloFlow
          </span>
        </div>

        <div className="w-px h-5 bg-border-subtle" />

        <div className="flex items-center gap-1 ml-2">
          {(Object.keys(DISCIPLINE_META) as Discipline[]).map((d) => {
            const meta = DISCIPLINE_META[d];
            return (
              <button
                key={d}
                onClick={() => addNode(d)}
                className="node-palette-item"
                draggable
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: meta.color }}
                />
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button onClick={handleSave} className="toolbar-btn" title="Save (Ctrl+S)">
          <Save size={14} />
          <span className="hidden sm:inline">Save</span>
          {isDirty && (
            <span className="w-1.5 h-1.5 rounded-full bg-warning" />
          )}
        </button>

        <button onClick={handleLoad} className="toolbar-btn" title="Load">
          <FolderOpen size={14} />
          <span className="hidden sm:inline">Load</span>
        </button>

        <div className="w-px h-5 bg-border-subtle mx-1" />

        <button
          onClick={handleValidate}
          className={`toolbar-btn ${hasErrors ? 'toolbar-btn-danger' : ''}`}
          title="Validate"
        >
          {validating ? (
            <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : hasErrors ? (
            <AlertTriangle size={14} />
          ) : showErrors ? (
            <CheckCircle2 size={14} className="text-success" />
          ) : (
            <CheckCircle2 size={14} />
          )}
          Validate
        </button>

        <button onClick={handleRun} className="toolbar-btn toolbar-btn-primary" title="Run Workflow">
          <Play size={14} />
          Run
        </button>

        <div className="w-px h-5 bg-border-subtle mx-1" />

        <button onClick={() => zoomOut()} className="toolbar-btn" title="Zoom Out">
          <ZoomOut size={14} />
        </button>
        <button onClick={() => zoomIn()} className="toolbar-btn" title="Zoom In">
          <ZoomIn size={14} />
        </button>
        <button
          onClick={() => fitView({ padding: 0.2, duration: 300 })}
          className="toolbar-btn"
          title="Fit View"
        >
          <Maximize size={14} />
        </button>

        <div className="w-px h-5 bg-border-subtle mx-1" />

        <button
          onClick={() => autoLayout(nodes, edges)}
          className="toolbar-btn"
          title="Auto Layout"
        >
          <LayoutGrid size={14} />
        </button>
      </div>

      {showErrors && hasErrors && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-96 bg-surface-2 border border-error/30 rounded-lg shadow-lg p-3 animate-fade-in z-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-error flex items-center gap-1.5">
              <AlertTriangle size={12} />
              Validation Failed
            </span>
            <button
              onClick={() => setShowErrors(false)}
              className="text-text-tertiary hover:text-text-secondary text-xs"
            >
              Dismiss
            </button>
          </div>
          <ul className="space-y-1">
            {validationErrors.map((err, i) => (
              <li key={i} className="text-2xs text-text-secondary flex items-start gap-1.5">
                <span className="text-error mt-0.5">•</span>
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
