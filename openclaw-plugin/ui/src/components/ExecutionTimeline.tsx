import { useMemo } from 'react';
import type { ExecutionStep, WorkflowState } from '../types/execution';

interface ExecutionTimelineProps {
  steps: ExecutionStep[];
  workflowState: WorkflowState;
  startedAt?: number;
  completedAt?: number;
  onStepClick?: (stepId: string) => void;
  selectedStepId?: string;
}

const STATE_ICON: Record<ExecutionStep['state'], { color: string; bg: string }> = {
  pending: { color: 'text-text-tertiary', bg: 'bg-surface-3 border-border-subtle' },
  running: { color: 'text-discipline-deep', bg: 'bg-discipline-deep/15 border-discipline-deep/40' },
  completed: { color: 'text-success', bg: 'bg-success/15 border-success/40' },
  failed: { color: 'text-error', bg: 'bg-error/15 border-error/40' },
  skipped: { color: 'text-warning', bg: 'bg-warning/10 border-warning/30' },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function ExecutionTimeline({
  steps,
  workflowState,
  startedAt,
  completedAt,
  onStepClick,
  selectedStepId,
}: ExecutionTimelineProps) {
  const sorted = useMemo(
    () => [...steps].sort((a, b) => (a.startedAt ?? Infinity) - (b.startedAt ?? Infinity)),
    [steps],
  );

  const criticalPathIds = useMemo(() => {
    const completed = new Set(
      sorted
        .filter((s) => s.state === 'completed')
        .sort((a, b) => (a.durationMs ?? 0) - (b.durationMs ?? 0))
        .map((s) => s.id),
    );
    const longest = sorted
      .filter((s) => s.state === 'completed')
      .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0));
    for (const step of longest) {
      completed.add(step.id);
      for (const dep of step.dependencies) completed.add(dep);
    }
    return completed;
  }, [sorted]);

  const totalDuration = useMemo(() => {
    if (completedAt && startedAt) return completedAt - startedAt;
    if ((workflowState === 'running' || workflowState === 'failed') && startedAt) return Date.now() - startedAt;
    return 0;
  }, [workflowState, startedAt, completedAt]);

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
        No steps to display
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-surface-1">
        <span className="text-xs font-medium text-text-secondary">Timeline</span>
        {totalDuration > 0 && (
          <span className="text-2xs font-mono text-text-tertiary">
            Total: {formatDuration(totalDuration)}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-0">
        {sorted.map((step, idx) => {
          const isLast = idx === sorted.length - 1;
          const isCritical = criticalPathIds.has(step.id);
          const style = STATE_ICON[step.state];
          const isSelected = step.id === selectedStepId;

          return (
            <div key={step.id} className="relative flex gap-3">
              {!isLast && (
                <div className={`absolute left-[15px] top-8 w-px h-[calc(100%+4px)] ${
                  isCritical && step.state !== 'pending' ? 'bg-accent/30' : 'bg-border-subtle'
                }`} />
              )}

              <div className={`relative z-10 mt-2 flex items-center justify-center w-8 h-8 rounded-full border-2 shrink-0 transition-all ${
                style.bg
              } ${step.state === 'running' ? 'animate-pulse-running' : ''}`}>
                {step.state === 'completed' && (
                  <svg className={`w-4 h-4 ${style.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {step.state === 'failed' && (
                  <svg className={`w-4 h-4 ${style.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                {step.state === 'running' && (
                  <div className={`w-2.5 h-2.5 rounded-full ${style.color} bg-current animate-pulse`} />
                )}
                {step.state === 'pending' && (
                  <div className={`w-2 h-2 rounded-full ${style.color} bg-current opacity-40`} />
                )}
                {step.state === 'skipped' && (
                  <svg className={`w-4 h-4 ${style.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                )}
              </div>

              <button
                onClick={() => onStepClick?.(step.id)}
                className={`flex-1 mb-2 text-left rounded-md px-3 py-2 transition-all ${
                  isSelected
                    ? 'bg-accent/10 ring-1 ring-accent/30'
                    : 'bg-surface-2 hover:bg-surface-3'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${style.color}`}>
                      {step.name}
                    </span>
                    {isCritical && step.state === 'completed' && (
                      <span className="text-2xs px-1 py-0.5 rounded-sm bg-accent/10 text-accent font-medium">
                        critical
                      </span>
                    )}
                  </div>
                  {step.durationMs != null && (
                    <span className="text-2xs font-mono text-text-tertiary">
                      {formatDuration(step.durationMs)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 mt-1">
                  <span className="text-2xs text-text-tertiary">
                    {step.discipline}
                  </span>
                  {step.startedAt && (
                    <span className="text-2xs font-mono text-text-tertiary">
                      {formatTime(step.startedAt)}
                    </span>
                  )}
                  {step.error && (
                    <span className="text-2xs text-error/80 truncate max-w-[200px]">
                      {step.error}
                    </span>
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
