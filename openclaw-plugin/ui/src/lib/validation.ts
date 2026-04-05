import type { Node, Edge } from '@xyflow/react';
import type { AgentNodeData } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateWorkflow(nodes: Node[], edges: Edge[]): ValidationResult {
  const errors: string[] = [];

  if (nodes.length === 0) {
    return { valid: false, errors: ['Workflow is empty — add at least one step.'] };
  }

  const nodeIds = new Set(nodes.map((n) => n.id));

  for (const node of nodes) {
    const data = node.data as unknown as AgentNodeData;

    if (!data.label?.trim()) {
      errors.push(`Node "${node.id}" has no label.`);
    }
    if (!data.prompt?.trim()) {
      errors.push(`Node "${data.label || node.id}" has no prompt.`);
    }
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push(`Edge references missing source node "${edge.source}".`);
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`Edge references missing target node "${edge.target}".`);
    }
    if (edge.source === edge.target) {
      errors.push(`Node "${edge.source}" has a self-referencing dependency.`);
    }
  }

  const cycleError = detectCycle(nodes, edges);
  if (cycleError) {
    errors.push(cycleError);
  }

  const roots = nodes.filter(
    (n) => !edges.some((e) => e.target === n.id)
  );
  if (roots.length === 0 && nodes.length > 1) {
    errors.push('No entry point found — all nodes have dependencies, creating a cycle.');
  }

  return { valid: errors.length === 0, errors };
}

function detectCycle(nodes: Node[], edges: Edge[]): string | null {
  const adj = new Map<string, string[]>();
  for (const node of nodes) {
    adj.set(node.id, []);
  }
  for (const edge of edges) {
    adj.get(edge.source)?.push(edge.target);
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const node of nodes) {
    color.set(node.id, WHITE);
  }

  function dfs(id: string): boolean {
    color.set(id, GRAY);
    for (const neighbor of adj.get(id) ?? []) {
      const c = color.get(neighbor);
      if (c === GRAY) return true;
      if (c === WHITE && dfs(neighbor)) return true;
    }
    color.set(id, BLACK);
    return false;
  }

  for (const node of nodes) {
    if (color.get(node.id) === WHITE) {
      if (dfs(node.id)) {
        return 'Circular dependency detected in the workflow.';
      }
    }
  }

  return null;
}
