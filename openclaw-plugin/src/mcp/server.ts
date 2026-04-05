import type {
  JSONRPCResponse,
  MCPTool,
  MCPToolInfo,
  MCPToolRequest,
  MCPToolResponse,
} from "./types";
import { JSONRPC_ERROR_CODES } from "./types";

export class MCPServer {
  private readonly tools = new Map<string, MCPTool>();

  registerTools(tools: MCPTool[]): void {
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  unregisterTool(name: string): void {
    this.tools.delete(name);
  }

  listTools(): MCPToolInfo[] {
    return Array.from(this.tools.values()).map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    }));
  }

  async callTool(name: string, input: unknown): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw { code: JSONRPC_ERROR_CODES.METHOD_NOT_FOUND, message: `Tool not found: ${name}` };
    }
    return tool.handler(input);
  }

  async handleRequest(request: MCPToolRequest): Promise<MCPToolResponse> {
    const id = request.id ?? null;
    const base: JSONRPCResponse = { jsonrpc: "2.0", id };

    if (request.method === "tools/list") {
      return { ...base, result: { tools: this.listTools() } };
    }

    if (request.method === "tools/call") {
      const toolName = request.params?.name;
      if (!toolName || typeof toolName !== "string") {
        return { ...base, error: { code: JSONRPC_ERROR_CODES.INVALID_PARAMS, message: "Missing tool name" } };
      }

      try {
        const result = await this.callTool(toolName, request.params?.arguments);
        return { ...base, result };
      } catch (err: unknown) {
        const error = err as { code?: number; message?: string } | undefined;
        return {
          ...base,
          error: {
            code: error?.code ?? JSONRPC_ERROR_CODES.INTERNAL_ERROR,
            message: error?.message ?? (err instanceof Error ? err.message : "Internal error"),
          },
        };
      }
    }

    return { ...base, error: { code: JSONRPC_ERROR_CODES.METHOD_NOT_FOUND, message: `Unknown method: ${request.method}` } };
  }
}
