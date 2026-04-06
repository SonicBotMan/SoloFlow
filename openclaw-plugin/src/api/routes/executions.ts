import type { ApiRequest, ApiResponse, ExecutionLogEntry } from "../types.js";
import type { ApiServices } from "../types.js";
import type { WorkflowId, StepId } from "../../types.js";
import { jsonResponse, HttpError } from "../router.js";

function asWorkflowId(s: string): WorkflowId {
  return s as unknown as WorkflowId;
}

function buildLogsFromStatus(status: import("../../services/scheduler.js").WorkflowExecutionStatus): ExecutionLogEntry[] {
  const logs: ExecutionLogEntry[] = [];

  logs.push({
    timestamp: status.startedAt,
    level: "info",
    message: "Workflow execution started",
  });

  for (const stepId of status.completedSteps) {
    logs.push({
      timestamp: status.updatedAt,
      level: "info",
      stepId: stepId as StepId,
      message: `Step completed: ${String(stepId)}`,
    });
  }

  for (const fail of status.failedSteps) {
    logs.push({
      timestamp: status.updatedAt,
      level: "error",
      stepId: fail.stepId as StepId,
      message: `Step failed: ${String(fail.stepId)}`,
      data: { error: fail.error },
    });
  }

  if (status.state === "cancelled") {
    logs.push({
      timestamp: status.updatedAt,
      level: "warn",
      message: "Workflow execution cancelled",
    });
  }

  return logs;
}

export function createExecutionRoutes(services: ApiServices) {
  return {
    async getStatus(req: ApiRequest): Promise<ApiResponse> {
      const id = asWorkflowId(req.params["id"] ?? "");
      const status = services.scheduler.getStatus(id);

      if (!status) {
        const workflow = services.workflowService.get(id);
        if (!workflow) {
          throw new HttpError(404, `Execution not found: ${String(id)}`);
        }
        return jsonResponse(200, {
          workflowId: id,
          state: workflow.state,
          progress: 0,
          completedSteps: [],
          failedSteps: [],
          runningSteps: [],
        });
      }

      return jsonResponse(200, status);
    },

    async getLogs(req: ApiRequest): Promise<ApiResponse> {
      const id = asWorkflowId(req.params["id"] ?? "");
      const status = services.scheduler.getStatus(id);

      if (!status) {
        const workflow = services.workflowService.get(id);
        if (!workflow) {
          throw new HttpError(404, `Execution not found: ${String(id)}`);
        }
        return jsonResponse(200, { data: [], total: 0 });
      }

      const logs = buildLogsFromStatus(status);
      return jsonResponse(200, { data: logs, total: logs.length });
    },

    async list(req: ApiRequest): Promise<ApiResponse> {
      const limit = req.query["limit"] ? parseInt(req.query["limit"], 10) : 50;
      const offset = req.query["offset"] ? parseInt(req.query["offset"], 10) : 0;

      const workflows = services.workflowService.list();
      const executions = [];

      for (const wf of workflows) {
        const status = services.scheduler.getStatus(wf.id);
        if (status) {
          executions.push({
            workflowId: wf.id,
            workflowName: wf.name,
            state: status.state,
            progress: status.progress,
            startedAt: status.startedAt,
            updatedAt: status.updatedAt,
          });
        }
      }

      const paged = executions.slice(offset, offset + limit);
      return jsonResponse(200, {
        data: paged,
        total: executions.length,
        limit,
        offset,
      });
    },
  };
}
