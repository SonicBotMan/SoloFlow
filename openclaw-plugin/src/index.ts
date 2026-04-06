/**
 * SoloFlow — Plugin Entry Point (Safe Mode v0.2.0)
 *
 * Minimal, crash-safe entry for OpenClaw.
 * Phase 1: Core workflow CRUD + status tools only.
 * Phase 2 subsystems (memory, vector, skills, marketplace, multi-user)
 * are initialized behind try-catch walls so a failure in any one
 * cannot take down the gateway.
 */

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "@sinclair/typebox";

import { WorkflowService } from "./services/workflow-service.js";
import { Scheduler } from "./services/scheduler.js";
import { TemplateRegistry } from "./services/template-registry.js";
import type { IncomingMessage, ServerResponse } from "node:http";

import type {
  AgentDiscipline,
  StepId,
  WorkflowId,
  WorkflowState,
  Workflow,
  WorkflowStep,
  DAG,
} from "./types.js";


// ─── Plugin metadata ────────────────────────────────────────────────────

const PLUGIN_NAME = "soloflow";
const PLUGIN_VERSION = "0.2.0-safe";

// ─── Entry point ────────────────────────────────────────────────────────

export default definePluginEntry({
  id: "workflow-orchestration",
  name: "SoloFlow",
  description:
    "DAG-based workflow orchestration with discipline agents, memory, and skill evolution",
  register(api: OpenClawPluginApi) {
    const log = api.logger ?? {
      info: (...a: unknown[]) => console.log(`[${PLUGIN_NAME}]`, ...a),
      warn: (...a: unknown[]) => console.warn(`[${PLUGIN_NAME}]`, ...a),
      error: (...a: unknown[]) => console.error(`[${PLUGIN_NAME}]`, ...a),
      debug: (...a: unknown[]) => console.debug(`[${PLUGIN_NAME}]`, ...a),
    };

    log.info(`v${PLUGIN_VERSION} activating (safe mode)…`);

    // ── 1. Core services (pure in-memory, zero risk) ──────────────────

    const workflowService = new WorkflowService();
    const scheduler = new Scheduler(workflowService);
    const templateRegistry = new TemplateRegistry();

    // ── 2. Phase 2 subsystems (behind try-catch walls) ──────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let memorySystem: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let vectorSystem: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let hookSystem: any = null;
    let unregisterBuiltinHooks: (() => void) | null = null;
    let workflowSubscription: (() => void) | null = null;

    // Memory system (pure Map, no SQLite) — lazy init behind try-catch
    void (async () => {
      try {
        const mod = await import("./memory/index.js");
        memorySystem = new mod.MemorySystem();
        await memorySystem.init();
        log.info("memory system ready");
      } catch (e) {
        log.warn(`memory system disabled: ${e}`);
      }
    })();

    // Vector search (better-sqlite3 + FTS5) — lazy init behind try-catch
    void (async () => {
      try {
        const mod = await import("./vector/index.js");
        vectorSystem = new mod.VectorSearchSystem({ embedding: { type: "local" }, search: {} });
        await vectorSystem.init();
        log.info("vector search ready");
        if (memorySystem) {
          vectorSystem.setSemanticMemory(memorySystem.semantic);
          vectorSystem.setEpisodicMemory(memorySystem.episodic);
        }
      } catch (e) {
        log.warn(`vector search disabled: ${e}`);
      }
    })();

    // Hook system (pure Map, no external deps)
    void (async () => {
      try {
        const { HookSystem, registerBuiltinHooks } = await import("./hooks/index.js");
        hookSystem = new HookSystem();
        unregisterBuiltinHooks = registerBuiltinHooks(hookSystem);

        workflowSubscription = workflowService.subscribe((event: Record<string, unknown>) => {
          try {
            const type = event["type"] as string;
            if (type === "workflow:completed" && memorySystem) {
              const wfId = event["workflowId"] as WorkflowId;
              const wf = workflowService.get(wfId);
              if (wf) {
                memorySystem.storeWorkflowExecution(wf).catch(() => {});
                if (vectorSystem) vectorSystem.indexWorkflow(wf).catch(() => {});
              }
            }
          } catch {
            // swallow hook errors
          }
        });
      } catch (e) {
        log.warn(`hook system disabled: ${e}`);
      }
    })();

    // ── 3. Agent tools (core 5 — always available) ──────────────────

    api.registerTool(
      {
        name: "soloflow_create",
        description:
          "Create a SoloFlow workflow. Provide a name and an array of steps with id, name, discipline (deep|quick|visual|ultrabrain), and action.",
        label: "SoloFlow: Create Workflow",
        parameters: Type.Object({
          name: Type.String({ description: "Workflow name" }),
          description: Type.Optional(Type.String({ description: "Workflow description" })),
          steps: Type.Array(
            Type.Object({
              id: Type.String({ description: "Unique step ID" }),
              name: Type.String({ description: "Step display name" }),
              discipline: Type.Union([
                Type.Literal("deep"),
                Type.Literal("quick"),
                Type.Literal("visual"),
                Type.Literal("ultrabrain"),
              ],
                { description: "Agent discipline for this step" },
              ),
              action: Type.String({ description: "Task prompt or action" }),
              dependencies: Type.Optional(
                Type.Array(Type.String(), { description: "IDs of steps this depends on" }),
              ),
              config: Type.Optional(
                Type.Record(Type.String(), Type.Unknown(), { description: "Extra step config" }),
              ),
            }),
            { description: "Workflow steps" },
          ),
        }),
        async execute(_toolCallId: string, params: any) {
          try {
            const { name, description, steps } = params;
            const now = Date.now();
            const wfId = `wf_${now.toString(36)}` as WorkflowId;
            const stepMap = new Map<StepId, WorkflowStep>();

            for (const s of steps) {
              stepMap.set(s.id as StepId, {
                id: s.id as StepId,
                name: s.name,
                discipline: (s.discipline ?? "quick") as AgentDiscipline,
                dependencies: (s.dependencies ?? []) as StepId[],
                config: { prompt: s.action, ...(s.config ?? {}) } as Record<string, unknown>,
                state: "pending",
              });
            }

            const wf: Workflow = {
              id: wfId,
              name,
              description: description ?? "",
              steps: stepMap,
              dag: null as unknown as DAG,
              state: "idle",
              currentSteps: [],
              createdAt: now,
              updatedAt: now,
              metadata: {},
            };

            const created = workflowService.create(wf);
            return {
              content: [{ type: "text" as const, text: JSON.stringify({
                id: created.id,
                name: created.name,
                state: created.state,
                steps: created.steps.size,
              }) }],
              details: { workflowId: created.id },
            };
          } catch (e) {
            return {
              content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
              details: { error: true },
            };
          }
        },
      },
      
    );

    api.registerTool(
      {
        name: "soloflow_start",
        description: "Start executing a SoloFlow workflow by ID",
        label: "SoloFlow: Start Workflow",
        parameters: Type.Object({
          workflowId: Type.String({ description: "Workflow ID to start" }),
        }),
        async execute(_toolCallId: string, params: any) {
          try {
            const wfId = params.workflowId as WorkflowId;
            const wf = workflowService.get(wfId);
            if (!wf) {
              return {
                content: [{ type: "text" as const, text: `Workflow not found: ${wfId}` }],
                details: { error: true },
              };
            }

            workflowService.start(wfId);

            // Fire-and-forget execution (non-blocking)
            // Pass the real plugin API so subagents have full tool access
            scheduler.execute(wfId, api as never).catch((e: unknown) =>
              log.error(`schedule error: ${e}`),
            );

            return {
              content: [{ type: "text" as const, text: `Workflow ${wfId} started (${wf.steps.size} steps)` }],
              details: { workflowId: wfId, state: "running" },
            };
          } catch (e) {
            return {
              content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
              details: { error: true },
            };
          }
        },
      },
      
    );

    api.registerTool(
      {
        name: "soloflow_status",
        description: "Get the current status of a SoloFlow workflow",
        label: "SoloFlow: Workflow Status",
        parameters: Type.Object({
          workflowId: Type.String({ description: "Workflow ID" }),
        }),
        async execute(_toolCallId: string, params: any) {
          const wf = workflowService.get(params.workflowId as WorkflowId);
          if (!wf) {
            return {
              content: [{ type: "text" as const, text: "Workflow not found" }],
              details: { error: true },
            };
          }

          const execStatus = scheduler.getStatus(params.workflowId as WorkflowId);
          const steps = Array.from(wf.steps.values()).map((s) => ({
            id: s.id,
            name: s.name,
            discipline: s.discipline,
            state: s.state,
            error: s.error,
            durationMs:
              s.startedAt && s.completedAt ? s.completedAt - s.startedAt : undefined,
          }));

          return {
            content: [{ type: "text" as const, text: JSON.stringify({
              id: wf.id,
              name: wf.name,
              state: wf.state,
              progress: execStatus?.progress,
              completedSteps: execStatus?.completedSteps?.length ?? 0,
              failedSteps: execStatus?.failedSteps?.length ?? 0,
              steps,
            }, null, 2) }],
            details: { workflowId: wf.id, state: wf.state },
          };
        },
      },
      
    );

    api.registerTool(
      {
        name: "soloflow_list",
        description: "List all SoloFlow workflows",
        label: "SoloFlow: List Workflows",
        parameters: Type.Object({
          status: Type.Optional(
            Type.String({ description: "Filter by status: running|completed|failed|cancelled" }),
          ),
        }),
        async execute(_toolCallId: string, params: any) {
          const filter = params.status
            ? { status: params.status as WorkflowState }
            : undefined;
          const wfs = workflowService.list(filter);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(
              wfs.map((w) => ({
                id: w.id,
                name: w.name,
                state: w.state,
                steps: w.steps.size,
                createdAt: w.createdAt,
              })),
              null, 2,
            ) }],
            details: { count: wfs.length },
          };
        },
      },
      
    );

    api.registerTool(
      {
        name: "soloflow_cancel",
        description: "Cancel a running SoloFlow workflow",
        label: "SoloFlow: Cancel Workflow",
        parameters: Type.Object({
          workflowId: Type.String({ description: "Workflow ID to cancel" }),
          force: Type.Optional(
            Type.Boolean({ description: "Force cancel from any non-terminal state" }),
          ),
        }),
        async execute(_toolCallId: string, params: any) {
          try {
            const wfId = params.workflowId as WorkflowId;
            workflowService.cancel(wfId);
            scheduler.cancel(wfId);
            return {
              content: [{ type: "text" as const, text: `Workflow ${wfId} cancelled` }],
              details: { workflowId: wfId, state: "cancelled" },
            };
          } catch (e) {
            return {
              content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
              details: { error: true },
            };
          }
        },
      },
      
    );

    // ── 4. Gateway methods (lightweight RPC) ────────────────────────

    api.registerGatewayMethod("soloflow.metrics", async (opts: { respond: (success: boolean, data: unknown) => void }) => {
      const wfs = workflowService.list();
      opts.respond(true, {
        version: PLUGIN_VERSION,
        totalWorkflows: wfs.length,
        running: wfs.filter((w) => w.state === "running").length,
        completed: wfs.filter((w) => w.state === "completed").length,
        failed: wfs.filter((w) => w.state === "failed").length,
        memoryReady: memorySystem !== null,
        vectorReady: vectorSystem !== null,
      });
    });

    // ── 5. API server (HTTP via gateway, behind try-catch) ──────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let apiServerClose: (() => void) | null = null;

    void (async () => {
      try {
        const { createApiServer } = await import("./api/index.js");
        const apiServer = createApiServer(
          { workflowService, scheduler, templateRegistry },
          { requireAuth: false },
        );

        api.registerHttpRoute({
          path: "/soloflow",
          match: "prefix",
          auth: "plugin",
          handler: async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
            // Strip /soloflow prefix
            const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
            const internalPath = url.pathname.replace(/^\/soloflow/, "") || "/";

            // Parse query string
            const query: Record<string, string> = {};
            for (const [k, v] of url.searchParams) {
              query[k] = v;
            }

            // Collect headers (lowercase)
            const headers: Record<string, string> = {};
            for (const [k, v] of Object.entries(req.headers)) {
              if (typeof v === "string") headers[k] = v;
              else if (Array.isArray(v) && v[0] !== undefined) headers[k] = v[0];
            }

            // Parse JSON body for POST/PUT/PATCH
            let body: unknown = undefined;
            if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
              const chunks: Buffer[] = [];
              for await (const chunk of req) chunks.push(chunk as Buffer);
              const raw = Buffer.concat(chunks).toString("utf8");
              if (raw.trim()) {
                try { body = JSON.parse(raw); } catch { body = raw; }
              }
            }

            const apiReq = {
              method: (req.method ?? "GET") as "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
              path: internalPath,
              params: {},
              query,
              body,
              headers,
            };

            const apiRes = await apiServer.handle(apiReq);

            res.statusCode = apiRes.status;
            for (const [k, v] of Object.entries(apiRes.headers)) {
              res.setHeader(k, v);
            }
            if (!apiRes.headers["content-type"]) {
              res.setHeader("content-type", "application/json");
            }
            res.end(typeof apiRes.body === "string" ? apiRes.body : JSON.stringify(apiRes.body));
            return true;
          },
        });

        apiServerClose = () => apiServer.close();
        log.info("API server ready at /soloflow");
      } catch (e) {
        log.warn(`API server disabled: ${e}`);
      }
    })();

    // ── 6. Cleanup on deactivate ────────────────────────────────────

    try {
      api.registerHook("plugin:deactivate" as any, () => {
        log.info("deactivating…");
        workflowSubscription?.();
        unregisterBuiltinHooks?.();
        hookSystem?.clear();
        vectorSystem?.close().catch(() => {});
        memorySystem?.close().catch(() => {});
        apiServerClose?.();
        log.info("deactivated");
      });
    } catch {
      // hook registration may fail in some SDK versions — non-critical
    }

    log.info(
      `activated (safe mode) — 5 tools registered, subsystems loading async`,
    );
  },
});

// ─── Named exports (for programmatic use) ───────────────────────────────

export { WorkflowService } from "./services/workflow-service.js";
export { Scheduler } from "./services/scheduler.js";
export { HookSystem, getMetrics } from "./hooks/index.js";
export { DisciplineAgent, allAgents, getAgent } from "./agents/discipline.js";
export { MemorySystem } from "./memory/index.js";
export { VectorSearchSystem } from "./vector/index.js";
export { dagToYaml, yamlToDag, validateWorkflow, previewWorkflow } from "./visual/index.js";
export type {
  Workflow,
  WorkflowId,
  WorkflowStep,
  WorkflowState,
  AgentDiscipline,
  SchedulerOptions,
} from "./types.js";
