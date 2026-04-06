/**
 * SoloFlow — MCP Tool Types
 *
 * JSON-RPC 2.0 compliant types for exposing SoloFlow workflows
 * as MCP (Model Context Protocol) tools consumable by external
 * systems like Zapier, Make.com, n8n, and custom scripts.
 */

import type { WorkflowState } from "../types.js";

// ─── JSON-RPC 2.0 Base ──────────────────────────────────────────────

export interface JSONRPCRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface JSONRPCResponse<T = unknown> {
  jsonrpc: "2.0";
  id?: string | number | null;
  result?: T;
  error?: JSONRPCError;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

// Standard JSON-RPC error codes
export const JSONRPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // SoloFlow-specific codes start at -32000
  WORKFLOW_NOT_FOUND: -32001,
  INVALID_TRANSITION: -32002,
  WORKFLOW_FAILED: -32003,
  TEMPLATE_NOT_FOUND: -32004,
} as const;

// ─── MCP Tool Interface ─────────────────────────────────────────────

/** JSON Schema for tool input validation. */
export interface MCPInputSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

/** A single MCP tool definition with its handler. */
export interface MCPTool {
  /** Unique tool name, e.g. "soloflow_run" */
  name: string;
  /** Human-readable description of what the tool does */
  description: string;
  /** JSON Schema describing the expected input shape */
  inputSchema: MCPInputSchema;
  /** Executes the tool and returns a result */
  handler: (input: unknown) => Promise<unknown>;
}

/** Metadata about a tool returned by listTools (no handler). */
export interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema: MCPInputSchema;
}

// ─── MCP Request / Response ─────────────────────────────────────────

export interface MCPToolRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: "tools/call" | "tools/list";
  params?: {
    name?: string;
    arguments?: unknown;
  };
}

export interface MCPToolResponse {
  jsonrpc: "2.0";
  id?: string | number | null;
  result?: unknown;
  error?: JSONRPCError;
}

// ─── SoloFlow-Specific Types ────────────────────────────────────────

/** Input for soloflow_run: execute a workflow by ID or description. */
export interface SoloFlowRunInput {
  /** Existing workflow ID to execute */
  workflowId?: string;
  /** Natural-language description — creates an ad-hoc workflow if no ID given */
  description?: string;
  /** Template to use when creating from description */
  template?: string;
  /** Variables to inject into the workflow steps */
  variables?: Record<string, unknown>;
}

/** Output from soloflow_run. */
export interface SoloFlowRunOutput {
  workflowId: string;
  state: WorkflowState;
  message: string;
}

/** Input for soloflow_status. */
export interface SoloFlowStatusInput {
  workflowId: string;
}

/** Output from soloflow_status. */
export interface SoloFlowStatusOutput {
  workflowId: string;
  state: WorkflowState;
  steps: Array<{
    id: string;
    name: string;
    state: string;
    durationMs?: number;
    error?: string;
  }>;
  progress: number;
  startedAt?: number;
  updatedAt: number;
}

/** Input for soloflow_list. */
export interface SoloFlowListInput {
  state?: WorkflowState;
  limit?: number;
  offset?: number;
}

/** Output from soloflow_list. */
export interface SoloFlowListOutput {
  workflows: Array<{
    id: string;
    name: string;
    description: string;
    state: WorkflowState;
    stepCount: number;
    createdAt: number;
    updatedAt: number;
  }>;
  total: number;
}

/** Input for soloflow_cancel. */
export interface SoloFlowCancelInput {
  workflowId: string;
  /** Force-cancel from any non-terminal state */
  force?: boolean;
}

/** Output from soloflow_cancel. */
export interface SoloFlowCancelOutput {
  workflowId: string;
  previousState: WorkflowState;
  state: WorkflowState;
  message: string;
}

/** Input for soloflow_create. */
export interface SoloFlowCreateInput {
  /** Name of a registered template, e.g. "research" */
  template: string;
  /** Override the default workflow name */
  name?: string;
  /** Variables to inject */
  variables?: Record<string, unknown>;
  /** Arbitrary metadata to attach */
  metadata?: Record<string, unknown>;
}

/** Output from soloflow_create. */
export interface SoloFlowCreateOutput {
  workflowId: string;
  name: string;
  template: string;
  stepCount: number;
  state: WorkflowState;
}

// ─── SoloFlow-Specific Request / Response ───────────────────────────

export type SoloFlowToolRequest = JSONRPCRequest & {
  method: "tools/call";
  params: {
    name: "soloflow_run" | "soloflow_status" | "soloflow_list" | "soloflow_cancel" | "soloflow_create";
    arguments: unknown;
  };
};

export type SoloFlowToolResponse = JSONRPCResponse<
  SoloFlowRunOutput |
  SoloFlowStatusOutput |
  SoloFlowListOutput |
  SoloFlowCancelOutput |
  SoloFlowCreateOutput
>;
