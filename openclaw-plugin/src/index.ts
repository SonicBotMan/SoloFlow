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
import { fileURLToPath } from "node:url";
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
const PLUGIN_VERSION = "0.8.0";

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let evolutionStore: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let evolutionAnalyzer: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let skillInventory: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let skillAnalyzer: any = null;
    let mcpInventory: any = null;
    let hookSystem: any = null;
    let unregisterBuiltinHooks: (() => void) | null = null;
    let workflowSubscription: (() => void) | null = null;

    // ── R³Mem: Truncate large step results before decomposition ──────
    const MAX_STEP_RESULT_CHARS = 2000;
    const MAX_WORKFLOW_CONTENT_CHARS = 50000;
    const decomposedWorkflows = new Set<string>();

    function decomposeWorkflow(wf: any): Promise<void> {
      if (!memorySystem) return Promise.resolve();
      if (decomposedWorkflows.has(wf.id)) return Promise.resolve();
      decomposedWorkflows.add(wf.id);
      try {
        const stepTexts = Array.from(wf.steps.values())
          .map((s: any) => {
            const raw = typeof s.result === 'string' ? s.result : JSON.stringify(s.result ?? '');
            const truncated = raw.length > MAX_STEP_RESULT_CHARS ? raw.slice(0, MAX_STEP_RESULT_CHARS) + '...[truncated]' : raw;
            return `[${s.name}] ${s.state}: ${truncated}`;
          })
          .join("\n\n");

        if (stepTexts.length < 50) return Promise.resolve();

        const content = stepTexts.length > MAX_WORKFLOW_CONTENT_CHARS
          ? stepTexts.slice(0, MAX_WORKFLOW_CONTENT_CHARS) + '\n...[content truncated]'
          : stepTexts;

        return memorySystem.decomposeDocument({
          id: wf.id,
          content,
          sourceType: "workflow_result",
          createdAt: Date.now(),
        });
      } catch (e) {
        log.debug?.(`R³Mem decompose skipped: ${e}`);
        return Promise.resolve();
      }
    }

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

        // Initialize R³Mem
        try {
          const r3mem = await import("./memory/r3mem-store.js");
          const r3memStore = new r3mem.R3MemStore(store.database);
          memorySystem.setR3MemStore(r3memStore);
        } catch (e) { log.debug?.(`R³Mem init non-critical: ${e}`); }

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

        // 4. Initialize evolution system
        try {
          const { EvolutionStore } = await import("./evolution/evolution-store.js");
          const { EvolutionAnalyzer } = await import("./evolution/analyzer.js");

          evolutionStore = new EvolutionStore(store.database);

          evolutionAnalyzer = new EvolutionAnalyzer({
            api,
            memorySystem,
            evolutionStore,
            async onTemplateFound(template) {
              evolutionStore!.save(template);
              // Auto-persist skill patterns as SKILL.md files
              if (template.type === "skill" && template.pattern) {
                try {
                  const fs = await import("node:fs");
                  const os = await import("node:os");
                  const skillsDir = path.join(os.homedir(), ".openclaw", "workspace", "skills");
                  const slug = template.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
                  const skillDir = path.join(skillsDir, slug);
                  fs.mkdirSync(skillDir, { recursive: true });
                  const skillFile = path.join(skillDir, "SKILL.md");
                  // Don't overwrite existing skills (user may have customized)
                  if (fs.existsSync(skillFile)) {
                    log.warn(`skill '${template.name}' already exists at ${skillFile}, skipping`);
                    return;
                  }
                  // Build a "pushy" description (Anthropic best practice: include trigger keywords)
                  const triggerKeywords = (template.triggers || []).join(", ");
                  const pushyDesc = (template.description || template.name) +
                    (triggerKeywords ? `. Use when: ${triggerKeywords}.` : "") +
                    (template.scope && template.scope !== "general" ? ` Scope: ${template.scope}.` : "");

                  const frontmatter = [
                    "---",
                    `name: ${template.name}`,
                    `description: ${JSON.stringify(pushyDesc)}`,
                    "---",
                    "",
                  ].join("\n");

                  // Build body following Anthropic skill-creator anatomy
                  const sections: string[] = [];
                  sections.push(`# ${template.name}`);
                  sections.push("");
                  sections.push(template.description || "Auto-evolved skill pattern.");
                  sections.push("");

                  // When to Use (Anthropic: "pushy" trigger section)
                  if ((template.triggers || []).length > 0) {
                    sections.push("## When to Use");
                    sections.push("");
                    sections.push(...template.triggers.map(t => `- ${t}`));
                    sections.push("");
                  }

                  // Prerequisites
                  if ((template.prerequisites || []).length > 0) {
                    sections.push("## Prerequisites");
                    sections.push("");
                    sections.push(...template.prerequisites.map(p => `- ${p}`));
                    sections.push("");
                  }

                  // Tools
                  const allTools = [...new Set([...(template.tools_required || []), ...(template.tools_optional || [])])];
                  if (allTools.length > 0) {
                    sections.push("## Tools");
                    sections.push("");
                    if ((template.tools_required || []).length > 0) {
                      sections.push("**Required:**");
                      sections.push(...template.tools_required.map(t => `- \`${t}\``));
                      sections.push("");
                    }
                    if ((template.tools_optional || []).length > 0) {
                      sections.push("**Optional:**");
                      sections.push(...template.tools_optional.map(t => `- \`${t}\``));
                      sections.push("");
                    }
                  }

                  // Pattern / Instructions (imperative form)
                  sections.push("## Instructions");
                  sections.push("");
                  sections.push(template.pattern || "Follow the detected pattern from workflow execution history.");
                  sections.push("");

                  // Examples
                  if ((template.examples || []).length > 0) {
                    sections.push("## Examples");
                    sections.push("");
                    for (const ex of template.examples) {
                      if (ex.input || ex.expected_output) {
                        sections.push(`**Input:** ${ex.input || "(context-dependent)"}`);
                        sections.push(`**Output:** ${ex.expected_output || "(expected result)"}`);
                        sections.push("");
                      }
                    }
                  }

                  // Metadata footer
                  const metaParts = [
                    `Disciplines: ${(template.disciplines_used || []).join(", ") || "N/A"}`,
                    `Estimated duration: ${template.estimated_duration || "unknown"}`,
                    `Auto-generated by SoloFlow Skill Evolution`,
                    `Date: ${new Date().toISOString().split('T')[0]}`,
                  ];
                  sections.push("---");
                  sections.push(metaParts.join(" | "));

                  const body = sections.join("\n");
                  fs.writeFileSync(skillFile, frontmatter + body, "utf8");
                  log.info(`evolved skill written to ${skillFile}`);
                } catch (e) {
                  log.warn(`failed to write skill file: ${e}`);
                }
              }
            },
          });

          const wfCount = evolutionStore.count("workflow");
          const skCount = evolutionStore.count("skill");
          log.info(`evolution system ready (${wfCount} workflow templates, ${skCount} skill patterns)`);

          // First-install hint: call soloflow_evolve tool or set up a cron job to trigger analysis
          if (wfCount === 0 && skCount === 0) {
            log.info("no templates yet — run soloflow_evolve to start analysis, or set up a cron at 02:00 Beijing");
          }

          // Initialize skill inventory + analyzer
          try {
            const { SkillInventory } = await import("./evolution/skill-inventory.js");
            const { SkillAnalyzer } = await import("./evolution/skill-analyzer.js");
            skillInventory = new SkillInventory(store.database);
            skillAnalyzer = new SkillAnalyzer(skillInventory, store.database, { logger: log });
            const scanResult = skillInventory.scan();
            log.info(`skill inventory: ${scanResult.added + scanResult.updated} skills scanned`);
          } catch (e) {
            log.warn(`skill inventory disabled: ${e}`);
          }

          // MCP server inventory (reads from api.config at each scan)
          try {
            const { MCPInventory } = await import("./evolution/mcp-inventory.js");
            mcpInventory = new MCPInventory(store.database, { config: api.config, logger: log });
            const mcpResult = mcpInventory.scan();
            log.info(`mcp inventory: ${mcpResult.added + mcpResult.updated} servers registered`);
          } catch (e) {
            log.warn(`mcp inventory disabled: ${e}`);
          }

          // Evolution: handled by OpenClaw cron (soloflow-nightly-evolve)
          log.info("evolution system ready — cron job 'soloflow-nightly-evolve' handles daily analysis at 02:00 Beijing");
        } catch (e) {
          log.warn(`evolution system disabled: ${e}`);
        }
      } catch (e) {
        log.warn(`SQLite + memory system disabled: ${e}`);
      }
    })();

    // Vector search (better-sqlite3 + FTS5) — lazy init behind try-catch
    void (async () => {
      try {
        const mod = await import("./vector/index.js");
        const { detectEmbeddingConfig, validateEmbeddingConfig } = await import("./vector/embedding-config.js");
        const detectedEmbedding = detectEmbeddingConfig();
        let activeEmbeddingConfig = detectedEmbedding;
        if (detectedEmbedding.type !== "local") {
          const valid = await validateEmbeddingConfig(detectedEmbedding);
          if (!valid) {
            log.warn(`Embedding provider ${detectedEmbedding.type} validation failed, falling back to local`);
            activeEmbeddingConfig = { type: "local" };
          } else {
            log.info(`Using ${detectedEmbedding.type} embedding provider (model: ${detectedEmbedding.model})`);
          }
        }
        vectorSystem = new mod.VectorSearchSystem({ embedding: activeEmbeddingConfig, search: {} });
        await vectorSystem.init();
        log.info("vector search ready");
        if (memorySystem) {
          vectorSystem.setSemanticMemory(memorySystem.semantic);
          vectorSystem.setEpisodicMemory(memorySystem.episodic);

          // Wire unified hybrid retrieval
          memorySystem.setUnifiedSources({
            ftsSearch: (query: string, limit: number) => {
              try { return sqliteStore.searchEpisodicFTS(query, limit); } catch (e) { log.debug?.(`FTS5 search failed: ${e}`); return []; }
            },
            vectorSearch: async (query: string, limit: number) => {
              try {
                const results = await vectorSystem.retriever.search(query, limit);
                return results.map((r: any) => ({ id: r.id, score: r.score }));
              } catch (e) { log.debug?.(`vector search failed: ${e}`); return []; }
            },
            episodicLoader: (id: string) => {
              for (const entry of memorySystem.episodic.all()) {
                if (entry.id === id) return entry;
              }
              return null;
            },
          });
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
            if ((type === "workflow:completed" || type === "workflow:failed") && memorySystem) {
              const wfId = event["workflowId"] as WorkflowId;
              const wf = workflowService.get(wfId);
              if (wf) {
                memorySystem.storeWorkflowExecution(wf).catch(() => {});
                if (vectorSystem) vectorSystem.indexWorkflow(wf).catch(() => {});
                // Auto-decompose into R³Mem on workflow final states
                decomposeWorkflow(wf).catch(() => {});
              }
            }
          } catch (e) {
            log.debug?.(`hook error: ${e}`);
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

          // Fallback: compute from steps when scheduler status lost (gateway restart)
          const completedCount = steps.filter(s => s.state === "completed").length;
          const failedCount = steps.filter(s => s.state === "failed").length;
          const totalCount = steps.length;

          return {
            content: [{ type: "text" as const, text: JSON.stringify({
              id: wf.id,
              name: wf.name,
              state: wf.state,
              progress: execStatus?.progress ?? (totalCount > 0 ? completedCount / totalCount : undefined),
              completedSteps: execStatus?.completedSteps?.length ?? completedCount,
              failedSteps: execStatus?.failedSteps?.length ?? failedCount,
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
          discipline: Type.Optional(
            Type.String({ description: "Filter by step discipline: deep|quick|visual|ultrabrain" }),
          ),
        }),
        async execute(_toolCallId: string, params: any) {
          const filter = params.status
            ? { status: params.status as WorkflowState }
            : undefined;
          let wfs = workflowService.list(filter);
          // Filter by discipline if specified
          if (params.discipline) {
            wfs = wfs.filter((w: any) =>
              Array.from(w.steps.values()).some((s: any) => s.discipline === params.discipline)
            );
          }
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
              action: ((s.config?.["prompt"] ?? s.name) as string).slice(0, 200),
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

          // Track template usage if step action matches a skill pattern
          if (evolutionStore && !params.error) {
            try {
              const allSkills = evolutionStore.search("", "skill", 50);
              const stepAction = (step as any)?.action?.toLowerCase() ?? "";
              for (const skill of allSkills) {
                if (skill.pattern && stepAction.length > 0) {
                  const patternWords = skill.pattern.toLowerCase().split(/\s+/);
                  const overlap = patternWords.filter((w: string) => w.length > 3 && stepAction.includes(w));
                  if (overlap.length >= 2 || (overlap.length >= 1 && patternWords.length <= 5)) {
                    evolutionStore.recordUsage(skill.id, true);
                  }
                }
              }
            } catch (e) {
              log.debug?.(`skill usage record failed: ${e}`);
            }
          }

          // Store in episodic memory + R³Mem (AFTER state is finalized)
          if (memorySystem && !params.error) {
            try {
              const wfSnapshot = workflowService.get(wfId);
              if (wfSnapshot) {
                await memorySystem.storeWorkflowExecution(wfSnapshot);
                // R³Mem is handled by the workflow:completed/failed hook
              }
            } catch (e) {
              log.warn(`memory store failed: ${e}`);
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
          tier: Type.Optional(Type.String({ description: "Memory tier: working|episodic|semantic|entity (default: all)" })),
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
            // Handle entity tier separately
            if (params.tier === "entity") {
              const entities = memorySystem.queryEntities({
                text: params.query,
                limit: params.limit ?? 10,
              });
              return {
                content: [{ type: "text" as const, text: JSON.stringify({
                  totalMatches: entities.length,
                  entries: entities.map((e: any) => ({
                    tier: "entity",
                    text: e.text,
                    type: e.type,
                    score: e.confidence.toFixed(3),
                  })),
                }, null, 2) }],
                details: { count: entities.length },
              };
            }

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

    // ── 3d. Evolution tools ──────────────────────────────────────

    api.registerTool(
      {
        name: "soloflow_evolve",
        description: "Trigger Skill Auto-Evolution analysis. Scans workflow history and extracts reusable patterns into templates and skill patterns.",
        label: "SoloFlow: Evolve Skills",
        parameters: Type.Object({
          type: Type.Optional(Type.String({ description: "Filter: 'workflow', 'skill', or omit for all" })),
        }),
        async execute(_toolCallId: string, params: any) {
          if (!evolutionAnalyzer) {
            return { content: [{ type: "text" as const, text: "Evolution system not available" }], details: { error: true } };
          }
          try {
            const result = await evolutionAnalyzer.analyze(params.type);
            return {
              content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
              details: { workflowsExtracted: result.templates, skillsExtracted: result.skills },
            };
          } catch (e) {
            return {
              content: [{ type: "text" as const, text: `Evolution error: ${e instanceof Error ? e.message : String(e)}` }],
              details: { error: true },
            };
          }
        },
      },
    );

    api.registerTool(
      {
        name: "soloflow_templates",
        description: "List and search evolved workflow templates and skill patterns. Shows reusable patterns extracted from past workflow executions.",
        label: "SoloFlow: List Templates",
        parameters: Type.Object({
          query: Type.Optional(Type.String({ description: "Search query (name/description/tags)" })),
          type: Type.Optional(Type.String({ description: "Filter: 'workflow', 'skill', or omit for all" })),
          limit: Type.Optional(Type.Integer({ description: "Max results (default: 20)" })),
        }),
        async execute(_toolCallId: string, params: any) {
          if (!evolutionStore) {
            return { content: [{ type: "text" as const, text: "Evolution store not available" }], details: { error: true } };
          }
          try {
            const templates = evolutionStore.search(
              params.query ?? "",
              params.type as any,
              params.limit ?? 20,
            );
            const formatted = templates.map((t: any) => ({
              id: t.id,
              type: t.type,
              name: t.name,
              description: t.description,
              triggers: t.triggers ?? [],
              scope: t.scope ?? "general",
              prerequisites: t.prerequisites ?? [],
              tools_required: t.tools_required ?? [],
              tools_optional: t.tools_optional ?? [],
              estimated_duration: t.estimatedDuration ?? "",
              examples: t.examples ?? [],
              quality: t.qualityScore.toFixed(2),
              uses: t.useCount,
              version: t.version,
              ...(t.type === "workflow" ? { steps: t.steps?.length ?? 0 } : {}),
              ...(t.pattern ? { pattern: t.pattern } : {}),
              tags: t.tags,
            }));
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ total: formatted.length, templates: formatted }, null, 2) }],
              details: { count: formatted.length },
            };
          } catch (e) {
            return {
              content: [{ type: "text" as const, text: `Template query error: ${e instanceof Error ? e.message : String(e)}` }],
              details: { error: true },
            };
          }
        },
      },
    );

    // ── 3e. Skill inventory tools ───────────────────────────────

    api.registerTool(
      {
        name: "skills_list",
        description: "List all SoloFlow managed skills from inventory.",
        label: "SoloFlow: List Skills",
        parameters: Type.Object({}),
        async execute(_toolCallId: string, _params: any) {
          if (!skillInventory) {
            return { content: [{ type: "text" as const, text: "Skill inventory not available" }], details: { error: true } };
          }
          try {
            const skills = skillInventory.getAll();
            return { content: [{ type: "text" as const, text: JSON.stringify({ total: skills.length, skills }, null, 2) }] };
          } catch (e) {
            return { content: [{ type: "text" as const, text: `Error: ${e}` }], details: { error: true } };
          }
        },
      },
    );

    api.registerTool(
      {
        name: "skills_usage",
        description: "Get skill usage analytics: insights, recent usage, and combination patterns.",
        label: "SoloFlow: Skill Usage",
        parameters: Type.Object({}),
        async execute(_toolCallId: string, _params: any) {
          if (!skillAnalyzer || !skillInventory) {
            return { content: [{ type: "text" as const, text: "Skill system not available" }], details: { error: true } };
          }
          try {
            const insights = skillAnalyzer.getInsights(20);
            const recent = skillInventory.getRecentlyUsed(10);
            const combinations = skillInventory.getCombinationPatterns().slice(0, 5);
            return { content: [{ type: "text" as const, text: JSON.stringify({ insights, recent, combinations }, null, 2) }] };
          } catch (e) {
            return { content: [{ type: "text" as const, text: `Error: ${e}` }], details: { error: true } };
          }
        },
      },
    );

    api.registerTool(
      {
        name: "skills_scan",
        description: "Scan installed skills and update the SoloFlow inventory.",
        label: "SoloFlow: Scan Skills",
        parameters: Type.Object({}),
        async execute(_toolCallId: string, _params: any) {
          if (!skillInventory) {
            return { content: [{ type: "text" as const, text: "Skill inventory not available" }], details: { error: true } };
          }
          try {
            const result = skillInventory.scan();
            return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
          } catch (e) {
            return { content: [{ type: "text" as const, text: `Error: ${e}` }], details: { error: true } };
          }
        },
      },
    );

    // ── 5. MCP server management tools ─────────────────────────────
    api.registerTool({
      name: "mcp_servers",
      description: "List all registered MCP servers and their tools.",
      label: "SoloFlow: MCP Servers",
      parameters: Type.Object({
        server_id: Type.Optional(Type.String()),
      }),
      async execute(_toolCallId: string, params: any) {
        if (!mcpInventory) {
          return { content: [{ type: "text" as const, text: "MCP inventory not available" }], details: { error: true } };
        }
        try {
          // Refresh from config
          mcpInventory.scan();
          if (params.server_id) {
            const stats = mcpInventory.getUsageStats(params.server_id);
            const servers = mcpInventory.getAll().filter((s: any) => s.id === params.server_id);
            return { content: [{ type: "text" as const, text: JSON.stringify({ server: servers[0] ?? null, stats }, null, 2) }] };
          }
          const servers = mcpInventory.getAll();
          return { content: [{ type: "text" as const, text: JSON.stringify({ total: servers.length, servers }, null, 2) }] };
        } catch (e) {
          return { content: [{ type: "text" as const, text: `Error: ${e}` }], details: { error: true } };
        }
      },
    });

    api.registerTool({
      name: "mcp_stats",
      description: "Get MCP server usage statistics and tool rankings.",
      label: "SoloFlow: MCP Stats",
      parameters: Type.Object({
        days: Type.Optional(Type.Integer({ minimum: 1, maximum: 90, default: 30 })),
      }),
      async execute(_toolCallId: string, params: any) {
        if (!mcpInventory) {
          return { content: [{ type: "text" as const, text: "MCP inventory not available" }], details: { error: true } };
        }
        try {
          const days = params.days ?? 30;
          const rankings = mcpInventory.getServerRankings(days);
          const toolStats = mcpInventory.getToolStats(days);
          return { content: [{ type: "text" as const, text: JSON.stringify({ days, rankings, topTools: toolStats.slice(0, 20) }, null, 2) }] };
        } catch (e) {
          return { content: [{ type: "text" as const, text: `Error: ${e}` }], details: { error: true } };
        }
      },
    });

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
            // Serve Visual Builder at /soloflow/builder
            const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
            if (url.pathname === "/soloflow/builder" || url.pathname === "/soloflow/builder/") {
              try {
                const fs = await import("node:fs");
                const __dirname = path.dirname(fileURLToPath(import.meta.url));
                const builderPath = path.join(__dirname, "visual-builder", "index.html");
                const html = fs.readFileSync(builderPath, "utf8");
                res.setHeader("content-type", "text/html; charset=utf-8");
                res.end(html);
                return true;
              } catch (e) {
                log.warn(`Visual Builder not available: ${e}`);
              }
            }

            // Strip /soloflow prefix
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
                try { body = JSON.parse(raw); } catch (e) { log.warn(`error: ${e}`); }
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
    } catch (e) {
      log.debug?.(`hook registration skipped: ${e}`);
    }

    log.info(
      `activated (v0.8) — 15 tools registered, memory + evolution + skills + MCP active`,
    );

    // ── 6b. Tool usage tracking wrapper (skills + MCP) ──────────────
    if (skillInventory) {
      const originalExecute = (api as any).executeTool?.bind(api);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (api as any).executeTool = async (toolName: string, params: any) => {
        const startTime = Date.now();
        try {
          const result = originalExecute ? await originalExecute(toolName, params) : null;
          const duration = Date.now() - startTime;
          // Record skill usage
          try {
            const allSkills = skillInventory.getAll();
            const normalized = toolName.replace(/_/g, " ").toLowerCase();
            const matched = allSkills.find((s: any) =>
              s.tools?.includes(toolName) || s.name.toLowerCase().includes(normalized)
            );
            skillInventory.recordUsage(matched?.id ?? toolName, toolName, true, duration);
          } catch (e) {
            log.debug?.(`skill usage record failed: ${e}`);
          }
          // Record MCP usage if this is an MCP tool
          try {
            if (mcpInventory) {
              const serverId = mcpInventory.detectServerForTool(toolName);
              if (serverId) {
                mcpInventory.recordUsage(serverId, toolName, true, duration);
              }
            }
          } catch (e) {
            log.debug?.(`mcp usage record failed: ${e}`);
          }
          return result;
        } catch (e) {
          const duration = Date.now() - startTime;
          try {
            skillInventory.recordUsage(toolName, toolName, false, duration);
          } catch (e) { log.debug?.(`skill usage record failed: ${e}`); }
          try {
            if (mcpInventory) {
              const serverId = mcpInventory.detectServerForTool(toolName);
              if (serverId) {
                mcpInventory.recordUsage(serverId, toolName, false, duration);
              }
            }
          } catch (e) { log.debug?.(`mcp usage record failed: ${e}`); }
          throw e;
        }
      };
      log.info("tool usage tracking enabled (skills + MCP)");
    }
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
