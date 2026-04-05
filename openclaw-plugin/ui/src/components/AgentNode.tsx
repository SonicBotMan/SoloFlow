import { memo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Brain, Zap, Eye, Sparkles, Trash2, Settings2 } from 'lucide-react';
import type { AgentNodeData, Discipline, StepStatus } from '../lib/types';
import { DISCIPLINE_META, STATUS_META } from '../lib/types';
import { useWorkflowStore } from '../hooks/useWorkflowStore';

const ICON_MAP: Record<string, React.ComponentType<{ size: number; strokeWidth: number; style: React.CSSProperties }>> = { brain: Brain, zap: Zap, eye: Eye, sparkles: Sparkles };

function DisciplineIcon({ discipline }: { discipline: Discipline }) {
  const meta = DISCIPLINE_META[discipline];
  const Icon = ICON_MAP[meta.icon]!;
  return <Icon size={16} strokeWidth={2} style={{ color: meta.color }} />;
}

function StatusBadge({ status }: { status: StepStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="flex items-center gap-1 text-2xs font-mono"
      style={{ color: meta.color }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: meta.color }}
      />
      {meta.label}
    </span>
  );
}

function AgentNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as AgentNodeData;
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(nodeData.label);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const removeNode = useWorkflowStore((s) => s.removeNode);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);

  const meta = DISCIPLINE_META[nodeData.discipline];

  const handleDoubleClick = useCallback(() => {
    setEditing(true);
    setEditLabel(nodeData.label);
    setSelectedNode(id);
  }, [nodeData.label, id, setSelectedNode]);

  const handleLabelCommit = useCallback(() => {
    if (editLabel.trim()) {
      updateNodeData(id, { label: editLabel.trim() });
    }
    setEditing(false);
  }, [editLabel, id, updateNodeData]);

  const statusClass =
    nodeData.status === 'running'
      ? 'animate-pulse-running'
      : nodeData.status === 'completed'
        ? 'shadow-glow-quick'
        : '';

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{ borderColor: meta.color }}
      />

      <div
        className={`
          relative group min-w-[200px] rounded-lg
          bg-surface-1 border transition-all duration-200
          shadow-node hover:shadow-node-hover
          ${selected ? 'border-opacity-100' : 'border-border-subtle'}
          ${statusClass}
        `}
        style={{
          borderColor: selected ? meta.color : undefined,
        }}
        onDoubleClick={handleDoubleClick}
      >
        <div
          className="absolute inset-x-0 top-0 h-[2px] rounded-t-lg"
          style={{ backgroundColor: meta.color }}
        />

        <div className="px-3 py-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <DisciplineIcon discipline={nodeData.discipline} />
              {editing ? (
                <input
                  autoFocus
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onBlur={handleLabelCommit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLabelCommit();
                    if (e.key === 'Escape') setEditing(false);
                  }}
                  className="bg-surface-2 text-text-primary text-sm font-medium
                             px-1.5 py-0.5 rounded border border-border-default
                             outline-none focus:border-accent w-full"
                />
              ) : (
                <span className="text-sm font-medium text-text-primary truncate">
                  {nodeData.label}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDoubleClick();
                }}
                className="p-1 rounded hover:bg-surface-3 text-text-tertiary hover:text-text-secondary"
              >
                <Settings2 size={12} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeNode(id);
                }}
                className="p-1 rounded hover:bg-error/10 text-text-tertiary hover:text-error"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span
              className="text-2xs font-mono px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: `${meta.color}15`,
                color: meta.color,
              }}
            >
              {nodeData.model}
            </span>
            <StatusBadge status={nodeData.status} />
          </div>

          {nodeData.prompt && (
            <p className="text-2xs text-text-tertiary line-clamp-2 leading-relaxed">
              {nodeData.prompt}
            </p>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ borderColor: meta.color }}
      />
    </>
  );
}

export const AgentNode = memo(AgentNodeComponent);
