/**
 * SoloFlow — Plugin Entry Point
 *
 * Wires together all subsystems:
 *   WorkflowService → Scheduler → DisciplineAgents
 *   HookSystem → registerBuiltinHooks → registerHooks (OpenClaw bridge)
 *   WorkflowCommands → /workflow slash commands
 *   RPCRouter → programmatic RPC methods
 *   MemorySystem → LobsterPress bridge → episodic/semantic/working memory
 *   SkillEvolutionSystem → task detection → skill auto-generation
 *   MCPServer → SoloFlow MCP tools → OpenClaw RPC bridge
 *   MultiAgentCoordinator → team builder → load balancer → model selector
 *   VectorSearchSystem → hybrid retrieval → embedding indexer
 *
 * Follows the OpenClaw plugin lifecycle:
 *   export default (api) => deactivator
 */

import type {
  AgentDiscipline,
  AgentResult,
  OpenClawApi,
  PluginManifest,
  StateEvent,
  StepId,
  Workflow,
  WorkflowId,
  WorkflowState,
  WorkflowStep,
} from "./types";

// ─── Component imports ──────────────────────────────────────────────────

import { WorkflowService } from "./services/workflow-service";
import { Scheduler } from "./services/scheduler";
import { TemplateRegistry } from "./services/template-registry";
import {
  HookSystem,
  type HookEvent,
  registerBuiltinHooks,
  registerHooks,
  getMetrics,
} from "./hooks/index";
import { createWorkflowCommands } from "./commands/index";
import { RPCRouter } from "./rpc/index";
import { DisciplineAgent, allAgents, getAgent } from "./agents/discipline";

// ─── Phase 2 imports ────────────────────────────────────────────────────

import { MemorySystem, type MemorySystemConfig } from "./memory/index";
import { SkillEvolutionSystem } from "./skills/index";
import { createMCPServer } from "./mcp/index";
import { MultiAgentCoordinator } from "./coordination/index";
import { VectorSearchSystem, type VectorSearchSystemConfig } from "./vector/index";

// ─── Phase 3 & 4 imports ────────────────────────────────────────────────

import { MultiUserSystem } from "./multiuser/index";
import { registerApiWithPlugin } from "./api/index";
import { MarketplaceSystem } from "./marketplace/index";

// ─── Plugin metadata ────────────────────────────────────────────────────

const PLUGIN_NAME = "soloflow";
const PLUGIN_VERSION = "0.1.0";

export const manifest: PluginManifest = {
  name: PLUGIN_NAME,
  version: PLUGIN_VERSION,
  description: "DAG-based workflow orchestration with discipline agents",
  provides: [
    "soloflow.workflow-service",
    "soloflow.scheduler-service",
    "soloflow.agent-service",
    "soloflow.state-service",
    "soloflow.hook-system",
    "soloflow.memory-service",
    "soloflow.skill-service",
    "soloflow.mcp-service",
    "soloflow.coordination-service",
    "soloflow.vector-service",
    "soloflow.multiuser-auth",
    "soloflow.api-server",
    "soloflow.marketplace",
  ],
};

// ─── Plugin config schema ───────────────────────────────────────────────

interface PluginConfig {
  maxConcurrency?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  stepTimeoutMs?: number;
  defaultDiscipline?: AgentDiscipline;
  memory?: MemorySystemConfig;
  vector?: VectorSearchSystemConfig;
  multiuser?: { jwtSecret?: string };
  marketplace?: { dbPath?: string; clawhubEndpoint?: string };
}

// ─── Plugin activation ──────────────────────────────────────────────────

export default async function activate(api: OpenClawApi): Promise<() => void> {
  api.logger.info(`[${PLUGIN_NAME}] v${PLUGIN_VERSION} activating…`);

  const config = api.config.get<PluginConfig>("workflow-orchestration", {});

  // ── 1. Core services ──────────────────────────────────────────────────

  const workflowService = new WorkflowService();
  const templateRegistry = new TemplateRegistry();

  const scheduler = new Scheduler(workflowService, {
    maxConcurrency: config.maxConcurrency,
    retryAttempts: config.retryAttempts,
    retryDelayMs: config.retryDelayMs,
    timeoutMs: config.stepTimeoutMs,
  });

  const agents = allAgents();

  // ── 2. Hook system ────────────────────────────────────────────────────

  const hookSystem = new HookSystem();
  const unregisterBuiltinHooks = registerBuiltinHooks(hookSystem);

  const STATE_TO_HOOK: Partial<Record<StateEvent["type"], HookEvent>> = {
    "workflow:created": "workflow:created",
    "workflow:state_changed": "workflow:state_changed",
    "step:started": "step:starting",
    "step:completed": "step:completed",
    "step:failed": "step:failed",
  };

  const HOOK_FROM_TRANSITION: Partial<Record<string, HookEvent>> = {
    running: "workflow:started",
    paused: "workflow:paused",
    completed: "workflow:completed",
    failed: "workflow:failed",
    cancelled: "workflow:cancelled",
  };

  const workflowSubscription = workflowService.subscribe((event: StateEvent) => {
    try {
      if (event.type === "workflow:state_changed") {
        const { workflowId, to } = event as { workflowId: WorkflowId; to: WorkflowState };
        const derived = HOOK_FROM_TRANSITION[to];
        if (derived) {
          hookSystem.emit(derived, {
            event: derived,
            workflow: workflowService.get(workflowId),
            timestamp: Date.now(),
            metadata: event as Record<string, unknown>,
          });
        }
        return;
      }

      const hookEvent = STATE_TO_HOOK[event.type];
      if (!hookEvent) return;

      const workflowId = (event as { workflowId?: WorkflowId }).workflowId;
      const workflow = workflowId ? workflowService.get(workflowId) : undefined;
      const stepId = (event as { stepId?: StepId }).stepId;

      hookSystem.emit(hookEvent, {
        event: hookEvent,
        workflow,
        step: stepId && workflow ? workflow.steps.get(stepId) : undefined,
        timestamp: Date.now(),
      });
    } catch {
      // swallow hook emission errors
    }
  });

  const unregisterHostHooks = registerHooks(api, hookSystem);

  // ── 3. Phase 2: Memory system ────────────────────────────────────────

  const memorySystem = new MemorySystem(config.memory);
  await memorySystem.init();

  // ── 4. Phase 2: Vector search system ─────────────────────────────────

  const vectorSearchSystem = new VectorSearchSystem(config.vector ?? { embedding: { type: "local" }, search: {} });
  await vectorSearchSystem.init();
  vectorSearchSystem.setSemanticMemory(memorySystem.semantic);
  vectorSearchSystem.setEpisodicMemory(memorySystem.episodic);

  // ── 5. Phase 2: Skill evolution system ────────────────────────────────

  const skillEvolutionSystem = new SkillEvolutionSystem(api);

  // ── 6. Phase 2: MCP server ───────────────────────────────────────────

  const mcpBundle = createMCPServer({
    workflowService,
    scheduler,
    templateRegistry,
    api,
  });
  const unregisterMCP = mcpBundle.registerWithOpenClaw(api);

  // ── 7. Phase 2: Multi-agent coordination ──────────────────────────────

  const coordinator = new MultiAgentCoordinator();

  // ── Phase 4: Multi-user system ──────────────────────────────────

  const multiUserSystem = new MultiUserSystem(config.multiuser);
  const unregisterMultiUser = multiUserSystem.initialize(api);

  // ── Phase 3: Marketplace system ────────────────────────────────────

  const marketplaceSystem = new MarketplaceSystem(config.marketplace);

  // ── Wire: skill evolution → marketplace ──────────────────────────

  const unregisterSkillMarketplace = skillEvolutionSystem.subscribe((event) => {
    if (event.type === "skill:installed") {
      try {
        const skill = skillEvolutionSystem.getRegistry().get(event.skillId);
        if (skill) {
          marketplaceSystem.publisher.publishSkill(skill, {
            id: skill.id,
            name: skill.name,
            description: skill.description,
            author: "soloflow",
            version: "1.0.0",
            tags: [skill.discipline],
            category: "auto-generated",
            license: "MIT",
            createdAt: skill.createdAt,
            featured: false,
          });
        }
      } catch { /* best effort */ }
    }
  });

  // ── Phase 4: API server (wired to multi-user auth) ────────────────

  const jwtSecret = config.multiuser?.jwtSecret;
  const unregisterApi = registerApiWithPlugin(
    api,
    { workflowService, scheduler, templateRegistry },
    jwtSecret ? { jwt: { secret: jwtSecret }, requireAuth: true } : undefined,
  );

  // ── 8. Hook: workflow:completed → Phase 2 subsystems ─────────────────

  const unregisterPhase2Hook = hookSystem.register("workflow:completed", async (ctx) => {
    try {
      const workflow = ctx.workflow;
      if (!workflow) return;

      await memorySystem.storeWorkflowExecution(workflow);
      await skillEvolutionSystem.onWorkflowComplete(workflow);
      await vectorSearchSystem.indexWorkflow(workflow);
    } catch {
      // swallow Phase 2 hook errors
    }
  });

  // ── 9. Commands & RPC ───────────────────────────────────────────────

  const commandRegistration = createWorkflowCommands(workflowService, scheduler);
  api.commands.register(commandRegistration);

  const rpcRouter = new RPCRouter(workflowService, scheduler, api);
  const rpcMethods = rpcRouter.register();
  for (const method of rpcMethods) {
    api.rpc.register(method);
  }

  // ── 10. Service registration ─────────────────────────────────────────

  const stateService = {
    getWorkflow: (id: WorkflowId): Workflow | undefined => workflowService.get(id),
    setWorkflow: (wf: Workflow): void => {
      workflowService.update(wf);
    },
    deleteWorkflow: (id: WorkflowId): void => {
      try { workflowService.delete(id); } catch { /* already gone */ }
    },
    listWorkflows: (filter?: { status?: WorkflowState; template?: string; limit?: number; offset?: number }) =>
      workflowService.list(filter),
    subscribe: (listener: (event: StateEvent) => void): (() => void) =>
      workflowService.subscribe(listener),
  };
  api.services.register("soloflow.state-service", stateService);

  const agentService = {
    execute: async (step: WorkflowStep): Promise<AgentResult> => {
      const agent = getAgent(step.discipline);
      return agent.execute(step, api);
    },
    getCapabilities: (): AgentDiscipline[] => Array.from(agents.keys()),
    getAgent: (discipline: AgentDiscipline): DisciplineAgent => getAgent(discipline),
  };
  api.services.register("soloflow.agent-service", agentService);

  const schedulerService = {
    execute: (workflowId: WorkflowId) => scheduler.execute(workflowId, api),
    cancel: (workflowId: WorkflowId) => scheduler.cancel(workflowId),
    getStatus: (workflowId: WorkflowId) => scheduler.getStatus(workflowId),
  };
  api.services.register("soloflow.scheduler-service", schedulerService);

  api.services.register("soloflow.workflow-service", workflowService);
  api.services.register("soloflow.hook-system", hookSystem);

  api.services.register("soloflow.memory-service", memorySystem);
  api.services.register("soloflow.skill-service", skillEvolutionSystem);
  api.services.register("soloflow.mcp-service", mcpBundle.server);
  api.services.register("soloflow.coordination-service", coordinator);
  api.services.register("soloflow.vector-service", vectorSearchSystem);

  api.services.register("soloflow.marketplace", marketplaceSystem);

  // ── 11. Metrics endpoint ─────────────────────────────────────────────

  api.rpc.register({
    name: "soloflow.metrics",
    description: "Get workflow orchestration metrics",
    handler: async () => getMetrics(),
  });

  // ── 12. Deactivation ─────────────────────────────────────────────────

  const deactivating = { value: false };

  api.events.on("plugin:deactivate", () => {
    if (deactivating.value) return;
    deactivating.value = true;
    deactivate();
  });

  function deactivate(): void {
    api.logger.info(`[${PLUGIN_NAME}] deactivating…`);

    skillEvolutionSystem.destroy();
    vectorSearchSystem.close().catch(() => {});
    memorySystem.close().catch(() => {});

    marketplaceSystem.close();

    unregisterSkillMarketplace();
    unregisterMultiUser();
    unregisterApi();

    unregisterPhase2Hook();
    unregisterMCP();

    for (const method of rpcMethods) {
      try { api.rpc.unregister(method.name); } catch { /* best effort */ }
    }
    try { api.rpc.unregister("soloflow.metrics"); } catch { /* best effort */ }

    try { api.commands.unregister("workflow"); } catch { /* best effort */ }

    unregisterHostHooks();
    unregisterBuiltinHooks();
    hookSystem.clear();

    workflowSubscription();

    const serviceNames = [
      "soloflow.marketplace",
      "soloflow.vector-service",
      "soloflow.coordination-service",
      "soloflow.mcp-service",
      "soloflow.skill-service",
      "soloflow.memory-service",
      "soloflow.state-service",
      "soloflow.agent-service",
      "soloflow.scheduler-service",
      "soloflow.workflow-service",
      "soloflow.hook-system",
    ];
    for (const name of serviceNames) {
      try { api.services.unregister(name); } catch { /* best effort */ }
    }

    api.logger.info(`[${PLUGIN_NAME}] deactivated`);
  }

  api.logger.info(
    `[${PLUGIN_NAME}] activated — ` +
    `${rpcMethods.length + 1} RPC methods, ` +
    `/workflow commands, ` +
    `${agents.size} discipline agents, ` +
    `memory, skills, MCP, coordination, vector search, multi-user, API, marketplace ready`,
  );

  return deactivate;
}

// ─── Named exports ──────────────────────────────────────────────────────

export { WorkflowService } from "./services/workflow-service";
export { Scheduler } from "./services/scheduler";
export { TemplateRegistry } from "./services/template-registry";
export { HookSystem, getMetrics } from "./hooks/index";
export { RPCRouter } from "./rpc/index";
export { DisciplineAgent, allAgents, getAgent } from "./agents/discipline";
export { MemorySystem } from "./memory/index";
export { SkillEvolutionSystem } from "./skills/index";
export { MCPServer, createMCPServer } from "./mcp/index";
export { MultiAgentCoordinator } from "./coordination/index";
export { VectorSearchSystem } from "./vector/index";
export { MultiUserSystem } from "./multiuser/index";
export { registerApiWithPlugin, createApiServer } from "./api/index";
export type { ApiServer, ApiServerConfig } from "./api/index";
export { MarketplaceSystem } from "./marketplace/index";
export type { MarketplaceSystemConfig } from "./marketplace/index";
export { dagToYaml, yamlToDag, validateWorkflow, previewWorkflow } from "./visual/index";
export type { WorkflowMetadata, ValidationResult } from "./visual/index";
export type { OpenClawApi, PluginManifest, SchedulerOptions, Workflow, WorkflowId, WorkflowStep, WorkflowState } from "./types";
