import type { ApiRequest, ApiResponse, CreateWorkflowBody, ListWorkflowsQuery, UpdateWorkflowBody } from "../types.js";
import type { ApiServices } from "../types.js";
import type { WorkflowId, StepId, WorkflowStep, WorkflowState } from "../../types.js";
import { jsonResponse, HttpError } from "../router.js";
import { TemplateRegistry } from "../../services/template-registry.js";

function asStepId(s: string): StepId {
  return s as unknown as StepId;
}

function asWorkflowId(s: string): WorkflowId {
  return s as unknown as WorkflowId;
}

function checkOwnership(workflow: import("../../types.js").Workflow, userId: string | undefined): void {
  // Legacy workflows (no ownerId) and anonymous users skip ownership check
  if (!workflow.ownerId || !userId) return;
  if (workflow.ownerId !== userId) {
    throw new HttpError(403, "You do not have permission to modify this workflow");
  }
}

function serializeWorkflow(workflow: import("../../types.js").Workflow) {
  const steps = Array.from(workflow.steps.values()).map((s) => ({
    id: s.id,
    name: s.name,
    discipline: s.discipline,
    dependencies: s.dependencies,
    config: s.config,
    state: s.state,
    result: s.result,
    error: s.error,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
  }));

  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    ownerId: workflow.ownerId,
    steps,
    state: workflow.state,
    currentSteps: workflow.currentSteps,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    metadata: workflow.metadata,
  };
}

export function createWorkflowRoutes(services: ApiServices, _templates: TemplateRegistry) {
  return {
    async list(req: ApiRequest): Promise<ApiResponse> {
      const query = req.query as ListWorkflowsQuery;
      const limit = query.limit ? parseInt(query.limit, 10) : 50;
      const offset = query.offset ? parseInt(query.offset, 10) : 0;

      const workflows = services.workflowService.list({
        status: query.state as WorkflowState | undefined,
        template: query.template,
        limit,
        offset,
      });

      const total = services.workflowService.list().length;
      return jsonResponse(200, {
        data: workflows.map(serializeWorkflow),
        total,
        limit,
        offset,
      });
    },

    async create(req: ApiRequest): Promise<ApiResponse> {
      const body = req.body as CreateWorkflowBody;

      if (!body?.name) {
        throw new HttpError(400, "Workflow name is required");
      }

      if (!body?.steps || !Array.isArray(body.steps) || body.steps.length === 0) {
        throw new HttpError(400, "At least one step is required");
      }

      const steps: WorkflowStep[] = body.steps.map((s, i) => ({
        id: asStepId(s.id ?? `step-${i}`),
        name: s.name,
        discipline: s.discipline as import("../../types.js").AgentDiscipline,
        dependencies: s.dependencies.map(asStepId),
        config: s.config,
        state: "pending" as const,
      }));

      const workflow: import("../../types.js").Workflow = {
        id: crypto.randomUUID() as unknown as WorkflowId,
        name: body.name,
        description: body.description ?? "",
        ownerId: req.user?.id,
        steps: new Map(steps.map((s) => [s.id, s])),
        dag: {
          nodes: new Map(),
          edges: [],
          layers: [],
        },
        state: "idle",
        currentSteps: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: body.metadata ?? {},
      };

      const created = services.workflowService.create(workflow);
      return jsonResponse(201, serializeWorkflow(created));
    },

    async get(req: ApiRequest): Promise<ApiResponse> {
      const id = asWorkflowId(req.params["id"] ?? "");
      const workflow = services.workflowService.get(id);
      if (!workflow) {
        throw new HttpError(404, `Workflow not found: ${String(id)}`);
      }
      return jsonResponse(200, serializeWorkflow(workflow));
    },

    async update(req: ApiRequest): Promise<ApiResponse> {
      const id = asWorkflowId(req.params["id"] ?? "");
      const workflow = services.workflowService.get(id);
      if (!workflow) {
        throw new HttpError(404, `Workflow not found: ${String(id)}`);
      }
      checkOwnership(workflow, req.user?.id);

      const body = req.body as UpdateWorkflowBody;
      if (body.name !== undefined) workflow.name = body.name;
      if (body.description !== undefined) workflow.description = body.description;
      if (body.metadata !== undefined) workflow.metadata = body.metadata;

      services.workflowService.update(workflow);
      return jsonResponse(200, serializeWorkflow(workflow));
    },

    async delete_(req: ApiRequest): Promise<ApiResponse> {
      const id = asWorkflowId(req.params["id"] ?? "");
      const workflow = services.workflowService.get(id);
      if (!workflow) {
        throw new HttpError(404, `Workflow not found: ${String(id)}`);
      }
      checkOwnership(workflow, req.user?.id);
      try {
        services.workflowService.delete(id);
      } catch (e) { console.warn(`error: ${e}`);
        throw new HttpError(404, `Workflow not found: ${String(id)}`);
      }
      return jsonResponse(204, null);
    },

    async start(req: ApiRequest): Promise<ApiResponse> {
      const id = asWorkflowId(req.params["id"] ?? "");
      const workflow = services.workflowService.get(id);
      if (!workflow) {
        throw new HttpError(404, `Workflow not found: ${String(id)}`);
      }
      checkOwnership(workflow, req.user?.id);
      try {
        services.workflowService.start(id);
      } catch (err) {
        throw new HttpError(409, err instanceof Error ? err.message : "Cannot start workflow");
      }
      const updated = services.workflowService.get(id);
      return jsonResponse(200, { state: updated?.state, id: String(id) });
    },

    async cancel(req: ApiRequest): Promise<ApiResponse> {
      const id = asWorkflowId(req.params["id"] ?? "");
      const workflow = services.workflowService.get(id);
      if (!workflow) {
        throw new HttpError(404, `Workflow not found: ${String(id)}`);
      }
      checkOwnership(workflow, req.user?.id);
      try {
        services.workflowService.cancel(id, true);
      } catch (err) {
        throw new HttpError(409, err instanceof Error ? err.message : "Cannot cancel workflow");
      }
      const updated = services.workflowService.get(id);
      return jsonResponse(200, { state: updated?.state, id: String(id) });
    },
  };
}
