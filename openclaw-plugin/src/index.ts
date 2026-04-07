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
import path from "node:path";
import os from "node:os";

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
const PLUGIN_VERSION = "0.7.0";

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

    // ── 1b. SQLite + Memory persistence (combined async init) ──
    const dataDir = path.join(os.homedir(), ".openclaw", "data", "soloflow");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sqliteStore: any = null;

    // ── 2. Phase 2 subsystems (behind try-catch walls) ──────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let memorySystem: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let vectorSystem: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let hookSystem: any = null;
    let unregisterBuiltinHooks: (() => void) | null = null;
    let workflowSubscription: (() => void) | null = null;

    // SQLite + Memory system initialization (combined for episodic persistence)
    void (async () => {
      try {
        // 1. Initialize SQLite store
        const { SqliteStore } = await import("./store/sqlite-store.js");
        const store = new SqliteStore(dataDir);
        store.loadAll();
        // Replace the in-memory store with the SQLite-backed one
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (workflowService as any).store = store;
        sqliteStore = store;
        log.info(`SQLite store loaded from ${dataDir}`);

        // 2. Initialize memory system
        const mod = await import("./memory/index.js");
        memorySystem = new mod.MemorySystem({ disableLobsterPress: true });
        await memorySystem.init();

        // 3. Restore episodic memory from SQLite
        const entries = store.loadEpisodicEntries();
        memorySystem.episodic.restoreEntries(entries);
        memorySystem.episodic.setPersistCallback((entry: any) => {
          store.storeEpisodicEntry(entry);
        });
        memorySystem.episodic.setDeletePersistCallback((workflowId: string) => {
          store.deleteEpisodicByWorkflow(workflowId);
        });
        log.info(`memory system ready (episodic: ${entries.length} entries restored)`);
      } catch (e) {
        log.warn(`SQLite + memory system disabled: ${e}`);
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

            // Return workflow summary with initial ready steps
            const readyIds = workflowService.getReadySteps(wfId, new Set(), new Set());
            const readySteps = readyIds.map(id => {
              const s = wf.steps.get(id)!;
              return {
                id: s.id,
                name: s.name,
                discipline: s.discipline,
                action: (s.config?.["prompt"] ?? s.name) as string,
                dependencies: s.dependencies,
              };
            });

            return {
              content: [{ type: "text" as const, text: JSON.stringify({
                workflowId: wfId,
                totalSteps: wf.steps.size,
                readySteps,
              }, null, 2) }],
              details: { workflowId: wfId, state: "running", readyCount: readySteps.length },
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
            result: s.result,
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

    // ── 3b. Execution tools (main-agent-driven) ────────────────────

    api.registerTool(
      {
        name: "soloflow_ready_steps",
        description: "Get steps that are ready to execute (all dependencies met). The main agent calls this to know which steps to spawn next.",
        label: "SoloFlow: Get Ready Steps",
        parameters: Type.Object({
          workflowId: Type.String({ description: "Workflow ID" }),
        }),
        async execute(_toolCallId: string, params: any) {
          const wfId = params.workflowId as WorkflowId;
          const wf = workflowService.get(wfId);
          if (!wf) return { content: [{ type: "text" as const, text: "Workflow not found" }], details: { error: true } };

          const completed = new Set<StepId>();
          const running = new Set<StepId>();
          for (const [id, step] of wf.steps) {
            if (step.state === "completed") completed.add(id);
            else if (step.state === "running") running.add(id);
          }

          const readyIds = workflowService.getReadySteps(wfId, completed, running);
          const readySteps = readyIds.map(id => {
            const s = wf.steps.get(id)!;
            return {
              id: s.id,
              name: s.name,
              discipline: s.discipline,
              action: (s.config?.["prompt"] ?? s.name) as string,
              dependencies: s.dependencies,
            };
          });

          return {
            content: [{ type: "text" as const, text: JSON.stringify({ readySteps, completed: completed.size, running: running.size, total: wf.steps.size }, null, 2) }],
            details: { workflowId: wfId, readyCount: readySteps.length },
          };
        },
      },
      
    );

    api.registerTool(
      {
        name: "soloflow_advance_step",
        description: "Mark a step as completed with its result. This unlocks downstream dependent steps. The main agent calls this after confirming a subagent has finished.",
        label: "SoloFlow: Advance Step",
        parameters: Type.Object({
          workflowId: Type.String({ description: "Workflow ID" }),
          stepId: Type.String({ description: "Step ID to mark complete" }),
          result: Type.Optional(Type.String({ description: "The text output/result from executing this step" })),
          error: Type.Optional(Type.String({ description: "Error message if the step failed" })),
        }),
        async execute(_toolCallId: string, params: any) {
          const wfId = params.workflowId as WorkflowId;
          const stepId = params.stepId as StepId;
          const wf = workflowService.get(wfId);
          if (!wf) return { content: [{ type: "text" as const, text: "Workflow not found" }], details: { error: true } };

          const step = wf.steps.get(stepId);
          if (!step) return { content: [{ type: "text" as const, text: `Step not found: ${stepId}` }], details: { error: true } };
          if (step.state === "completed") return { content: [{ type: "text" as const, text: `Step ${stepId} already completed` }], details: { error: true } };

          step.state = params.error ? "failed" : "completed";
          step.result = params.result ?? null;
          step.error = params.error ?? undefined;
          step.completedAt = Date.now();

          workflowService.update(wf);

          const allSteps = Array.from(wf.steps.values());
          const allDone = allSteps.every(s => s.state === "completed" || s.state === "failed");
          const anyFailed = allSteps.some(s => s.state === "failed");

          let newState: WorkflowState = wf.state;
          let message: string;

          if (allDone) {
            newState = anyFailed ? "failed" : "completed";
            wf.state = newState;
            wf.updatedAt = Date.now();
            workflowService.update(wf);
            message = `Workflow ${wfId} ${newState}!`;
          } else {
            const completed = new Set<StepId>();
            const running = new Set<StepId>();
            for (const [id, s] of wf.steps) {
              if (s.state === "completed") completed.add(id);
              else if (s.state === "running") running.add(id);
            }
            const newReady = workflowService.getReadySteps(wfId, completed, running);
            message = `Step ${stepId} completed. ${newReady.length} step(s) now ready: ${newReady.join(", ") || "none"}`;
          }

          // Store in episodic memory (AFTER state is finalized)
          if (memorySystem && !params.error) {
            try {
              const wfSnapshot = workflowService.get(wfId);
              if (wfSnapshot) {
                await memorySystem.storeWorkflowExecution(wfSnapshot);
              }
            } catch {
              // memory store failure is non-critical
            }
          }

          return {
            content: [{ type: "text" as const, text: JSON.stringify({
              workflowId: wfId,
              stepId,
              stepState: step.state,
              workflowState: newState,
              message,
              completedCount: allSteps.filter(s => s.state === "completed").length,
              totalSteps: allSteps.length,
            }, null, 2) }],
            details: { workflowId: wfId, stepState: step.state, workflowState: newState },
          };
        },
      },
      
    );

    // ── 3c. Memory query tool ────────────────────────────────────

    api.registerTool(
      {
        name: "soloflow_memory",
        description: "Query SoloFlow's cognitive memory (working, episodic, semantic). Search past workflow executions, stored facts, and patterns.",
        label: "SoloFlow: Query Memory",
        parameters: Type.Object({
          query: Type.String({ description: "Search query text" }),
          tier: Type.Optional(Type.String({ description: "Memory tier: working|episodic|semantic (default: all)" })),
          limit: Type.Optional(Type.Integer({ description: "Max results (default: 10)" })),
        }),
        async execute(_toolCallId: string, params: any) {
          if (!memorySystem) {
            return {
              content: [{ type: "text" as const, text: "Memory system not available" }],
              details: { error: true },
            };
          }
          try {
            const result = await memorySystem.query({
              text: params.query,
              tiers: params.tier ? [params.tier] : undefined,
              limit: params.limit ?? 10,
            });
            const entries = result.entries.map((e: any) => ({
              tier: e.tier,
              score: e.score.toFixed(3),
              ...(e.tier === "episodic" ? {
                workflowId: e.entry.workflowId,
                workflowName: e.entry.workflowName,
                finalState: e.entry.finalState,
                durationMs: e.entry.durationMs,
                steps: e.entry.stepSummary?.length ?? 0,
              } : {}),
              ...(e.tier === "semantic" ? {
                key: e.entry.key,
                category: e.entry.category,
                importance: e.entry.importance,
                retrievability: e.entry.retrievability?.toFixed(3),
              } : {}),
              ...(e.tier === "working" ? {
                key: e.entry.key,
                source: e.entry.source,
              } : {}),
            }));
            return {
              content: [{ type: "text" as const, text: JSON.stringify({
                totalMatches: result.totalMatches,
                entries,
              }, null, 2) }],
              details: { count: entries.length },
            };
          } catch (e) {
            return {
              content: [{ type: "text" as const, text: `Memory query error: ${e instanceof Error ? e.message : String(e)}` }],
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
        sqliteStore?.close();
        vectorSystem?.close().catch(() => {});
        memorySystem?.close().catch(() => {});
        apiServerClose?.();
        log.info("deactivated");
      });
    } catch {
      // hook registration may fail in some SDK versions — non-critical
    }

    log.info(
      `activated (v0.7) — 8 tools registered, memory system active`,
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
