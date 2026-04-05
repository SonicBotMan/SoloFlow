import { useCallback, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  type ReactFlowInstance,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkflowStore } from '../hooks/useWorkflowStore';
import { useAutoSave } from '../hooks/useAutoSave';
import { AgentNode } from './AgentNode';
import { DependencyEdge } from './EdgeType';
import type { Discipline } from '../lib/types';

const NODE_TYPES: NodeTypes = { agent: AgentNode };
const EDGE_TYPES: EdgeTypes = { dependency: DependencyEdge };

export function WorkflowCanvas() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);
  const onConnect = useWorkflowStore((s) => s.onConnect);
  const addNode = useWorkflowStore((s) => s.addNode);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const removeNode = useWorkflowStore((s) => s.removeNode);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const nodesMap = useWorkflowStore((s) => s.nodes);

  const reactFlowRef = useRef<HTMLDivElement>(null);
  const rfInstance = useRef<ReactFlowInstance | null>(null);

  useAutoSave();

  const proOptions = useMemo(() => ({ hideAttribution: true }), []);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    rfInstance.current = instance;
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const discipline = event.dataTransfer.getData(
        'application/soloflow-discipline'
      ) as Discipline | '';
      if (!discipline || !rfInstance.current || !reactFlowRef.current) return;

      const bounds = reactFlowRef.current.getBoundingClientRect();
      const position = rfInstance.current.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      addNode(discipline, position);
    },
    [addNode]
  );

  const selectedNode = useMemo(
    () => nodesMap.find((n) => n.id === selectedNodeId),
    [nodesMap, selectedNodeId]
  );

  return (
    <div className="flex-1 relative">
      <div ref={reactFlowRef} className="w-full h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={onInit}
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          proOptions={proOptions}
          fitView
          snapToGrid
          snapGrid={[16, 16]}
          deleteKeyCode={['Backspace', 'Delete']}
          onNodeClick={(_e, node) => setSelectedNode(node.id)}
          onPaneClick={() => setSelectedNode(null)}
          minZoom={0.2}
          maxZoom={2}
          defaultEdgeOptions={{
            type: 'dependency',
            animated: true,
          }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="rgba(255, 255, 255, 0.04)"
          />
          <MiniMap
            nodeColor={(node) => {
              const disciplineColors: Record<string, string> = {
                deep: '#388bfd',
                quick: '#3fb950',
                visual: '#bc8cff',
                ultrabrain: '#f0883e',
              };
              const data = node.data as { discipline?: string };
              return disciplineColors[data?.discipline ?? ''] ?? '#565869';
            }}
            maskColor="rgba(0, 0, 0, 0.7)"
            style={{ borderRadius: 8 }}
          />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {selectedNode && (
        <PropertiesPanel
          nodeId={selectedNode.id}
          onClose={() => setSelectedNode(null)}
          onUpdate={(data) => updateNodeData(selectedNode.id, data)}
          onRemove={() => removeNode(selectedNode.id)}
        />
      )}

      <EmptyState visible={nodes.length === 0} />
    </div>
  );
}

import type { AgentNodeData } from '../lib/types';
import { DISCIPLINE_META } from '../lib/types';

function PropertiesPanel({
  nodeId,
  onClose,
  onUpdate,
  onRemove,
}: {
  nodeId: string;
  onClose: () => void;
  onUpdate: (data: Partial<AgentNodeData>) => void;
  onRemove: () => void;
}) {
  const nodes = useWorkflowStore((s) => s.nodes);
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  const data = node.data as unknown as AgentNodeData;
  const meta = DISCIPLINE_META[data.discipline];

  return (
    <div className="absolute top-3 right-3 w-72 bg-surface-1 border border-border-subtle rounded-lg shadow-lg animate-slide-in z-40">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: meta.color }}
          />
          <span className="text-xs font-semibold text-text-primary">Properties</span>
        </div>
        <button
          onClick={onClose}
          className="text-text-tertiary hover:text-text-secondary text-xs"
        >
          ✕
        </button>
      </div>

      <div className="p-3 space-y-3">
        <Field label="Name">
          <input
            value={data.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            className="w-full bg-surface-2 text-text-primary text-xs px-2 py-1.5 rounded border border-border-subtle outline-none focus:border-accent"
          />
        </Field>

        <Field label="Model">
          <input
            value={data.model}
            onChange={(e) => onUpdate({ model: e.target.value })}
            className="w-full bg-surface-2 text-text-primary text-xs font-mono px-2 py-1.5 rounded border border-border-subtle outline-none focus:border-accent"
          />
        </Field>

        <Field label="Prompt">
          <textarea
            value={data.prompt}
            onChange={(e) => onUpdate({ prompt: e.target.value })}
            rows={4}
            className="w-full bg-surface-2 text-text-primary text-xs px-2 py-1.5 rounded border border-border-subtle outline-none focus:border-accent resize-none leading-relaxed"
            placeholder="Enter step prompt..."
          />
        </Field>

        <div className="flex gap-2">
          <Field label="Temperature" compact>
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={data.temperature}
              onChange={(e) => onUpdate({ temperature: parseFloat(e.target.value) || 0 })}
              className="w-full bg-surface-2 text-text-primary text-xs font-mono px-2 py-1.5 rounded border border-border-subtle outline-none focus:border-accent"
            />
          </Field>
          <Field label="Max Tokens" compact>
            <input
              type="number"
              min={1}
              max={128000}
              step={256}
              value={data.maxTokens}
              onChange={(e) => onUpdate({ maxTokens: parseInt(e.target.value) || 4096 })}
              className="w-full bg-surface-2 text-text-primary text-xs font-mono px-2 py-1.5 rounded border border-border-subtle outline-none focus:border-accent"
            />
          </Field>
        </div>

        <button
          onClick={onRemove}
          className="w-full text-xs text-error/70 hover:text-error bg-error/5 hover:bg-error/10 py-1.5 rounded transition-colors"
        >
          Delete Step
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  compact,
}: {
  label: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'flex-1' : ''}>
      <label className="block text-2xs text-text-tertiary mb-1 font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function EmptyState({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div className="text-center space-y-3 animate-fade-in">
        <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border-subtle flex items-center justify-center mx-auto">
          <LayoutGridIcon />
        </div>
        <div>
          <p className="text-sm text-text-secondary font-medium">
            No steps yet
          </p>
          <p className="text-2xs text-text-tertiary mt-1">
            Click a discipline above or drag nodes onto the canvas
          </p>
        </div>
      </div>
    </div>
  );
}

function LayoutGridIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-tertiary">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
