import type { ApiRequest, ApiResponse, CreateTemplateBody } from "../types.js";
import type { StepId } from "../../types.js";
import { jsonResponse, HttpError } from "../router.js";
import { TemplateRegistry } from "../../services/template-registry.js";

function asStepId(s: string): StepId {
  return s as unknown as StepId;
}

export function createTemplateRoutes(templates: TemplateRegistry) {
  return {
    async list(_req: ApiRequest): Promise<ApiResponse> {
      const entries = templates.entries();
      const data = entries.map(([key, tpl]) => ({
        key,
        name: tpl.name,
        description: tpl.description,
        stepCount: tpl.steps.length,
      }));
      return jsonResponse(200, { data, total: data.length });
    },

    async create(req: ApiRequest): Promise<ApiResponse> {
      const body = req.body as CreateTemplateBody;

      if (!body?.key) {
        throw new HttpError(400, "Template key is required");
      }
      if (!body?.name) {
        throw new HttpError(400, "Template name is required");
      }
      if (!body?.steps || !Array.isArray(body.steps) || body.steps.length === 0) {
        throw new HttpError(400, "At least one step is required");
      }

      const template: import("../../types.js").WorkflowTemplate = {
        name: body.name,
        description: body.description ?? "",
        steps: body.steps.map((s, i) => ({
          id: asStepId(s.id ?? `step-${i}`),
          name: s.name,
          discipline: s.discipline as import("../../types.js").AgentDiscipline,
          dependencies: s.dependencies.map(asStepId),
          config: s.config,
        })),
      };

      templates.register(body.key, template);
      return jsonResponse(201, { key: body.key, name: template.name });
    },

    async get(req: ApiRequest): Promise<ApiResponse> {
      const key = req.params["id"] ?? "";
      const template = templates.get(key);
      if (!template) {
        throw new HttpError(404, `Template not found: ${key}`);
      }

      return jsonResponse(200, {
        key,
        name: template.name,
        description: template.description,
        steps: template.steps.map((s) => ({
          id: s.id,
          name: s.name,
          discipline: s.discipline,
          dependencies: s.dependencies,
          config: s.config,
        })),
      });
    },
  };
}
