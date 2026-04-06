/**
 * SoloFlow — MCP Tool Definitions
 *
 * Exposes SoloFlow workflows as MCP tools: run, status, list, cancel, create.
 */

import type {
  StepId,
  Workflow,
  WorkflowId,
  WorkflowState,
  WorkflowStep,
} from "../types.js";
import type {
  MCPTool,
  SoloFlowCancelInput,
  SoloFlowCancelOutput,
  SoloFlowCreateInput,
  SoloFlowCreateOutput,
  SoloFlowListInput,
  SoloFlowListOutput,
  SoloFlowRunInput,
  SoloFlowRunOutput,
  SoloFlowStatusInput,
  SoloFlowStatusOutput,
} from "./types.js";
import { JSONRPC_ERROR_CODES } from "./types.js";
import { WorkflowService } from "../services/workflow-service.js";
import { Scheduler } from "../services/scheduler.js";
import { TemplateRegistry } from "../services/template-registry.js";

function brandId(id: string): WorkflowId {
  return id as unknown as WorkflowId;
}

function requireStringField(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== "string" || value.length === 0) {
    throw { code: JSONRPC_ERROR_CODES.INVALID_PARAMS, message: `Missing or invalid "${field}"` };
  }
  return value;
}

function workflowToSummary(wf: Workflow) {
  return {
    id: wf.id as unknown as string,
    name: wf.name,
    description: wf.description,
    state: wf.state,
    stepCount: wf.steps.size,
    createdAt: wf.createdAt,
    updatedAt: wf.updatedAt,
  };
}

export interface SoloFlowMCPToolServices {
  workflowService: WorkflowService;
  scheduler: Scheduler;
  templateRegistry: TemplateRegistry;
  executeWorkflow?: (workflowId: WorkflowId) => Promise<unknown>;
}

export class SoloFlowMCPTools {
  private readonly svc: SoloFlowMCPToolServices;

  constructor(services: SoloFlowMCPToolServices) {
    this.svc = services;
  }

  getTools(): MCPTool[] {
    return [
      this.runTool(),
      this.statusTool(),
      this.listTool(),
      this.cancelTool(),
      this.createTool(),
    ];
  }

  private runTool(): MCPTool {
    const svc = this.svc;
    return {
      name: "soloflow_run",
      description: "Run a SoloFlow workflow by ID or create one from a template and execute it",
      inputSchema: {
        type: "object",
        properties: {
          workflowId: { type: "string", description: "Existing workflow ID to execute" },
          description: { type: "string", description: "Natural-language description for ad-hoc workflow" },
          template: { type: "string", description: "Template name to use when creating" },
          variables: { type: "object", description: "Variables to inject into workflow steps" },
        },
      },
      async handler(raw: unknown): Promise<SoloFlowRunOutput> {
        const input = (raw ?? {}) as SoloFlowRunInput;

        if (input.workflowId) {
          const id = brandId(input.workflowId);
          const wf = svc.workflowService.get(id);
          if (!wf) {
            throw { code: JSONRPC_ERROR_CODES.WORKFLOW_NOT_FOUND, message: `Workflow not found: ${input.workflowId}` };
          }
          svc.workflowService.start(id);
          if (svc.executeWorkflow) {
            await svc.executeWorkflow(id);
          }
          return { workflowId: input.workflowId, state: wf.state, message: "Workflow started" };
        }

        if (!input.template) {
          throw { code: JSONRPC_ERROR_CODES.INVALID_PARAMS, message: "Must provide either workflowId or template" };
        }

        const tmpl = svc.templateRegistry.get(input.template);
        if (!tmpl) {
          throw { code: JSONRPC_ERROR_CODES.TEMPLATE_NOT_FOUND, message: `Template not found: ${input.template}` };
        }

        const wf = buildWorkflowFromTemplate(tmpl, input.description, { template: input.template, variables: input.variables ?? {} });

        const created = svc.workflowService.create(wf);
        svc.workflowService.start(created.id);
        if (svc.executeWorkflow) {
          await svc.executeWorkflow(created.id);
        }

        return {
          workflowId: created.id as unknown as string,
          state: created.state,
          message: "Workflow created and started",
        };
      },
    };
  }

  private statusTool(): MCPTool {
    const svc = this.svc;
    return {
      name: "soloflow_status",
      description: "Get the current status of a SoloFlow workflow including step-level progress",
      inputSchema: {
        type: "object",
        properties: {
          workflowId: { type: "string", description: "Workflow ID to query" },
        },
        required: ["workflowId"],
      },
      async handler(raw: unknown): Promise<SoloFlowStatusOutput> {
        const input = raw as SoloFlowStatusInput;
        const id = brandId(requireStringField(input as unknown as Record<string, unknown>, "workflowId"));
        const wf = svc.workflowService.get(id);
        if (!wf) {
          throw { code: JSONRPC_ERROR_CODES.WORKFLOW_NOT_FOUND, message: `Workflow not found: ${input.workflowId}` };
        }

        const execStatus = svc.scheduler.getStatus(id);
        const totalSteps = wf.steps.size;

        const steps = Array.from(wf.steps.values()).map((s) => ({
          id: s.id as unknown as string,
          name: s.name,
          state: s.state,
          durationMs: s.completedAt && s.startedAt ? s.completedAt - s.startedAt : undefined,
          error: s.error,
        }));

        return {
          workflowId: input.workflowId,
          state: wf.state,
          steps,
          progress: execStatus?.progress ?? (totalSteps > 0
            ? steps.filter((s) => s.state === "completed").length / totalSteps
            : 0),
          startedAt: execStatus?.startedAt,
          updatedAt: wf.updatedAt,
        };
      },
    };
  }

  private listTool(): MCPTool {
    const svc = this.svc;
    return {
      name: "soloflow_list",
      description: "List SoloFlow workflows with optional filtering by state",
      inputSchema: {
        type: "object",
        properties: {
          state: {
            type: "string",
            enum: ["idle", "queued", "running", "paused", "completed", "failed", "cancelled"],
            description: "Filter by workflow state",
          },
          limit: { type: "number", description: "Maximum number of results" },
          offset: { type: "number", description: "Number of results to skip" },
        },
      },
      async handler(raw: unknown): Promise<SoloFlowListOutput> {
        const input = (raw ?? {}) as SoloFlowListInput;
        const filter: { state?: WorkflowState; limit?: number; offset?: number } = {};
        if (input.state) filter.state = input.state;
        if (input.limit) filter.limit = input.limit;
        if (input.offset) filter.offset = input.offset;

        const workflows = svc.workflowService.list(filter);
        return {
          workflows: workflows.map(workflowToSummary),
          total: workflows.length,
        };
      },
    };
  }

  private cancelTool(): MCPTool {
    const svc = this.svc;
    return {
      name: "soloflow_cancel",
      description: "Cancel a running SoloFlow workflow",
      inputSchema: {
        type: "object",
        properties: {
          workflowId: { type: "string", description: "Workflow ID to cancel" },
          force: { type: "boolean", description: "Force-cancel from any non-terminal state" },
        },
        required: ["workflowId"],
      },
      async handler(raw: unknown): Promise<SoloFlowCancelOutput> {
        const input = raw as SoloFlowCancelInput;
        const id = brandId(requireStringField(input as unknown as Record<string, unknown>, "workflowId"));
        const wf = svc.workflowService.get(id);
        if (!wf) {
          throw { code: JSONRPC_ERROR_CODES.WORKFLOW_NOT_FOUND, message: `Workflow not found: ${input.workflowId}` };
        }

        const previousState = wf.state;
        svc.scheduler.cancel(id);
        svc.workflowService.cancel(id, input.force ?? false);

        return {
          workflowId: input.workflowId,
          previousState,
          state: "cancelled",
          message: `Workflow cancelled (was ${previousState})`,
        };
      },
    };
  }

  private createTool(): MCPTool {
    const svc = this.svc;
    return {
      name: "soloflow_create",
      description: "Create a new SoloFlow workflow from a registered template",
      inputSchema: {
        type: "object",
        properties: {
          template: { type: "string", description: "Template name, e.g. 'research', 'content', 'code-review'" },
          name: { type: "string", description: "Override workflow name" },
          variables: { type: "object", description: "Variables to inject" },
          metadata: { type: "object", description: "Arbitrary metadata to attach" },
        },
        required: ["template"],
      },
      async handler(raw: unknown): Promise<SoloFlowCreateOutput> {
        const input = raw as SoloFlowCreateInput;
        const templateName = requireStringField(input as unknown as Record<string, unknown>, "template");
        const tmpl = svc.templateRegistry.get(templateName);
        if (!tmpl) {
          throw { code: JSONRPC_ERROR_CODES.TEMPLATE_NOT_FOUND, message: `Template not found: ${templateName}` };
        }

        const wf = buildWorkflowFromTemplate(tmpl, input.name, { template: templateName, variables: input.variables ?? {}, ...input.metadata });

        const created = svc.workflowService.create(wf);

        return {
          workflowId: created.id as unknown as string,
          name: created.name,
          template: templateName,
          stepCount: created.steps.size,
          state: created.state,
        };
      },
    };
  }
}

function buildWorkflowFromTemplate(
  tmpl: { name: string; description: string; steps: Array<{ id: StepId; name: string; discipline: import("../types.js").AgentDiscipline; dependencies: StepId[]; config: Record<string, unknown> }> },
  nameOverride: string | undefined,
  metadata: Record<string, unknown>,
): Workflow {
  const steps = new Map<StepId, WorkflowStep>(
    tmpl.steps.map((s) => [s.id, { ...s, state: "pending" as const }]),
  );
  return {
    id: crypto.randomUUID() as unknown as WorkflowId,
    name: nameOverride ?? tmpl.name,
    description: tmpl.description,
    steps,
    dag: { nodes: new Map(), edges: [], layers: [] },
    state: "idle",
    currentSteps: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata,
  };
}
