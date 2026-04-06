// @ts-nocheck
/**
 * SoloFlow — Plugin Entry Point (OpenClaw definePluginEntry)
 *
 * Wires together all subsystems and registers them via the OpenClaw plugin SDK.
 */

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type {
  AgentDiscipline,
  StepId,
  WorkflowId,
  WorkflowState,
} from "./types";

// ─── Component imports ──────────────────────────────────────────────────

import { WorkflowService } from "./services/workflow-service";
import { Scheduler } from "./services/scheduler";
import { TemplateRegistry } from "./services/template-registry";
import {
  HookSystem,
  type HookEvent,
  registerBuiltinHooks,
  getMetrics,
} from "./hooks/index";
import { allAgents } from "./agents/discipline";

// ─── Phase 2 imports ────────────────────────────────────────────────────

import { MemorySystem, type MemorySystemConfig } from "./memory/index";
import { SkillEvolutionSystem } from "./skills/index";
import { createMCPServer } from "./mcp/index";
import { MultiAgentCoordinator } from "./coordination/index";
import { VectorSearchSystem, type VectorSearchSystemConfig } from "./vector/index";

// ─── Phase 3 & 4 imports ────────────────────────────────────────────────

import { MultiUserSystem } from "./multiuser/index";
import { MarketplaceSystem } from "./marketplace/index";

// ─── Plugin metadata ────────────────────────────────────────────────────

const PLUGIN_NAME = "soloflow";
const PLUGIN_VERSION = "0.1.0";

// ─── Internal config type ───────────────────────────────────────────────

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
  enabled?: boolean;
}

// ─── State event type (reused from types) ───────────────────────────────

type StateEvent =
  | { type: "workflow:created"; workflowId: WorkflowId }
  | { type: "workflow:state_changed"; workflowId: WorkflowId; from: WorkflowState; to: WorkflowState }
  | { type: "workflow:deleted"; workflowId: WorkflowId }
  | { type: "step:started"; workflowId: WorkflowId; stepId: StepId }
  | { type: "step:completed"; workflowId: WorkflowId; stepId: StepId; result: unknown }
  | { type: "step:failed"; workflowId: WorkflowId; stepId: StepId; error: string }
  | { type: "step:skipped"; workflowId: WorkflowId; stepId: StepId };

// ─── Minimal logger ─────────────────────────────────────────────────────

const logger = {
  info: (...args: unknown[]) => console.log(`[${PLUGIN_NAME}]`, ...args),
  warn: (...args: unknown[]) => console.warn(`[${PLUGIN_NAME}]`, ...args),
  error: (...args: unknown[]) => console.error(`[${PLUGIN_NAME}]`, ...args),
  debug: (...args: unknown[]) => console.debug(`[${PLUGIN_NAME}]`, ...args),
};

// ─── Entry point ────────────────────────────────────────────────────────

export default definePluginEntry({
  id: "workflow-orchestration",
  name: "SoloFlow",
  description: "DAG-based workflow orchestration with discipline agents",
  register(api: OpenClawPluginApi) {
    // Config: read from pluginConfig (set via openclaw.plugin.json configSchema)
    const rawConfig = (api as unknown as Record<string, unknown>)["pluginConfig"];
    const config: PluginConfig = (rawConfig ?? {}) as PluginConfig;

    logger.info(`v${PLUGIN_VERSION} activating…`);

    // ── 1. Core services ──────────────────────────────────────────────

    const workflowService = new WorkflowService();
    const templateRegistry = new TemplateRegistry();

    const scheduler = new Scheduler(workflowService, {
      maxConcurrency: config.maxConcurrency,
      retryAttempts: config.retryAttempts,
      retryDelayMs: config.retryDelayMs,
      timeoutMs: config.stepTimeoutMs,
    });

    const agents = allAgents();

    // ── 2. Hook system (internal) ────────────────────────────────────

    const hookSystem = new HookSystem();
    const unregisterBuiltinHooks = registerBuiltinHooks(hookSystem);

    const STATE_TO_HOOK: Partial<Record<string, HookEvent>> = {
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
      } catch (e) {
        logger.warn("hook emission error:", e);
      }
    });

    // ── 3. Memory system ────────────────────────────────────────────

    const memorySystem = new MemorySystem(config.memory);
    memorySystem.init().catch((e: unknown) => logger.warn("memory init failed:", e));

    // ── 4. Vector search system ─────────────────────────────────────

    const vectorSearchSystem = new VectorSearchSystem(config.vector ?? { embedding: { type: "local" }, search: {} });
    vectorSearchSystem.init().catch((e: unknown) => logger.warn("vector init failed:", e));
    vectorSearchSystem.setSemanticMemory(memorySystem.semantic);
    vectorSearchSystem.setEpisodicMemory(memorySystem.episodic);

    // ── 5. Skill evolution system ────────────────────────────────────

    const shimApi = {
      logger,
      services: new Map<string, unknown>(),
      config: { get: (_key: string, def?: unknown) => def },
      state: new Map<string, unknown>(),
    };
    const skillEvolutionSystem = new SkillEvolutionSystem(shimApi as never);

    // ── 6. MCP server ───────────────────────────────────────────────

    const mcpBundle = createMCPServer({
      workflowService,
      scheduler,
      templateRegistry,
      api: shimApi as never,
    });

    // ── 7. Multi-agent coordination ──────────────────────────────────

    const coordinator = new MultiAgentCoordinator();

    // ── Phase 4: Multi-user system ──────────────────────────────────

    const multiUserSystem = new MultiUserSystem(config.multiuser);

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
        } catch (e) {
          logger.warn("skill→marketplace bridge error:", e);
        }
      }
    });

    // ── Hook: workflow:completed → Phase 2 subsystems ─────────────────

    const unregisterPhase2Hook = hookSystem.register("workflow:completed", async (ctx) => {
      try {
        const workflow = ctx.workflow;
        if (!workflow) return;
        await memorySystem.storeWorkflowExecution(workflow);
        await skillEvolutionSystem.onWorkflowComplete(workflow);
        await vectorSearchSystem.indexWorkflow(workflow);
      } catch (e) {
        logger.warn("Phase 2 hook error:", e);
      }
    });

    // ── 8. Register OpenClaw tools ──────────────────────────────────

    api.registerTool({
      name: "soloflow_create_workflow",
      description: "Create a new SoloFlow workflow from a template or inline steps",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Workflow name" },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                discipline: { type: "string", enum: ["deep", "quick", "visual", "ultrabrain"] },
                action: { type: "string" },
                dependencies: { type: "array", items: { type: "string" } },
                config: { type: "object" },
              },
              required: ["id", "name", "discipline", "action"],
            },
          },
        },
        required: ["name", "steps"],
      },
      async execute(_id: string, params: Record<string, unknown>) {
        const template = {
          name: params["name"] as string,
          description: "",
          steps: (params["steps"] as Array<Record<string, unknown>>).map((s) => ({
            id: s["id"] as StepId,
            name: s["name"] as string,
            discipline: (s["discipline"] ?? "quick") as AgentDiscipline,
            dependencies: (s["dependencies"] ?? []) as StepId[],
            config: (s["config"] ?? {}) as Record<string, unknown>,
          })),
        };
        const wf = await workflowService.create(template as any);
        return { content: [{ type: "text" as const, text: JSON.stringify({ id: wf.id, name: wf.name, state: wf.state }) }] };
      },
    });

    api.registerTool({
      name: "soloflow_start_workflow",
      description: "Start executing a SoloFlow workflow",
      parameters: {
        type: "object",
        properties: {
          workflowId: { type: "string", description: "Workflow ID to start" },
        },
        required: ["workflowId"],
      },
      async execute(_id: string, params: Record<string, unknown>) {
        const wfId = params["workflowId"] as WorkflowId;
        await workflowService.start(wfId);
        scheduler.execute(wfId, shimApi as never).catch((e: unknown) => logger.error("schedule error:", e));
        return { content: [{ type: "text" as const, text: `Workflow ${wfId} started` }] };
      },
    });

    api.registerTool({
      name: "soloflow_status",
      description: "Get the status of a SoloFlow workflow",
      parameters: {
        type: "object",
        properties: {
          workflowId: { type: "string" },
        },
        required: ["workflowId"],
      },
      async execute(_id: string, params: Record<string, unknown>) {
        const wf = workflowService.get(params["workflowId"] as WorkflowId);
        if (!wf) return { content: [{ type: "text" as const, text: "Workflow not found" }] };
        const steps = Array.from(wf.steps.values()).map((s) => ({
          id: s.id, name: s.name, state: s.state,
          error: s.error, result: s.result ? "✓" : undefined,
        }));
        return { content: [{ type: "text" as const, text: JSON.stringify({ id: wf.id, name: wf.name, state: wf.state, steps }, null, 2) }] };
      },
    });

    api.registerTool({
      name: "soloflow_list",
      description: "List all SoloFlow workflows",
      parameters: { type: "object", properties: {} },
      async execute(_id: string) {
        const wfs = workflowService.list();
        return { content: [{ type: "text" as const, text: JSON.stringify(wfs.map((w) => ({ id: w.id, name: w.name, state: w.state })), null, 2) }] };
      },
    });

    api.registerTool({
      name: "soloflow_metrics",
      description: "Get SoloFlow workflow orchestration metrics",
      parameters: { type: "object", properties: {} },
      async execute(_id: string) {
        return { content: [{ type: "text" as const, text: JSON.stringify(getMetrics()) }] };
      },
    });

    // ── 9. Register OpenClaw hook ───────────────────────────────────

    try {
      api.registerHook({
        event: "plugin:deactivate" as Parameters<typeof api.registerHook>[0]["event"],
        handler: () => {
          logger.info("deactivating…");
          skillEvolutionSystem.destroy();
          vectorSearchSystem.close().catch(() => {});
          memorySystem.close().catch(() => {});
          marketplaceSystem.close();
          unregisterSkillMarketplace();
          unregisterPhase2Hook();
          unregisterBuiltinHooks();
          hookSystem.clear();
          workflowSubscription();
          logger.info("deactivated");
        },
      });
    } catch {
      // registerHook may not support this event in all SDK versions
    }

    // ── 10. Register OpenClaw command ────────────────────────────────

    try {
      api.registerCommand({
        name: "soloflow",
        description: "SoloFlow workflow commands",
        handler: async () => {
          return "SoloFlow commands: Use agent tools soloflow_create_workflow, soloflow_start_workflow, soloflow_status, soloflow_list";
        },
      });
    } catch {
      // registerCommand may not be available in all SDK versions
    }

    // Suppress unused variable warnings (these subsystems are initialized for future use)
    void mcpBundle;
    void coordinator;
    void multiUserSystem;

    logger.info(
      `activated — ` +
      `${agents.size} discipline agents, ` +
      `memory, skills, MCP, coordination, vector search, marketplace ready`,
    );
  },
});

// ─── Named exports ──────────────────────────────────────────────────────

export { WorkflowService } from "./services/workflow-service";
export { Scheduler } from "./services/scheduler";
export { TemplateRegistry } from "./services/template-registry";
export { HookSystem, getMetrics } from "./hooks/index";
export { DisciplineAgent, allAgents, getAgent } from "./agents/discipline";
export { MemorySystem } from "./memory/index";
export { SkillEvolutionSystem } from "./skills/index";
export { MCPServer, createMCPServer } from "./mcp/index";
export { MultiAgentCoordinator } from "./coordination/index";
export { VectorSearchSystem } from "./vector/index";
export { MultiUserSystem } from "./multiuser/index";
export { MarketplaceSystem } from "./marketplace/index";
export { dagToYaml, yamlToDag, validateWorkflow, previewWorkflow } from "./visual/index";
export type {
  OpenClawApi, PluginManifest,
  SchedulerOptions, Workflow, WorkflowId, WorkflowStep, WorkflowState,
} from "./types";
