/**
 * SoloFlow — YAML Bidirectional Sync
 * Convert between visual DAG representation and YAML workflow definitions.
 */

import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import type { DAG, DAGNode, DAGEdge, StepId, AgentDiscipline } from "../types.js";

// ─── Public Types ──────────────────────────────────────────────────────

export interface WorkflowMetadata {
  name: string;
  description?: string;
  version?: string;
  author?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Internal YAML shape ───────────────────────────────────────────────

interface YamlStep {
  id: string;
  name: string;
  discipline: AgentDiscipline;
  depends_on: string[];
  config?: Record<string, unknown>;
}

interface YamlWorkflow {
  name?: string;
  description?: string;
  version?: string;
  author?: string;
  steps: YamlStep[];
}

// ─── dagToYaml ─────────────────────────────────────────────────────────

export function dagToYaml(dag: DAG, metadata?: WorkflowMetadata): string {
  const steps: YamlStep[] = [];

  for (const [id, node] of dag.nodes) {
    steps.push({
      id: id as string,
      name: node.action,
      discipline: node.discipline,
      depends_on: node.dependencies.map((d) => d as string),
    });
  }

  const doc: YamlWorkflow = {
    name: metadata?.name ?? "unnamed-workflow",
    description: metadata?.description,
    version: metadata?.version,
    author: metadata?.author,
    steps,
  };

  return yamlStringify(doc, { indentSeq: true, lineWidth: 0 });
}

// ─── yamlToDag ─────────────────────────────────────────────────────────

export function yamlToDag(
  yaml: string,
): { dag: DAG; metadata: WorkflowMetadata } {
  let parsed: unknown;
  try {
    parsed = yamlParse(yaml);
  } catch (err) {
    throw new SyntaxError(
      `Invalid YAML: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("YAML root must be a mapping (object)");
  }

  const root = parsed as Record<string, unknown>;

  const validDisciplines = new Set<string>([
    "deep",
    "quick",
    "visual",
    "ultrabrain",
  ]);

  const rawSteps = root["steps"];
  if (!Array.isArray(rawSteps)) {
    throw new TypeError("YAML must contain a 'steps' array");
  }

  const nodes = new Map<StepId, DAGNode>();
  const edges: DAGEdge[] = [];
  const layerMap = new Map<StepId, number>();

  // First pass: create all nodes
  for (const raw of rawSteps as Record<string, unknown>[]) {
    const id = String(raw["id"] ?? "");
    if (!id) {
      throw new TypeError("Each step must have a non-empty 'id'");
    }

    const discipline = String(raw["discipline"] ?? "quick");
    if (!validDisciplines.has(discipline)) {
      throw new TypeError(
        `Step '${id}' has invalid discipline '${discipline}'. Must be one of: deep, quick, visual, ultrabrain`,
      );
    }

    const deps = Array.isArray(raw["depends_on"])
      ? (raw["depends_on"] as unknown[]).map((d) => String(d) as StepId)
      : [];

    nodes.set(id as StepId, {
      id: id as StepId,
      dependencies: deps,
      discipline: discipline as AgentDiscipline,
      action: String(raw["name"] ?? id),
    });

    for (const dep of deps) {
      edges.push({ from: dep, to: id as StepId });
    }
  }

  // Compute layers via longest-path topological sort
  const visiting = new Set<StepId>();
  const visited = new Set<StepId>();

  function computeLayer(id: StepId): number {
    if (layerMap.has(id)) return layerMap.get(id)!;
    if (visiting.has(id)) {
      // Cycle detected — assign layer 0 for now (validation will catch it)
      layerMap.set(id, 0);
      return 0;
    }

    visiting.add(id);
    const node = nodes.get(id);
    let maxDepLayer = -1;

    if (node) {
      for (const dep of node.dependencies) {
        if (nodes.has(dep)) {
          maxDepLayer = Math.max(maxDepLayer, computeLayer(dep));
        }
      }
    }

    visiting.delete(id);
    visited.add(id);
    const layer = maxDepLayer + 1;
    layerMap.set(id, layer);
    return layer;
  }

  for (const id of nodes.keys()) {
    computeLayer(id);
  }

  // Group into layers
  const maxLayer = Math.max(0, ...Array.from(layerMap.values()));
  const layers: StepId[][] = Array.from({ length: maxLayer + 1 }, () => []);

  for (const [id, layer] of layerMap) {
    layers[layer]!.push(id);
  }

  const dag: DAG = {
    nodes,
    edges,
    layers,
  };

  const metadata: WorkflowMetadata = {
    name: typeof root["name"] === "string" ? root["name"] : "unnamed-workflow",
    description:
      typeof root["description"] === "string" ? root["description"] : undefined,
    version:
      typeof root["version"] === "string" ? root["version"] : undefined,
    author: typeof root["author"] === "string" ? root["author"] : undefined,
  };

  return { dag, metadata };
}

// ─── validateWorkflow ──────────────────────────────────────────────────

export function validateWorkflow(dag: DAG): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeIds = new Set(dag.nodes.keys());

  // 1. Check for cycles via DFS coloring
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<StepId, number>();
  for (const id of nodeIds) color.set(id, WHITE);

  const path: StepId[] = [];

  function dfs(id: StepId): boolean {
    color.set(id, GRAY);
    path.push(id);
    const node = dag.nodes.get(id);
    if (node) {
      for (const dep of node.dependencies) {
        if (color.get(dep) === GRAY) return true;
        if (color.get(dep) === WHITE && dfs(dep)) return true;
      }
    }
    color.set(id, BLACK);
    path.pop();
    return false;
  }

  for (const id of nodeIds) {
    path.length = 0;
    if (color.get(id) === WHITE && dfs(id)) {
      errors.push(
        `Cycle detected: ${path.map((s) => s as string).join(" → ")} → ${(path[0] ?? id) as string}`,
      );
    }
  }

  // 2. Validate all dependencies exist
  for (const [id, node] of dag.nodes) {
    for (const dep of node.dependencies) {
      if (!nodeIds.has(dep)) {
        errors.push(
          `Step '${id as string}' depends on '${dep as string}' which does not exist`,
        );
      }
    }
  }

  // 3. Check for orphaned steps (steps that are never depended upon and have no dependencies)
  const referencedAsTarget = new Set<StepId>();
  for (const edge of dag.edges) {
    referencedAsTarget.add(edge.to);
  }

  for (const [id] of dag.nodes) {
    const node = dag.nodes.get(id);
    if (node && node.dependencies.length === 0 && !referencedAsTarget.has(id)) {
      // This is a root node with no dependents — only warn if there are other steps
      if (dag.nodes.size > 1) {
        // Fine: standalone entry point, not really orphaned
      }
    }
  }

  // Check for steps that are unreachable from any root (no path to them from root nodes)
  const roots: StepId[] = [];
  for (const [id, node] of dag.nodes) {
    if (node.dependencies.length === 0) {
      roots.push(id);
    }
  }

  if (roots.length === 0 && dag.nodes.size > 0) {
    errors.push("No root steps found — every step has at least one dependency");
  }

  const reachable = new Set<StepId>();
  function markReachable(id: StepId): void {
    if (reachable.has(id)) return;
    reachable.add(id);
    const node = dag.nodes.get(id);
    if (node) {
      for (const dep of node.dependencies) {
        markReachable(dep);
      }
    }
  }

  // Walk backwards from all steps to check all deps are reachable
  for (const id of nodeIds) {
    markReachable(id);
  }

  // Check for steps that have no dependents and are not depended upon (truly orphaned)
  const dependedUpon = new Set<StepId>();
  for (const [, node] of dag.nodes) {
    for (const dep of node.dependencies) {
      dependedUpon.add(dep);
    }
  }

  // Also check edges
  for (const edge of dag.edges) {
    dependedUpon.add(edge.from);
  }

  // Steps with no dependencies and nothing depends on them (in a multi-step DAG)
  if (dag.nodes.size > 1) {
    for (const [id, node] of dag.nodes) {
      if (node.dependencies.length === 0 && !dependedUpon.has(id)) {
        warnings.push(
          `Step '${id as string}' is disconnected (no dependencies and nothing depends on it)`,
        );
      }
    }
  }

  // 4. Validate edges are consistent with node dependencies
  for (const edge of dag.edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push(
        `Edge references non-existent source '${edge.from as string}'`,
      );
    }
    if (!nodeIds.has(edge.to)) {
      errors.push(
        `Edge references non-existent target '${edge.to as string}'`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── previewWorkflow ───────────────────────────────────────────────────

export function previewWorkflow(dag: DAG): string {
  const lines: string[] = [];

  if (dag.nodes.size === 0) {
    return "(empty workflow)";
  }

  lines.push("Workflow Preview");
  lines.push("=".repeat(50));
  lines.push("");

  const totalSteps = dag.nodes.size;
  const totalEdges = dag.edges.length;
  lines.push(`Steps: ${totalSteps} | Dependencies: ${totalEdges}`);
  lines.push("");

  // Show execution layers
  if (dag.layers.length > 0) {
    lines.push("Execution Order (by layer):");
    lines.push("-".repeat(40));

    for (let i = 0; i < dag.layers.length; i++) {
      const layer = dag.layers[i]!;
      const stepLabels = layer.map((id) => {
        const node = dag.nodes.get(id);
        const name = node?.action ?? (id as string);
        const deps =
          node && node.dependencies.length > 0
            ? ` [needs: ${node.dependencies.map((d) => d as string).join(", ")}]`
            : "";
        return `${name}${deps}`;
      });

      const prefix =
        layer.length > 1
          ? `  Layer ${i} (parallel):`
          : `  Layer ${i}:`;
      lines.push(prefix);
      for (const label of stepLabels) {
        lines.push(`    - ${label}`);
      }
    }
  }

  lines.push("");
  lines.push("Dependency Graph:");
  lines.push("-".repeat(40));

  for (const [_id, node] of dag.nodes) {
    const name = node.action;
    const discipline = node.discipline;
    if (node.dependencies.length === 0) {
      lines.push(`  ${name} (${discipline}) → entry`);
    } else {
      const deps = node.dependencies.map((d) => {
        const depNode = dag.nodes.get(d);
        return depNode?.action ?? (d as string);
      });
      lines.push(
        `  ${deps.join(" → ")} → ${name} (${discipline})`,
      );
    }
  }

  return lines.join("\n");
}
