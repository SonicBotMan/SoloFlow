/**
 * SoloFlow — API Server
 *
 * Factory that wires Router + WebSocket + routes + middleware.
 * Integrates with the OpenClaw plugin lifecycle.
 */

import type { ApiRequest, ApiResponse, ApiServices } from "./types.js";
import type { OpenClawApi } from "../types.js";
import { Router, jsonResponse, type HttpError } from "./router.js";
import { WebSocketServer } from "./websocket.js";
import { createWorkflowRoutes } from "./routes/workflows.js";
import { createExecutionRoutes } from "./routes/executions.js";
import { createTemplateRoutes } from "./routes/templates.js";
import { createEvolvedRoutes } from "./routes/evolved.js";
import {
  createCompositeAuthMiddleware,
  createJwtAuthMiddleware,
  createApiKeyAuthMiddleware,
  type JwtAuthOptions,
  type ApiKeyAuthOptions,
} from "./middleware/auth.js";

export interface ApiServerConfig {
  jwt?: JwtAuthOptions;
  apiKeys?: ApiKeyAuthOptions;
  requireAuth?: boolean;
}

export interface ApiServer {
  router: Router;
  websocket: WebSocketServer;
  handle(req: ApiRequest): Promise<ApiResponse>;
  handleWsMessage(wsId: string, raw: string): void;
  close(): void;
}

export function createApiServer(services: ApiServices, config?: ApiServerConfig): ApiServer {
  const router = new Router();
  const websocket = new WebSocketServer(services.workflowService);

  const wfRoutes = createWorkflowRoutes(services, services.templateRegistry);
  const exRoutes = createExecutionRoutes(services);
  const tplRoutes = createTemplateRoutes(services.templateRegistry);
  const evoRoutes = createEvolvedRoutes(services.evolutionStore, services.skillInventory);

  registerRoutes(router, { wfRoutes, exRoutes, tplRoutes, evoRoutes });

  if (config?.requireAuth !== false && (config?.jwt || config?.apiKeys)) {
    if (config.jwt && config.apiKeys) {
      router.use(createCompositeAuthMiddleware(config.jwt, config.apiKeys));
    } else if (config.jwt) {
      router.use(createJwtAuthMiddleware(config.jwt));
    } else if (config.apiKeys) {
      router.use(createApiKeyAuthMiddleware(config.apiKeys));
    }
  }

  router.use(errorHandlingMiddleware());

  websocket.init();

  return {
    router,
    websocket,
    async handle(req: ApiRequest): Promise<ApiResponse> {
      return router.handle(req);
    },
    handleWsMessage(wsId: string, raw: string): void {
      websocket.handleMessage(wsId, raw);
    },
    close(): void {
      websocket.destroy();
    },
  };
}

function registerRoutes(
  router: Router,
  routes: {
    wfRoutes: ReturnType<typeof createWorkflowRoutes>;
    exRoutes: ReturnType<typeof createExecutionRoutes>;
    tplRoutes: ReturnType<typeof createTemplateRoutes>;
    evoRoutes: ReturnType<typeof createEvolvedRoutes>;
  },
): void {
  router.get("/workflows", routes.wfRoutes.list);
  router.post("/workflows", routes.wfRoutes.create);
  router.get("/workflows/:id", routes.wfRoutes.get);
  router.put("/workflows/:id", routes.wfRoutes.update);
  router.delete("/workflows/:id", routes.wfRoutes.delete_);
  router.post("/workflows/:id/start", routes.wfRoutes.start);
  router.post("/workflows/:id/cancel", routes.wfRoutes.cancel);

  router.get("/executions", routes.exRoutes.list);
  router.get("/executions/:id", routes.exRoutes.getStatus);
  router.get("/executions/:id/logs", routes.exRoutes.getLogs);

  router.get("/templates", routes.tplRoutes.list);
  router.post("/templates", routes.tplRoutes.create);
  router.get("/templates/:id", routes.tplRoutes.get);

  // Evolved templates & skills
  router.get("/evolved", routes.evoRoutes.listEvolved);
  router.get("/evolved/stats", routes.evoRoutes.evolveStats);
  router.get("/evolved/search", routes.evoRoutes.searchEvolved);
  router.get("/evolved/:id", routes.evoRoutes.getEvolved);
  router.delete("/evolved/:id", routes.evoRoutes.deleteEvolved);
  router.post("/evolved/:id/record-usage", routes.evoRoutes.recordUsage);

  router.get("/skills", routes.evoRoutes.listSkills);
  router.get("/skills/search", routes.evoRoutes.searchSkills);
}

function errorHandlingMiddleware(): import("./types.js").Middleware {
  return async (_req: ApiRequest, next: () => Promise<ApiResponse>) => {
    try {
      return await next();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = isHttpError(err) ? (err as HttpError).status : 500;
      return jsonResponse(status, {
        error: status >= 500 ? "Internal Server Error" : "Bad Request",
        message,
        statusCode: status,
      });
    }
  };
}

function isHttpError(err: unknown): err is HttpError {
  return err instanceof Error && "status" in err && typeof (err as { status: unknown }).status === "number";
}

export function registerApiWithPlugin(
  api: OpenClawApi,
  services: ApiServices,
  config?: ApiServerConfig,
): () => void {
  const server = createApiServer(services, config);

  api.services.register("soloflow.api-server", server);
  api.services.register("soloflow.websocket-server", server.websocket);

  api.rpc.register({
    name: "soloflow.api.handle",
    description: "Handle HTTP API request",
    handler: async (params: Record<string, unknown>) => {
      const req = params as unknown as ApiRequest;
      const response = await server.handle(req);
      return response;
    },
  });

  api.rpc.register({
    name: "soloflow.api.ws-message",
    description: "Handle WebSocket message",
    handler: async (params: Record<string, unknown>) => {
      const wsId = params["wsId"] as string;
      const raw = params["raw"] as string;
      server.handleWsMessage(wsId, raw);
      return { ok: true };
    },
  });

  return () => {
    server.close();
    try { api.rpc.unregister("soloflow.api.handle"); } catch (e) { console.warn(`best effort: ${e}`); }
    try { api.rpc.unregister("soloflow.api.ws-message"); } catch (e) { console.warn(`best effort: ${e}`); }
    try { api.services.unregister("soloflow.api-server"); } catch (e) { console.warn(`best effort: ${e}`); }
    try { api.services.unregister("soloflow.websocket-server"); } catch (e) { console.warn(`best effort: ${e}`); }
  };
}
