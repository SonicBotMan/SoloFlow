/**
 * SoloFlow — HTTP Router
 *
 * Pattern-matching router with middleware chain, path parameter extraction,
 * and error handling.
 */

import type { ApiRequest, ApiResponse, ApiError, HttpMethod, Middleware, Route, RouteHandler } from "./types";

export class Router {
  private readonly routes: Route[] = [];
  private readonly middlewares: Middleware[] = [];

  get(pattern: string, handler: RouteHandler): void {
    this.addRoute("GET", pattern, handler);
  }

  post(pattern: string, handler: RouteHandler): void {
    this.addRoute("POST", pattern, handler);
  }

  put(pattern: string, handler: RouteHandler): void {
    this.addRoute("PUT", pattern, handler);
  }

  delete(pattern: string, handler: RouteHandler): void {
    this.addRoute("DELETE", pattern, handler);
  }

  use(middleware: Middleware): void {
    this.middlewares.push(middleware);
  }

  private addRoute(method: HttpMethod, pattern: string, handler: RouteHandler): void {
    this.routes.push({ method, pattern, handler });
  }

  async handle(req: ApiRequest): Promise<ApiResponse> {
    const route = this.matchRoute(req.method, req.path);
    if (!route) {
      return jsonError(404, "Not Found", `No route matches ${req.method} ${req.path}`);
    }

    const dispatch = this.buildMiddlewareChain(route.handler);

    try {
      return await dispatch(req);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = isHttpError(err) ? (err as HttpError).status : 500;
      return jsonError(status, "Internal Server Error", message);
    }
  }

  private matchRoute(method: HttpMethod, path: string): Route & { params: Record<string, string> } | null {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const params = matchPattern(route.pattern, path);
      if (params !== null) {
        return { ...route, params };
      }
    }
    return null;
  }

  private buildMiddlewareChain(finalHandler: RouteHandler): (req: ApiRequest) => Promise<ApiResponse> {
    let chain: (req: ApiRequest) => Promise<ApiResponse> = (req) => Promise.resolve(finalHandler(req));
    for (let i = this.middlewares.length - 1; i >= 0; i--) {
      const mw = this.middlewares[i]!;
      const next = chain;
      chain = (req: ApiRequest) => mw(req, () => next(req));
    }
    return chain;
  }
}

// ─── Path Matching ──────────────────────────────────────────────────────

function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split("/");
  const pathParts = path.split("/");

  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i]!;
    const segment = pathParts[i]!;

    if (pp.startsWith(":")) {
      params[pp.slice(1)] = segment;
    } else if (pp !== segment) {
      return null;
    }
  }

  return params;
}

// ─── Error Helpers ──────────────────────────────────────────────────────

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function isHttpError(err: unknown): err is HttpError {
  return err instanceof HttpError;
}

export function jsonError(status: number, error: string, message: string): ApiResponse<ApiError> {
  return {
    status,
    headers: { "content-type": "application/json" },
    body: { error, message, statusCode: status },
  };
}

export function jsonResponse<T>(status: number, body: T, headers?: Record<string, string>): ApiResponse<T> {
  return {
    status,
    headers: { "content-type": "application/json", ...headers },
    body,
  };
}
