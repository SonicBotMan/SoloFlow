import { useState } from 'react';
import type { ExecutionStep, LogLevel } from '../types/execution';

interface StepLogPanelProps {
  step: ExecutionStep;
  expanded: boolean;
  onToggle: () => void;
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  info: 'text-text-secondary',
  warn: 'text-warning',
  error: 'text-error',
};

const LEVEL_BADGES: Record<LogLevel, string> = {
  info: 'bg-accent/15 text-accent',
  warn: 'bg-warning/15 text-warning',
  error: 'bg-error/15 text-error',
};

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

export function StepLogPanel({ step, expanded, onToggle }: StepLogPanelProps) {
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all');

  const filteredLogs = levelFilter === 'all'
    ? step.logs
    : step.logs.filter((l) => l.level === levelFilter);

  const logText = filteredLogs.map((l) => `[${formatTimestamp(l.timestamp)}] ${l.level.toUpperCase()}: ${l.message}`).join('\n');

  const handleCopy = async () => {
    const fullText = [
      `Step: ${step.name} (${step.discipline})`,
      `State: ${step.state}`,
      step.error ? `Error: ${step.error}` : '',
      step.input ? `Input:\n${formatValue(step.input)}` : '',
      step.output ? `Output:\n${formatValue(step.output)}` : '',
      `--- Logs ---`,
      logText,
    ].filter(Boolean).join('\n');

    await navigator.clipboard.writeText(fullText);
  };

  return (
    <div className="border border-border-subtle rounded-md overflow-hidden animate-fade-in">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 bg-surface-2 hover:bg-surface-3 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-3 h-3 text-text-tertiary transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
          </svg>
          <span className="text-xs font-medium text-text-secondary font-mono">
            {step.name}
          </span>
          <span className="text-2xs text-text-tertiary">
            {step.logs.length} {step.logs.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {step.durationMs != null && (
            <span className="text-2xs text-text-tertiary font-mono">
              {step.durationMs}ms
            </span>
          )}
          <span className={`text-2xs px-1.5 py-0.5 rounded-sm font-medium ${
            step.state === 'completed' ? 'bg-success/15 text-success' :
            step.state === 'failed' ? 'bg-error/15 text-error' :
            step.state === 'running' ? 'bg-accent/15 text-accent' :
            'bg-surface-3 text-text-tertiary'
          }`}>
            {step.state}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="animate-fade-in">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-1 border-y border-border-subtle">
            <span className="text-2xs text-text-tertiary">Filter:</span>
            {(['all', 'info', 'warn', 'error'] as const).map((level) => (
              <button
                key={level}
                onClick={() => setLevelFilter(level)}
                className={`text-2xs px-1.5 py-0.5 rounded-sm transition-colors ${
                  levelFilter === level
                    ? 'bg-accent/20 text-accent'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {level === 'all' ? 'All' : level.toUpperCase()}
              </button>
            ))}
            <button
              onClick={handleCopy}
              className="ml-auto text-2xs text-text-tertiary hover:text-text-secondary transition-colors flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              Copy
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto">
            {filteredLogs.length === 0 ? (
              <div className="px-3 py-3 text-2xs text-text-tertiary italic">
                No log entries match filter.
              </div>
            ) : (
              filteredLogs.map((log, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 px-3 py-1 font-mono text-2xs border-b border-border-subtle last:border-b-0 hover:bg-surface-2/50"
                >
                  <span className="text-text-tertiary shrink-0">
                    {formatTimestamp(log.timestamp)}
                  </span>
                  <span className={`shrink-0 px-1 rounded-sm ${LEVEL_BADGES[log.level]}`}>
                    {log.level.toUpperCase().padEnd(5)}
                  </span>
                  <span className={LEVEL_COLORS[log.level]}>{log.message}</span>
                </div>
              ))
            )}
          </div>

          {(step.input || step.output || step.error) && (
            <div className="border-t border-border-subtle">
              {step.error && (
                <div className="px-3 py-2 bg-error/5">
                  <span className="text-2xs font-medium text-error">Error: </span>
                  <span className="text-2xs text-error/80 font-mono">{step.error}</span>
                </div>
              )}
              {step.input != null && (
                <details className="group">
                  <summary className="px-3 py-1.5 text-2xs text-text-tertiary hover:text-text-secondary cursor-pointer">
                    Input
                  </summary>
                  <pre className="px-3 pb-2 text-2xs font-mono text-text-secondary whitespace-pre-wrap">
                    {String(formatValue(step.input))}
                  </pre>
                </details>
              )}
              {step.output != null && (
                <details className="group">
                  <summary className="px-3 py-1.5 text-2xs text-text-tertiary hover:text-text-secondary cursor-pointer">
                    Output
                  </summary>
                  <pre className="px-3 pb-2 text-2xs font-mono text-text-secondary whitespace-pre-wrap">
                    {String(formatValue(step.output))}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
