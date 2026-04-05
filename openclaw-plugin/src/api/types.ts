/**
 * SoloFlow — API Types
 *
 * REST API request/response types, route definitions, middleware interfaces,
 * and WebSocket message types for real-time workflow updates.
 */

import type { WorkflowId, WorkflowState, StepId, StateEvent } from "../types";

// ─── HTTP Method ──────────────────────────────────────────────────────

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

// ─── API Request ──────────────────────────────────────────────────────

export interface ApiRequest {
  method: HttpMethod;
  path: string;
  /** Parsed path parameters (e.g. { id: "abc" } from /workflows/:id) */
  params: Record<string, string>;
  /** Query string parameters */
  query: Record<string, string>;
  /** Parsed JSON body */
  body: unknown;
  /** Request headers (lowercase keys) */
  headers: Record<string, string>;
  /** Authenticated user identity (set by auth middleware) */
  user?: AuthenticatedUser;
}

// ─── API Response ─────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  body: T;
}

// ─── Authenticated User ───────────────────────────────────────────────

export interface AuthenticatedUser {
  id: string;
  scopes: string[];
  type: "jwt" | "api-key";
}

// ─── Route ────────────────────────────────────────────────────────────

export interface Route {
  method: HttpMethod;
  pattern: string;
  handler: RouteHandler;
}

export type RouteHandler = (
  req: ApiRequest,
) => Promise<ApiResponse> | ApiResponse;

// ─── Middleware ────────────────────────────────────────────────────────

export type Middleware = (
  req: ApiRequest,
  next: () => Promise<ApiResponse>,
) => Promise<ApiResponse>;

// ─── Error Response ───────────────────────────────────────────────────

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

// ─── Pagination ───────────────────────────────────────────────────────

export interface PaginationQuery {
  limit?: string;
  offset?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Workflow API DTOs ────────────────────────────────────────────────

export interface CreateWorkflowBody {
  name: string;
  description?: string;
  steps: Array<{
    id: string;
    name: string;
    discipline: string;
    dependencies: string[];
    config: Record<string, unknown>;
  }>;
  metadata?: Record<string, unknown>;
}

export interface UpdateWorkflowBody {
  name?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface ListWorkflowsQuery extends PaginationQuery {
  state?: WorkflowState;
  template?: string;
}

// ─── Execution API DTOs ───────────────────────────────────────────────

export interface ExecutionLogEntry {
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  stepId?: StepId;
  message: string;
  data?: unknown;
}

// ─── Template API DTOs ────────────────────────────────────────────────

export interface CreateTemplateBody {
  name: string;
  key: string;
  description: string;
  steps: Array<{
    id: string;
    name: string;
    discipline: string;
    dependencies: string[];
    config: Record<string, unknown>;
  }>;
}

// ─── WebSocket Message Types ──────────────────────────────────────────

export type WsClientMessage =
  | { type: "subscribe"; workflowId: WorkflowId }
  | { type: "unsubscribe"; workflowId: WorkflowId }
  | { type: "ping" };

export type WsServerMessage =
  | { type: "pong" }
  | { type: "subscribed"; workflowId: WorkflowId }
  | { type: "unsubscribed"; workflowId: WorkflowId }
  | { type: "event"; event: StateEvent }
  | { type: "workflow:progress"; workflowId: WorkflowId; progress: number; runningSteps: StepId[] }
  | { type: "error"; message: string };

export interface WebSocketConnection {
  id: string;
  send: (data: string) => void;
  close: () => void;
  readonly isAlive: boolean;
}

// ─── API Server Services ──────────────────────────────────────────────

export interface ApiServices {
  workflowService: import("../services/workflow-service").WorkflowService;
  scheduler: import("../services/scheduler").Scheduler;
  templateRegistry: import("../services/template-registry").TemplateRegistry;
}
