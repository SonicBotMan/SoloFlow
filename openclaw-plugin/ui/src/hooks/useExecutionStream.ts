import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ConnectionConfig,
  ExecutionStep,
  ExecutionWorkflow,
  StreamEvent,
  StepLogEntry,
} from '../types/execution';

interface UseExecutionStreamReturn {
  workflow: ExecutionWorkflow | null;
  connected: boolean;
  connectionMethod: 'websocket' | 'sse' | 'polling' | 'none';
  error: string | null;
  reconnect: () => void;
}

const DEFAULT_CONFIG: Required<ConnectionConfig> = {
  url: '',
  reconnectInterval: 3000,
  maxReconnectAttempts: 10,
  fallbackToSSE: true,
  fallbackToPolling: true,
  pollingInterval: 2000,
};

function buildWsUrl(workflowId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/v1/workflows/${workflowId}/stream`;
}

function buildSSEUrl(workflowId: string): string {
  return `/api/v1/workflows/${workflowId}/stream`;
}

function buildPollUrl(workflowId: string): string {
  return `/api/v1/workflows/${workflowId}`;
}

function addLog(step: ExecutionStep, level: StepLogEntry['level'], message: string): StepLogEntry[] {
  const entry: StepLogEntry = { timestamp: Date.now(), level, message };
  return [...step.logs, entry];
}

function applyEvent(workflow: ExecutionWorkflow, event: StreamEvent): ExecutionWorkflow {
  const steps = workflow.steps.map((step) => {
    if (step.id !== event.stepId) return step;
    switch (event.type) {
      case 'workflow:step_start':
        return {
          ...step,
          state: 'running' as const,
          startedAt: event.timestamp,
          logs: addLog(step, 'info', `Step started (${step.discipline})`),
        };
      case 'workflow:step_complete':
        return {
          ...step,
          state: 'completed' as const,
          completedAt: event.timestamp,
          durationMs: step.startedAt ? event.timestamp - step.startedAt : undefined,
          result: event.result,
          output: event.result,
          logs: addLog(step, 'info', `Step completed in ${step.startedAt ? event.timestamp - step.startedAt : 0}ms`),
        };
      case 'workflow:step_fail':
        return {
          ...step,
          state: 'failed' as const,
          completedAt: event.timestamp,
          durationMs: step.startedAt ? event.timestamp - step.startedAt : undefined,
          error: event.error,
          logs: addLog(step, 'error', `Step failed: ${event.error ?? 'unknown error'}`),
        };
      case 'workflow:step_skip':
        return {
          ...step,
          state: 'skipped' as const,
          logs: addLog(step, 'warn', 'Step skipped'),
        };
      default:
        return step;
    }
  });

  const completedCount = steps.filter((s) => s.state === 'completed' || s.state === 'failed' || s.state === 'skipped').length;
  const progress = steps.length > 0 ? completedCount / steps.length : 0;

  let state = workflow.state;
  if (event.type === 'workflow:started') state = 'running';
  if (event.type === 'workflow:complete') state = 'completed';
  if (event.type === 'workflow:failed') state = 'failed';

  return {
    ...workflow,
    steps,
    state,
    progress,
    completedAt: state === 'completed' || state === 'failed' ? event.timestamp : undefined,
  };
}

export function useExecutionStream(
  workflowId: string,
  config?: Partial<ConnectionConfig>,
): UseExecutionStreamReturn {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const [workflow, setWorkflow] = useState<ExecutionWorkflow | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionMethod, setConnectionMethod] = useState<UseExecutionStreamReturn['connectionMethod']>('none');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setConnected(false);
    setConnectionMethod('none');
  }, []);

  const handleEvent = useCallback((event: StreamEvent) => {
    if (!mountedRef.current) return;
    setWorkflow((prev) => {
      if (!prev) {
        return {
          id: event.workflowId,
          name: `Workflow ${event.workflowId.slice(0, 8)}`,
          description: '',
          state: 'running',
          steps: [],
          edges: [],
          progress: 0,
          startedAt: event.timestamp,
        };
      }
      return applyEvent(prev, event);
    });
  }, []);

  const connectWebSocket = useCallback(() => {
    const url = cfg.url || buildWsUrl(workflowId);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
      setConnectionMethod('websocket');
      setError(null);
      reconnectAttemptRef.current = 0;
    };

    ws.onmessage = (e) => {
      try {
        const event: StreamEvent = JSON.parse(e.data as string);
        handleEvent(event);
      } catch { /* ignore malformed messages */ }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      setConnectionMethod('none');
      if (reconnectAttemptRef.current < cfg.maxReconnectAttempts) {
        reconnectTimerRef.current = setTimeout(() => {
          reconnectAttemptRef.current++;
          connectWebSocket();
        }, cfg.reconnectInterval);
      } else if (cfg.fallbackToSSE) {
        connectSSE();
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection failed');
    };
  }, [cfg, workflowId, handleEvent]);

  const connectSSE = useCallback(() => {
    const url = cfg.url || buildSSEUrl(workflowId);
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
      setConnectionMethod('sse');
      setError(null);
    };

    es.onmessage = (e) => {
      try {
        const event: StreamEvent = JSON.parse(e.data);
        handleEvent(event);
      } catch { /* ignore */ }
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      setConnectionMethod('none');
      es.close();
      if (cfg.fallbackToPolling) {
        startPolling();
      }
    };
  }, [cfg, workflowId, handleEvent]);

  const fetchWorkflowState = useCallback(async () => {
    try {
      const url = cfg.url || buildPollUrl(workflowId);
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (mountedRef.current) {
        setWorkflow(data);
        setConnected(true);
        setConnectionMethod('polling');
        setError(null);
      }
    } catch {
      if (mountedRef.current) setError('Polling fetch failed');
    }
  }, [cfg.url, workflowId]);

  const startPolling = useCallback(() => {
    fetchWorkflowState();
    pollTimerRef.current = setInterval(fetchWorkflowState, cfg.pollingInterval);
  }, [fetchWorkflowState, cfg.pollingInterval]);

  const reconnect = useCallback(() => {
    cleanup();
    reconnectAttemptRef.current = 0;
    setError(null);
    connectWebSocket();
  }, [cleanup, connectWebSocket]);

  useEffect(() => {
    mountedRef.current = true;
    connectWebSocket();
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [connectWebSocket, cleanup]);

  return { workflow, connected, connectionMethod, error, reconnect };
}
