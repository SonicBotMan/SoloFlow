import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeTypes,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';
import { useExecutionStream } from '../hooks/useExecutionStream';
import { StepLogPanel } from './StepLogPanel';
import { ExecutionTimeline } from './ExecutionTimeline';
import type { AgentDiscipline, ExecutionStep, StepState } from '../types/execution';

interface ExecutionViewProps {
  workflowId: string;
  streamUrl?: string;
}

interface StepNodeData {
  step: ExecutionStep;
  onNodeClick: (stepId: string) => void;
  [key: string]: unknown;
}

const DISCIPLINE_COLORS: Record<AgentDiscipline, string> = {
  deep: '#388bfd',
  quick: '#3fb950',
  visual: '#bc8cff',
  ultrabrain: '#f0883e',
};

const STATE_COLORS: Record<StepState, string> = {
  pending: '#484f58',
  running: '#388bfd',
  completed: '#3fb950',
  failed: '#f85149',
  skipped: '#d29922',
};

function layoutGraph(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 70 });

  for (const node of nodes) {
    g.setNode(node.id, { width: 220, height: 72 });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const layouted = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: { x: pos.x - 110, y: pos.y - 36 },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    };
  });

  return { nodes: layouted, edges };
}

function StepNode({ data }: { data: StepNodeData }) {
  const { step, onNodeClick } = data;
  const borderColor = STATE_COLORS[step.state];
  const accentColor = DISCIPLINE_COLORS[step.discipline];

  return (
    <button
      onClick={() => onNodeClick(step.id)}
      className={`
        relative w-[220px] rounded-lg border-2 bg-surface-1
        transition-all duration-200 cursor-pointer
        hover:shadow-node-hover
        ${step.state === 'running' ? 'animate-pulse-running' : ''}
        ${step.state === 'completed' ? 'border-success/40 bg-success/5' : ''}
        ${step.state === 'failed' ? 'border-error/50 bg-error/5' : ''}
        ${step.state === 'skipped' ? 'border-warning/30 bg-warning/5' : ''}
        ${step.state === 'pending' ? 'border-border-subtle' : ''}
        ${step.state === 'running' ? 'border-discipline-deep/60' : ''}
      `}
      style={{ borderColor: step.state === 'pending' ? undefined : borderColor }}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-text-primary truncate max-w-[140px]">
            {step.name}
          </span>
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: accentColor }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span
              className="text-2xs px-1.5 py-0.5 rounded-sm font-medium"
              style={{
                backgroundColor: `${accentColor}20`,
                color: accentColor,
              }}
            >
              {step.discipline}
            </span>
            <span className="text-2xs text-text-tertiary capitalize">
              {step.state}
            </span>
          </div>

          {step.durationMs != null && (
            <span className="text-2xs font-mono text-text-tertiary">
              {step.durationMs < 1000
                ? `${step.durationMs}ms`
                : `${(step.durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
        </div>

        {step.error && (
          <div className="mt-1.5 text-2xs text-error/80 truncate" title={step.error}>
            {step.error}
          </div>
        )}
      </div>

      {step.state === 'running' && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-discipline-deep/40 rounded-b-lg overflow-hidden">
          <div className="h-full w-1/3 bg-discipline-deep animate-edge-flow"
            style={{
              background: 'repeating-linear-gradient(90deg, transparent, #388bfd 50%, transparent)',
              backgroundSize: '200% 100%',
              animation: 'edge-flow 1.5s linear infinite',
            }}
          />
        </div>
      )}
    </button>
  );
}

const nodeTypes: NodeTypes = {
  step: StepNode,
};

function ConnectionBadge({ connected, method }: { connected: boolean; method: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-2 border border-border-subtle">
      <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-success' : 'bg-error'}`} />
      <span className="text-2xs text-text-tertiary capitalize">{method}</span>
    </div>
  );
}

function ProgressBar({ progress, state }: { progress: number; state: string }) {
  const pct = Math.round(progress * 100);
  const isActive = state === 'running';
  const isComplete = state === 'completed';
  const isFailed = state === 'failed';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary">
          {isComplete ? 'Completed' : isFailed ? 'Failed' : isActive ? 'Executing' : 'Waiting'}
        </span>
        <span className="text-xs font-mono text-text-tertiary">{pct}%</span>
      </div>
      <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            isComplete
              ? 'bg-success'
              : isFailed
                ? 'bg-error'
                : 'bg-accent'
          } ${isActive ? 'animate-progress-stripe' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ExecutionView({ workflowId, streamUrl }: ExecutionViewProps) {
  const { workflow, connected, connectionMethod, error, reconnect } = useExecutionStream(
    workflowId,
    streamUrl ? { url: streamUrl } : undefined,
  );

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [showTimeline, setShowTimeline] = useState(true);

  const toggleLog = useCallback((stepId: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  }, []);

  const handleNodeClick = useCallback((stepId: string) => {
    setSelectedStepId((prev) => prev === stepId ? null : stepId);
    toggleLog(stepId);
  }, [toggleLog]);

  const { nodes: flowNodes, edges: flowEdges } = useMemo(() => {
    if (!workflow) return { nodes: [], edges: [] };

    const nodes: Node[] = workflow.steps.map((step) => ({
      id: step.id,
      type: 'step',
      data: { step, onNodeClick: handleNodeClick } satisfies StepNodeData,
      position: { x: 0, y: 0 },
    }));

    const edges: Edge[] = workflow.edges.map((edge) => {
      const sourceStep = workflow.steps.find((s) => s.id === edge.source);
      const targetStep = workflow.steps.find((s) => s.id === edge.target);
      const sourceDone = sourceStep?.state === 'completed';
      const isFlowing = sourceDone && (targetStep?.state === 'running' || targetStep?.state === 'pending');

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        animated: isFlowing,
        style: {
          stroke: sourceDone ? '#3fb95050' : '#484f5830',
          strokeWidth: 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: sourceDone ? '#3fb95050' : '#484f5830',
          width: 16,
          height: 16,
        },
      };
    });

    return layoutGraph(nodes, edges);
  }, [workflow, handleNodeClick]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  const selectedStep = workflow?.steps.find((s) => s.id === selectedStepId);
  const completedCount = workflow?.steps.filter((s) => s.state === 'completed').length ?? 0;
  const failedCount = workflow?.steps.filter((s) => s.state === 'failed').length ?? 0;
  const totalCount = workflow?.steps.length ?? 0;

  if (!workflow && !error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-surface-0 text-text-secondary">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin mb-3" />
        <span className="text-sm">Connecting to workflow...</span>
      </div>
    );
  }

  if (error && !workflow) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-surface-0 text-text-secondary">
        <svg className="w-10 h-10 text-error mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <span className="text-sm mb-2">{error}</span>
        <button
          onClick={reconnect}
          className="px-4 py-1.5 rounded-md bg-accent/15 text-accent text-sm hover:bg-accent/25 transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-surface-0">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle bg-surface-1 shadow-toolbar">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-text-primary">
            {workflow?.name ?? 'Workflow'}
          </h1>
          {workflow?.state && (
            <span className={`text-2xs px-2 py-0.5 rounded-sm font-medium ${
              workflow.state === 'completed' ? 'bg-success/15 text-success' :
              workflow.state === 'failed' ? 'bg-error/15 text-error' :
              workflow.state === 'running' ? 'bg-accent/15 text-accent' :
              'bg-surface-3 text-text-tertiary'
            }`}>
              {workflow.state}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-2xs text-text-tertiary">
            <span>{completedCount}/{totalCount} done</span>
            {failedCount > 0 && <span className="text-error">{failedCount} failed</span>}
          </div>
          <ConnectionBadge connected={connected} method={connectionMethod} />
          <button
            onClick={() => setShowTimeline((p) => !p)}
            className={`p-1.5 rounded-md transition-colors ${
              showTimeline ? 'bg-accent/15 text-accent' : 'text-text-tertiary hover:text-text-secondary'
            }`}
            title="Toggle timeline"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9M3 12h5m0 0l4-4m-4 4l4 4" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex items-center px-4 py-2 border-b border-border-subtle bg-surface-1/50">
        <div className="flex-1 max-w-md">
          <ProgressBar progress={workflow?.progress ?? 0} state={workflow?.state ?? 'idle'} />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            proOptions={{ hideAttribution: true }}
            className="bg-surface-0"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#21262d" />
            <Controls
              showInteractive={false}
              className="!bg-surface-2 !border-border-subtle !rounded-md [&>button]:!bg-surface-2 [&>button]:!border-border-subtle [&>button]:!text-text-secondary [&>button:hover]:!bg-surface-3"
            />
          </ReactFlow>
        </div>

        {showTimeline && (
          <aside className="w-72 border-l border-border-subtle bg-surface-1 overflow-hidden animate-slide-in">
            <ExecutionTimeline
              steps={workflow?.steps ?? []}
              workflowState={workflow?.state ?? 'idle'}
              startedAt={workflow?.startedAt}
              completedAt={workflow?.completedAt}
              onStepClick={handleNodeClick}
              selectedStepId={selectedStepId ?? undefined}
            />
          </aside>
        )}
      </div>

      {(selectedStep || (workflow?.steps.some((s) => s.state === 'failed') ?? false)) && (
        <div className="border-t border-border-subtle bg-surface-1 max-h-64 overflow-y-auto">
          <div className="p-2 space-y-1">
            {selectedStep && (
              <StepLogPanel
                step={selectedStep}
                expanded={expandedLogs.has(selectedStep.id)}
                onToggle={() => toggleLog(selectedStep.id)}
              />
            )}
            {workflow?.steps
              .filter((s) => s.state === 'failed' && s.id !== selectedStepId)
              .map((step) => (
                <StepLogPanel
                  key={step.id}
                  step={step}
                  expanded={expandedLogs.has(step.id)}
                  onToggle={() => toggleLog(step.id)}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
