import type { OpenClawApi, WorkflowId } from "../types";
import type { MCPToolRequest, MCPToolResponse } from "./types";
import { MCPServer } from "./server";
import { SoloFlowMCPTools, type SoloFlowMCPToolServices } from "./soloflow-tools";
import { WorkflowService } from "../services/workflow-service";
import { Scheduler } from "../services/scheduler";
import { TemplateRegistry } from "../services/template-registry";

export interface MCPServerServices {
  workflowService: WorkflowService;
  scheduler: Scheduler;
  templateRegistry: TemplateRegistry;
  api?: OpenClawApi;
}

export function createMCPServer(services: MCPServerServices): {
  server: MCPServer;
  handleRequest: (request: MCPToolRequest) => Promise<MCPToolResponse>;
  registerWithOpenClaw: (api: OpenClawApi) => () => void;
} {
  const executeWorkflow = services.api
    ? async (workflowId: WorkflowId) => services.scheduler.execute(workflowId, services.api!)
    : undefined;

  const toolServices: SoloFlowMCPToolServices = {
    workflowService: services.workflowService,
    scheduler: services.scheduler,
    templateRegistry: services.templateRegistry,
    executeWorkflow,
  };

  const soloflowTools = new SoloFlowMCPTools(toolServices);
  const server = new MCPServer();
  server.registerTools(soloflowTools.getTools());

  function registerWithOpenClaw(api: OpenClawApi): () => void {
    const rpcMethods = [
      {
        name: "mcp.list_tools",
        description: "List all available MCP tools",
        handler: async () => ({ tools: server.listTools() }),
      },
      {
        name: "mcp.call_tool",
        description: "Call an MCP tool by name",
        handler: async (params: Record<string, unknown>) => {
          const { name, arguments: args } = params as { name: string; arguments?: unknown };
          return server.callTool(name, args);
        },
      },
      {
        name: "mcp.handle_request",
        description: "Handle a raw MCP JSON-RPC request",
        handler: async (params: Record<string, unknown>) => {
          const request = params as unknown as MCPToolRequest;
          return server.handleRequest(request);
        },
      },
    ];

    for (const method of rpcMethods) {
      api.rpc.register(method);
    }

    api.services.register("soloflow.mcp-server", server);

    const registeredRpcNames = rpcMethods.map((m) => m.name);

    return () => {
      for (const name of registeredRpcNames) {
        try { api.rpc.unregister(name); } catch { /* best effort */ }
      }
      try { api.services.unregister("soloflow.mcp-server"); } catch { /* best effort */ }
    };
  }

  return {
    server,
    handleRequest: (request) => server.handleRequest(request),
    registerWithOpenClaw,
  };
}

export { MCPServer } from "./server";
export { SoloFlowMCPTools } from "./soloflow-tools";
export type { SoloFlowMCPToolServices } from "./soloflow-tools";
