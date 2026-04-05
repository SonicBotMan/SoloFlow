import type { Node, Edge } from '@xyflow/react';
import type { DAGWorkflow, AgentNodeData } from './types';

export function flowToDag(
  nodes: Node[],
  edges: Edge[],
  name: string
): DAGWorkflow {
  const steps = nodes.map((node) => {
    const data = node.data as unknown as AgentNodeData;
    const dependsOn = edges
      .filter((e) => e.target === node.id)
      .map((e) => e.source);

    return {
      id: node.id,
      name: data.label,
      discipline: data.discipline,
      model: data.model,
      prompt: data.prompt,
      depends_on: dependsOn,
      temperature: data.temperature,
      max_tokens: data.maxTokens,
    };
  });

  return {
    name,
    version: '1.0',
    steps,
  };
}
