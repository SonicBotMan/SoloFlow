/**
 * SoloFlow — Workflow Command Handlers
 *
 * Slash-command routing for /workflow (alias /wf):
 *   start, status, cancel, list, help
 */

import type {
  CommandContext,
  CommandRegistration,
  Workflow,
  WorkflowId,
  WorkflowStep,
  StepId,
  WorkflowState,
  WorkflowTemplate,
} from "../types";
import { WORKFLOW_STATES } from "../types";
import type { WorkflowFilter } from "../services/workflow-service";
import { WorkflowService } from "../services/workflow-service";
import { Scheduler } from "../services/scheduler";
import { TemplateRegistry } from "../services/template-registry";

// ─── Re-exports ──────────────────────────────────────────────────────

export type { CommandContext, CommandRegistration } from "../types";

// ─── Formatting Helpers ──────────────────────────────────────────────

const STATE_ICONS: Record<WorkflowState, string> = {
  idle: "⏸",
  queued: "📋",
  running: "▶",
  paused: "⏸",
  completed: "✅",
  failed: "❌",
  cancelled: "🚫",
};

const STEP_STATE_ICONS: Record<string, string> = {
  pending: "⏳",
  running: "▶",
  completed: "✅",
  failed: "❌",
  skipped: "⏭",
};

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1_000);
  return `${mins}m ${secs}s`;
}

function formatStep(step: WorkflowStep): string {
  const icon = STEP_STATE_ICONS[step.state] ?? "?";
  const duration =
    step.startedAt && step.completedAt
      ? ` (${formatDuration(step.completedAt - step.startedAt)})`
      : step.startedAt
        ? ` (running ${formatDuration(Date.now() - step.startedAt)})`
        : "";

  const errorLine = step.error ? `\n      ↳ Error: ${step.error}` : "";
  return `  ${icon} ${step.name} [${step.discipline}] — ${step.state}${duration}${errorLine}`;
}

function formatWorkflow(wf: Workflow): string {
  const icon = STATE_ICONS[wf.state] ?? "?";
  const steps = Array.from(wf.steps.values());
  const completed = steps.filter((s) => s.state === "completed").length;
  const total = steps.length;
  const progress = total > 0 ? `${completed}/${total}` : "—";
  const age = formatDuration(Date.now() - wf.createdAt);

  const lines = [
    `${icon} ${wf.name} (${wf.id})`,
    `  State: ${wf.state} | Progress: ${progress} | Created: ${age} ago`,
  ];

  if (wf.description) {
    lines.push(`  ${wf.description}`);
  }

  if (steps.length > 0) {
    lines.push("  Steps:");
    for (const step of steps) {
      lines.push(formatStep(step));
    }
  }

  return lines.join("\n");
}

function formatWorkflowList(wfs: Workflow[]): string {
  if (wfs.length === 0) {
    return "No workflows found.";
  }

  const lines = [`Found ${wfs.length} workflow${wfs.length !== 1 ? "s" : ""}:\n`];

  for (const wf of wfs) {
    const icon = STATE_ICONS[wf.state] ?? "?";
    const steps = Array.from(wf.steps.values());
    const completed = steps.filter((s) => s.state === "completed").length;
    const total = steps.length;
    const progress = total > 0 ? `${completed}/${total}` : "—";
    const age = formatDuration(Date.now() - wf.createdAt);

    lines.push(`  ${icon} ${wf.name} (${wf.id})`);
    lines.push(`     State: ${wf.state} | Steps: ${progress} | ${age} ago`);
  }

  return lines.join("\n");
}

// ─── Argument Parsing ────────────────────────────────────────────────

function parseInlineSteps(raw: string): WorkflowTemplate["steps"] {
  // Expect comma-separated step definitions: "name:discipline:dep1+dep2"
  return raw.split(",").map((segment, idx) => {
    const parts = segment.trim().split(":");
    const name = parts[0]?.trim() ?? `step-${idx}`;
    const discipline = (parts[1]?.trim() ?? "quick") as WorkflowTemplate["steps"][number]["discipline"];
    const depsRaw = parts[2]?.trim();
    const dependencies = depsRaw
      ? depsRaw.split("+").map((d) => d.trim() as StepId)
      : [];

    return {
      id: name as StepId,
      name,
      discipline,
      dependencies,
      config: {},
    };
  });
}

// ─── WorkflowCommands ────────────────────────────────────────────────

export class WorkflowCommands {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly scheduler: Scheduler,
    private readonly templateRegistry: TemplateRegistry,
  ) {}

  // ── start ───────────────────────────────────────────────────────────

  async handleStart(ctx: CommandContext): Promise<void> {
    try {
      const templateName = ctx.options["template"] as string | undefined;
      const stepsRaw = ctx.options["steps"] as string | undefined;
      const name = ctx.options["name"] as string | undefined;
      const params = ctx.options["params"] as Record<string, unknown> | undefined;

      let template: WorkflowTemplate;

      if (templateName) {
        const registered = this.templateRegistry.get(templateName);
        if (!registered) {
          const available = this.templateRegistry.list().join(", ");
          ctx.replyError(
            `Template "${templateName}" not found. Available templates: ${available}`,
          );
          return;
        }
        template = registered;
      } else if (stepsRaw) {
        const steps = parseInlineSteps(stepsRaw);
        template = {
          name: name ?? `inline-${Date.now()}`,
          description: "Inline workflow",
          steps,
        };
      } else {
        ctx.replyError(
          "Provide steps to create a workflow.\n" +
          "Usage: /workflow start --steps \"step1:quick,step2:deep:step1\"",
        );
        return;
      }

      const workflowId = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` as unknown as WorkflowId;
      const stepsMap = new Map<StepId, WorkflowTemplate["steps"][number]>();
      for (const step of template.steps) {
        stepsMap.set(step.id, {
          ...step,
          state: "pending",
          config: { ...step.config, ...params },
        } as WorkflowStep);
      }

      const workflow: Workflow = {
        id: workflowId,
        name: template.name,
        description: template.description,
        steps: stepsMap as Map<StepId, WorkflowStep>,
        dag: { nodes: new Map(), edges: [], layers: [] },
        state: "idle",
        currentSteps: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: { template: templateName ?? "inline", ...params },
      };

      const created = this.workflowService.create(workflow);
      this.workflowService.start(created.id);

      ctx.reply(
        `Workflow started!\n\n${formatWorkflow(created)}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.replyError(`Failed to start workflow: ${message}`);
    }
  }

  // ── status ──────────────────────────────────────────────────────────

  async handleStatus(ctx: CommandContext): Promise<void> {
    try {
      const id = ctx.args[0] ?? ctx.workflowId;
      if (!id) {
        ctx.replyError("Provide a workflow ID.\nUsage: /workflow status <id>");
        return;
      }

      const workflow = this.workflowService.get(id as WorkflowId);
      if (!workflow) {
        ctx.replyError(`Workflow not found: ${id}`);
        return;
      }

      const verbose = ctx.options["verbose"] === true || ctx.options["v"] === true;
      const schedulerStatus = this.scheduler.getStatus(id as WorkflowId);

      const lines = [formatWorkflow(workflow)];

      if (schedulerStatus) {
        lines.push("");
        lines.push(`  Scheduler: ${schedulerStatus.state} | Progress: ${(schedulerStatus.progress * 100).toFixed(0)}%`);
        if (schedulerStatus.runningSteps.length > 0) {
          lines.push(`  Running: ${schedulerStatus.runningSteps.join(", ")}`);
        }
      }

      if (verbose) {
        const steps = Array.from(workflow.steps.values());
        lines.push("");
        lines.push("  Detailed steps:");
        for (const step of steps) {
          lines.push(formatStep(step));
          if (step.result !== undefined) {
            const resultStr = typeof step.result === "object"
              ? JSON.stringify(step.result, null, 2)
              : String(step.result);
            lines.push(`      ↳ Result: ${resultStr}`);
          }
        }

        lines.push("");
        lines.push(`  DAG: ${workflow.dag.nodes.size} nodes, ${workflow.dag.edges.length} edges, ${workflow.dag.layers.length} layers`);
      }

      ctx.reply(lines.join("\n"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.replyError(`Failed to get status: ${message}`);
    }
  }

  // ── cancel ──────────────────────────────────────────────────────────

  async handleCancel(ctx: CommandContext): Promise<void> {
    try {
      const id = ctx.args[0] ?? ctx.workflowId;
      if (!id) {
        ctx.replyError("Provide a workflow ID.\nUsage: /workflow cancel <id> [--force]");
        return;
      }

      const force = ctx.options["force"] === true || ctx.options["f"] === true;

      this.workflowService.cancel(id as WorkflowId, force);
      this.scheduler.cancel(id as WorkflowId);

      ctx.reply(`Workflow ${id} cancelled.${force ? " (forced)" : ""}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.replyError(`Failed to cancel workflow: ${message}`);
    }
  }

  // ── list ────────────────────────────────────────────────────────────

  async handleList(ctx: CommandContext): Promise<void> {
    try {
      const filter: WorkflowFilter = {};

      if (ctx.options["status"] && WORKFLOW_STATES.includes(ctx.options["status"] as WorkflowState)) {
        filter.status = ctx.options["status"] as WorkflowState;
      }
      if (ctx.options["template"]) {
        filter.template = ctx.options["template"] as string;
      }
      if (ctx.options["limit"]) {
        filter.limit = Number(ctx.options["limit"]);
      }
      if (ctx.options["offset"]) {
        filter.offset = Number(ctx.options["offset"]);
      }

      const workflows = this.workflowService.list(
        Object.keys(filter).length > 0 ? filter : undefined,
      );

      ctx.reply(formatWorkflowList(workflows));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.replyError(`Failed to list workflows: ${message}`);
    }
  }

  // ── help ────────────────────────────────────────────────────────────

  async handleHelp(_ctx: CommandContext): Promise<void> {
    const help = [
      "SoloFlow — Workflow Commands",
      "═══════════════════════════",
      "",
      "/workflow start    Create and start a new workflow",
      "  --steps <string>   Inline step definitions (comma-separated)",
      "                      Format: \"name:discipline:dep1+dep2\"",
      "  --template <name>  Load from a saved template",
      "  --name <string>    Workflow name",
      "  --params <json>    Parameters to pass into steps",
      "",
      "/workflow status <id>",
      "  Show workflow state, progress, and step summary",
      "  --verbose, -v      Show detailed step output and DAG info",
      "",
      "/workflow cancel <id>",
      "  Cancel a running or queued workflow",
      "  --force, -f        Force-cancel from any non-terminal state",
      "",
      "/workflow list",
      "  List all workflows",
      "  --status <state>   Filter by state (idle|queued|running|paused|completed|failed|cancelled)",
      "  --template <name>  Filter by template name",
      "  --limit <n>        Max results",
      "  --offset <n>       Skip first N results",
      "",
      "/workflow help",
      "  Show this help text",
      "",
      "Alias: /wf <command>",
    ].join("\n");

    _ctx.reply(help);
  }
}

// ─── Command Registration ────────────────────────────────────────────

/**
 * Build and return the `/workflow` command registration tree.
 *
 * Wires each subcommand to the corresponding handler on a fresh
 * `WorkflowCommands` instance backed by the provided services.
 */
export function createWorkflowCommands(
  workflowService: WorkflowService,
  scheduler: Scheduler,
  templateRegistry: TemplateRegistry = new TemplateRegistry(),
): CommandRegistration {
  const handlers = new WorkflowCommands(workflowService, scheduler, templateRegistry);

  return {
    name: "workflow",
    description: "Manage SoloFlow DAG-based workflows",
    aliases: ["wf"],
    handler: (ctx: CommandContext) => {
      ctx.reply("Usage: /workflow <start|status|cancel|list|help>");
    },
    subcommands: [
      {
        name: "start",
        description: "Create and start a new workflow",
        handler: (ctx) => handlers.handleStart(ctx),
      },
      {
        name: "status",
        description: "Show workflow state and progress",
        handler: (ctx) => handlers.handleStatus(ctx),
      },
      {
        name: "cancel",
        description: "Cancel a running or queued workflow",
        handler: (ctx) => handlers.handleCancel(ctx),
      },
      {
        name: "list",
        description: "List workflows with optional filters",
        handler: (ctx) => handlers.handleList(ctx),
      },
      {
        name: "help",
        description: "Show help for workflow commands",
        handler: (ctx) => handlers.handleHelp(ctx),
      },
    ],
  };
}
