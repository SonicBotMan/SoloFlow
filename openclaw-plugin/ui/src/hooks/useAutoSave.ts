import { useEffect, useRef, useCallback } from 'react';
import { useWorkflowStore } from './useWorkflowStore';
import { flowToDag } from '../lib/flowToDag';

export function useAutoSave(intervalMs = 5000) {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const isDirty = useWorkflowStore((s) => s.isDirty);
  const markClean = useWorkflowStore((s) => s.markClean);
  const lastSavedRef = useRef<string>('');

  const save = useCallback(async () => {
    const dag = flowToDag(nodes, edges, workflowName);
    const serialized = JSON.stringify(dag);
    if (serialized === lastSavedRef.current) return;

    try {
      const res = await fetch('/api/workflow/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serialized,
      });
      if (res.ok) {
        lastSavedRef.current = serialized;
        markClean();
      }
    } catch {
      // Backend not available — persist to localStorage as fallback
      localStorage.setItem('soloflow-autosave', serialized);
      lastSavedRef.current = serialized;
      markClean();
    }
  }, [nodes, edges, workflowName, markClean]);

  useEffect(() => {
    if (!isDirty) return;
    const timer = setInterval(save, intervalMs);
    return () => clearInterval(timer);
  }, [isDirty, save, intervalMs]);

  return save;
}
