/**
 * SoloFlow — RPC Methods
 *
 * Programmatic access layer for SoloFlow workflows.  Every method is
 * described with a JSON Schema so the OpenClaw host can auto-discover
 * and validate calls at the transport level.
 */

import type {
  AgentDiscipline,
  OpenClawApi,
  RPCMethod,
  StepId,
  Workflow,
  WorkflowId,
  WorkflowStep,
  WorkflowState,
} from "../types.js";
import { AGENT_DISCIPLINES } from "../types.js";
import { WorkflowService } from "../services/workflow-service.js";
import { Scheduler } from "../services/scheduler.js";
import { DISCIPLINE_CONFIGS } from "../agents/discipline.js";

// ─── Helpers ──────────────────────────────────────────────────────────

function now(): number {
  return Date.now();
}

function brandId<T extends string>(raw: string): T {
  return raw as unknown as T;
}

/** Build a minimal JSON-Schema object type from a list of required + optional props. */
function objectSchema(
  required: Record<string, Record<string, unknown>>,
  optional?: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  const properties: Record<string, unknown> = { ...required, ...optional };
  return {
    type: "object",
    properties,
    required: Object.keys(required),
    additionalProperties: false,
  };
}

function rpcError(code: number, message: string, data?: unknown) {
  return { error: { code, message, data } };
}

// ─── Param Schemas ────────────────────────────────────────────────────

const WORKFLOW_ID_PROP = { type: "string", description: "Workflow ID" };

const SCHEMA_WORKFLOW_CREATE_PARAMS = objectSchema(
  {},
  {
    template: { type: "string", description: "Template name to instantiate" },
    steps: {
      type: "array",
      description: "Inline step definitions",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          discipline: { type: "string", enum: [...AGENT_DISCIPLINES] },
          dependencies: { type: "array", items: { type: "string" } },
          config: { type: "object" },
        },
        required: ["id", "name", "discipline"],
      },
    },
    params: { type: "object", description: "Template substitution parameters" },
    timeout: { type: "number", description: "Workflow-level timeout in ms" },
  },
);

const SCHEMA_WORKFLOW_START_PARAMS = objectSchema(
  { id: WORKFLOW_ID_PROP },
  undefined,
);

const SCHEMA_WORKFLOW_STATUS_PARAMS = objectSchema(
  { id: WORKFLOW_ID_PROP },
  { verbose: { type: "boolean", description: "Include step-level details" } },
);

const SCHEMA_WORKFLOW_LIST_PARAMS = objectSchema(
  {},
  {
    status: { type: "string", enum: ["idle", "queued", "running", "paused", "completed", "failed", "cancelled"] },
    template: { type: "string" },
    limit: { type: "number", minimum: 1 },
    offset: { type: "number", minimum: 0 },
  },
);

const SCHEMA_WORKFLOW_PAUSE_PARAMS = objectSchema(
  { id: WORKFLOW_ID_PROP },
  undefined,
);

const SCHEMA_WORKFLOW_RESUME_PARAMS = objectSchema(
  { id: WORKFLOW_ID_PROP },
  undefined,
);

const SCHEMA_WORKFLOW_CANCEL_PARAMS = objectSchema(
  { id: WORKFLOW_ID_PROP },
  { force: { type: "boolean", description: "Cancel from any non-terminal state" } },
);

const SCHEMA_WORKFLOW_RETRY_PARAMS = objectSchema(
  { id: WORKFLOW_ID_PROP },
  undefined,
);

const SCHEMA_WORKFLOW_DELETE_PARAMS = objectSchema(
  { id: WORKFLOW_ID_PROP },
  undefined,
);

const SCHEMA_AGENT_LIST_DISCIPLINES_PARAMS = objectSchema({}, undefined);

// ─── Return Schemas ───────────────────────────────────────────────────

const WORKFLOW_ID_RETURN = { type: "string", description: "Workflow ID" };
const STATUS_ENUM = {
  type: "string",
  enum: ["idle", "queued", "running", "paused", "completed", "failed", "cancelled"],
};

const SCHEMA_WORKFLOW_CREATE_RETURNS: Record<string, unknown> = {
  type: "object",
  properties: {
    id: WORKFLOW_ID_RETURN,
    status: STATUS_ENUM,
    createdAt: { type: "number" },
  },
  required: ["id", "status", "createdAt"],
};

const SCHEMA_WORKFLOW_START_RETURNS: Record<string, unknown> = {
  type: "object",
  properties: {
    id: WORKFLOW_ID_RETURN,
    status: STATUS_ENUM,
    startedAt: { type: "number" },
  },
  required: ["id", "status", "startedAt"],
};

const SCHEMA_WORKFLOW_STATUS_RETURNS: Record<string, unknown> = {
  type: "object",
  properties: {
    id: WORKFLOW_ID_RETURN,
    status: STATUS_ENUM,
    steps: { type: "array" },
    createdAt: { type: "number" },
    updatedAt: { type: "number" },
    error: { type: "string" },
  },
  required: ["id", "status", "steps", "createdAt", "updatedAt"],
};

const SCHEMA_WORKFLOW_LIST_RETURNS: Record<string, unknown> = {
  type: "object",
  properties: {
    workflows: { type: "array" },
    total: { type: "number" },
  },
  required: ["workflows", "total"],
};

const SCHEMA_WORKFLOW_PAUSE_RETURNS: Record<string, unknown> = {
  type: "object",
  properties: {
    id: WORKFLOW_ID_RETURN,
    status: STATUS_ENUM,
    pausedAt: { type: "number" },
  },
  required: ["id", "status", "pausedAt"],
};

const SCHEMA_WORKFLOW_RESUME_RETURNS: Record<string, unknown> = {
  type: "object",
  properties: {
    id: WORKFLOW_ID_RETURN,
    status: STATUS_ENUM,
    resumedAt: { type: "number" },
  },
  required: ["id", "status", "resumedAt"],
};

const SCHEMA_WORKFLOW_CANCEL_RETURNS: Record<string, unknown> = {
  type: "object",
  properties: {
    id: WORKFLOW_ID_RETURN,
    status: STATUS_ENUM,
    cancelledAt: { type: "number" },
  },
  required: ["id", "status", "cancelledAt"],
};

const SCHEMA_WORKFLOW_RETRY_RETURNS: Record<string, unknown> = {
  type: "object",
  properties: {
    id: WORKFLOW_ID_RETURN,
    status: STATUS_ENUM,
    retriedAt: { type: "number" },
  },
  required: ["id", "status", "retriedAt"],
};

const SCHEMA_WORKFLOW_DELETE_RETURNS: Record<string, unknown> = {
  type: "object",
  properties: { deleted: { type: "boolean" } },
  required: ["deleted"],
};

const SCHEMA_AGENT_LIST_DISCIPLINES_RETURNS: Record<string, unknown> = {
  type: "object",
  properties: {
    disciplines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          defaultModel: { type: "string" },
          maxTokens: { type: "number" },
          tools: { type: "array", items: { type: "string" } },
        },
        required: ["name", "description", "defaultModel", "maxTokens", "tools"],
      },
    },
  },
  required: ["disciplines"],
};

// ─── RPCHandler (extended internal type) ──────────────────────────────

interface RPCHandler {
  name: string;
  description: string;
  params: Record<string, unknown>;
  returns: Record<string, unknown>;
  handler: (params: Record<string, unknown>, api: OpenClawApi) => Promise<unknown>;
}

// ─── RPCRouter ────────────────────────────────────────────────────────

export class RPCRouter {
  private readonly handlers = new Map<string, RPCHandler>();

  constructor(
    private readonly workflowService: WorkflowService,
    private readonly scheduler: Scheduler,
    private readonly api: OpenClawApi,
  ) {
    this.buildMethods();
  }

  register(): RPCMethod[] {
    return Array.from(this.handlers.values()).map((h) => ({
      name: h.name,
      description: h.description,
      schema: { params: h.params, returns: h.returns },
      handler: (params: Record<string, unknown>) =>
        h.handler(params, this.api),
    }));
  }

  async route(
    method: string,
    params: unknown,
    api: OpenClawApi,
  ): Promise<unknown> {
    const entry = this.handlers.get(method);
    if (!entry) {
      return rpcError(-32601, `Method not found: ${method}`);
    }

    try {
      const result = await entry.handler(params as Record<string, unknown>, api);
      return { result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code =
        err instanceof Error && err.name === "WorkflowNotFoundError"
          ? -32001
          : err instanceof Error && err.name === "InvalidTransitionError"
            ? -32002
            : -32603;
      return rpcError(code, message);
    }
  }

  // ── Method Builders ──────────────────────────────────────────────────

  private buildMethods(): void {
    // workflow.create
    this.handlers.set("workflow.create", {
      name: "workflow.create",
      description: "Create a new workflow from a template or inline step definitions.",
      params: SCHEMA_WORKFLOW_CREATE_PARAMS,
      returns: SCHEMA_WORKFLOW_CREATE_RETURNS,
      handler: async (params) => {
        const steps = this.resolveSteps(params);
        const id = brandId<WorkflowId>(`wf_${now()}_${Math.random().toString(36).slice(2, 8)}`);

        const stepMap = new Map<StepId, WorkflowStep>();
        for (const s of steps) {
          stepMap.set(s.id, { ...s, state: "pending" });
        }

        const workflow: Workflow = {
          id,
          name: (params['template'] as string) ?? "untitled",
          description: `Workflow created via RPC`,
          steps: stepMap,
          dag: { nodes: new Map(), edges: [], layers: [] },
          state: "idle",
          currentSteps: [],
          createdAt: now(),
          updatedAt: now(),
          metadata: {
            ...(params['template'] ? { template: params['template'] } : {}),
            ...(params['params'] ? { params: params['params'] } : {}),
            ...(params['timeout'] ? { timeout: params['timeout'] } : {}),
          },
        };

        const created = this.workflowService.create(workflow);

        return {
          id: created.id,
          status: created.state,
          createdAt: created.createdAt,
        };
      },
    });

    // workflow.start
    this.handlers.set("workflow.start", {
      name: "workflow.start",
      description: "Transition a workflow to running and begin the scheduler.",
      params: SCHEMA_WORKFLOW_START_PARAMS,
      returns: SCHEMA_WORKFLOW_START_RETURNS,
      handler: async (params, api) => {
        const id = brandId<WorkflowId>(params['id'] as string);
        const startedAt = now();
        this.workflowService.start(id);

        this.scheduler
          .execute(id, api as any)
          .then((result) => {
            api.logger.info(`[rpc] Workflow ${id} execution completed`, result);
            const wf = this.workflowService.get(id);
            if (wf && wf.state === "running") {
              if (result.failed.length > 0 && result.completed.length === 0) {
                try { this.workflowService.cancel(id); } catch { /* already terminal */ }
              }
            }
          })
          .catch((err: unknown) => {
            api.logger.error(`[rpc] Workflow ${id} execution failed: ${err}`);
          });

        const wf = this.workflowService.get(id);
        return {
          id,
          status: wf?.state ?? "running",
          startedAt,
        };
      },
    });

    // workflow.status
    this.handlers.set("workflow.status", {
      name: "workflow.status",
      description: "Get the full status of a workflow.",
      params: SCHEMA_WORKFLOW_STATUS_PARAMS,
      returns: SCHEMA_WORKFLOW_STATUS_RETURNS,
      handler: async (params) => {
        const id = brandId<WorkflowId>(params['id'] as string);
        const wf = this.workflowService.get(id);
        if (!wf) {
          throw new Error(`Workflow not found: ${id}`);
        }

        const verbose = params['verbose'] === true;
        const steps = verbose
          ? Array.from(wf.steps.values()).map((s) => ({
              id: s.id,
              name: s.name,
              discipline: s.discipline,
              state: s.state,
              error: s.error,
              startedAt: s.startedAt,
              completedAt: s.completedAt,
            }))
          : Array.from(wf.steps.values()).map((s) => ({
              id: s.id,
              name: s.name,
              state: s.state,
            }));

        const schedStatus = this.scheduler.getStatus(id);
        const stepErrors = schedStatus?.failedSteps.map((f) => f.error).join("; ");

        return {
          id: wf.id,
          status: wf.state,
          steps,
          createdAt: wf.createdAt,
          updatedAt: wf.updatedAt,
          error: stepErrors || undefined,
        };
      },
    });

    // workflow.list
    this.handlers.set("workflow.list", {
      name: "workflow.list",
      description: "List workflows with optional filtering and pagination.",
      params: SCHEMA_WORKFLOW_LIST_PARAMS,
      returns: SCHEMA_WORKFLOW_LIST_RETURNS,
      handler: async (params) => {
        const filter: {
          status?: WorkflowState;
          template?: string;
          limit?: number;
          offset?: number;
        } = {};

        if (params['status']) filter.status = params['status'] as WorkflowState;
        if (params['template']) filter.template = params['template'] as string;

        const all = this.workflowService.list();
        const filtered = this.workflowService.list(
          Object.keys(filter).length > 0 ? filter : undefined,
        );

        let results = filtered;
        const offset = typeof params['offset'] === "number" ? params['offset'] : 0;
        const limit = typeof params['limit'] === "number" ? params['limit'] : results.length;
        results = results.slice(offset, offset + limit);

        const workflows = results.map((wf) => ({
          id: wf.id,
          name: wf.name,
          status: wf.state,
          stepCount: wf.steps.size,
          createdAt: wf.createdAt,
          updatedAt: wf.updatedAt,
        }));

        return {
          workflows,
          total: all.length,
        };
      },
    });

    // workflow.pause
    this.handlers.set("workflow.pause", {
      name: "workflow.pause",
      description: "Pause a running workflow.",
      params: SCHEMA_WORKFLOW_PAUSE_PARAMS,
      returns: SCHEMA_WORKFLOW_PAUSE_RETURNS,
      handler: async (params) => {
        const id = brandId<WorkflowId>(params['id'] as string);
        this.workflowService.pause(id);
        const wf = this.workflowService.get(id);
        return {
          id,
          status: wf?.state ?? "paused",
          pausedAt: now(),
        };
      },
    });

    // workflow.resume
    this.handlers.set("workflow.resume", {
      name: "workflow.resume",
      description: "Resume a paused workflow.",
      params: SCHEMA_WORKFLOW_RESUME_PARAMS,
      returns: SCHEMA_WORKFLOW_RESUME_RETURNS,
      handler: async (params, api) => {
        const id = brandId<WorkflowId>(params['id'] as string);
        const resumedAt = now();
        this.workflowService.resume(id);

        this.scheduler
          .execute(id, api as any)
          .catch((err: unknown) => {
            api.logger.error(`[rpc] Workflow ${id} resume execution failed: ${err}`);
          });

        const wf = this.workflowService.get(id);
        return {
          id,
          status: wf?.state ?? "running",
          resumedAt,
        };
      },
    });

    // workflow.cancel
    this.handlers.set("workflow.cancel", {
      name: "workflow.cancel",
      description: "Cancel a workflow. Use force=true to cancel from any non-terminal state.",
      params: SCHEMA_WORKFLOW_CANCEL_PARAMS,
      returns: SCHEMA_WORKFLOW_CANCEL_RETURNS,
      handler: async (params) => {
        const id = brandId<WorkflowId>(params['id'] as string);
        const force = params['force'] === true;
        this.workflowService.cancel(id, force);
        this.scheduler.cancel(id);
        const wf = this.workflowService.get(id);
        return {
          id,
          status: wf?.state ?? "cancelled",
          cancelledAt: now(),
        };
      },
    });

    // workflow.retry
    this.handlers.set("workflow.retry", {
      name: "workflow.retry",
      description: "Retry a failed or cancelled workflow by re-queuing it.",
      params: SCHEMA_WORKFLOW_RETRY_PARAMS,
      returns: SCHEMA_WORKFLOW_RETRY_RETURNS,
      handler: async (params) => {
        const id = brandId<WorkflowId>(params['id'] as string);
        this.workflowService.retry(id);
        const wf = this.workflowService.get(id);
        return {
          id,
          status: wf?.state ?? "queued",
          retriedAt: now(),
        };
      },
    });

    // workflow.delete
    this.handlers.set("workflow.delete", {
      name: "workflow.delete",
      description: "Permanently delete a workflow.",
      params: SCHEMA_WORKFLOW_DELETE_PARAMS,
      returns: SCHEMA_WORKFLOW_DELETE_RETURNS,
      handler: async (params) => {
        const id = brandId<WorkflowId>(params['id'] as string);
        this.workflowService.delete(id);
        return { deleted: true };
      },
    });

    // agent.listDisciplines
    this.handlers.set("agent.listDisciplines", {
      name: "agent.listDisciplines",
      description: "List available agent disciplines and their configurations.",
      params: SCHEMA_AGENT_LIST_DISCIPLINES_PARAMS,
      returns: SCHEMA_AGENT_LIST_DISCIPLINES_RETURNS,
      handler: async () => {
        const disciplines = AGENT_DISCIPLINES.map((name: AgentDiscipline) => {
          const cfg = DISCIPLINE_CONFIGS[name];
          return {
            name,
            description: cfg.systemPrompt.split(".")[0],
            defaultModel: cfg.defaultModel,
            maxTokens: cfg.maxTokens,
            tools: [],
          };
        });
        return { disciplines };
      },
    });
  }

  // ── Step Resolution ──────────────────────────────────────────────────

  /** Convert inline step definitions into WorkflowStep-compatible objects. */
  private resolveSteps(
    params: Record<string, unknown>,
  ): Array<Omit<WorkflowStep, "state" | "result" | "error" | "startedAt" | "completedAt">> {
    const raw = params['steps'];
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new Error("At least one step must be provided via 'steps' or 'template'");
    }

    return raw.map(
      (s: Record<string, unknown>, idx: number) => ({
        id: brandId<StepId>((s['id'] as string) ?? `step_${idx}`),
        name: (s['name'] as string) ?? `Step ${idx}`,
        discipline: (s['discipline'] as AgentDiscipline) ?? "quick",
        dependencies: Array.isArray(s['dependencies'])
          ? (s['dependencies'] as string[]).map((d) => brandId<StepId>(d))
          : [],
        config: (s['config'] as Record<string, unknown>) ?? {},
      }),
    );
  }
}

// ─── Re-exports ───────────────────────────────────────────────────────

export type { RPCMethod, RPCRequest, RPCResponse } from "../types.js";
