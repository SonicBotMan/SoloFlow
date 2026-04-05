import type { Node, Edge, MarkerType } from '@xyflow/react';
import type { DAGWorkflow, AgentNodeData } from './types';

export function dagToFlow(dag: DAGWorkflow): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = dag.steps.map((step, index) => ({
    id: step.id,
    type: 'agent',
    position: { x: index * 280, y: index * 120 },
    data: {
      label: step.name,
      discipline: step.discipline,
      model: step.model,
      prompt: step.prompt,
      status: 'idle' as const,
      temperature: step.temperature,
      maxTokens: step.max_tokens,
    } satisfies AgentNodeData,
  }));

  const edges: Edge[] = [];
  for (const step of dag.steps) {
    for (const depId of step.depends_on) {
      edges.push({
        id: `${depId}->${step.id}`,
        source: depId,
        target: step.id,
        type: 'dependency',
        animated: true,
        markerEnd: { type: 'arrowclosed' as MarkerType, width: 16, height: 16 },
        style: { stroke: 'var(--text-tertiary)' },
      });
    }
  }

  return { nodes, edges };
}
