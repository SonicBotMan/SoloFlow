/**
 * SoloFlow — MCP Server Inventory & Usage Tracking
 * Scans registered MCP servers, tracks tool call usage, and links
 * MCP tools to the skills that invoke them.
 */

export interface MCPServer {
  id: string;
  name: string;
  description: string;
  location: string;
  tools: string[];
  enabled: boolean;
  lastSeenAt: number;
  discoveredAt: number;
}

export class MCPInventory {
  private db: any;
  private api: any;

  constructor(db: any, api: any) {
    this.db = db;
    this.api = api;
  }

  /** Scan MCP servers from api.config and update inventory */
  scan(): { added: number; updated: number } {
    const config = (this.api.config ?? {}) as any;
    const mcpServers = config.mcpServers ?? {};
    const now = Date.now();

    let added = 0, updated = 0;

    for (const [serverId, serverConfig] of Object.entries(mcpServers)) {
      const cfg = serverConfig as any;
      const name = cfg.name ?? serverId;
      const location = cfg.command ?? cfg.url ?? serverId;
      const tools: string[] = Array.isArray(cfg.tools)
        ? cfg.tools.map((t: any) => typeof t === "string" ? t : (t.name ?? "unknown"))
        : [];

      // Try to get description from config
      const description = cfg.description ?? `MCP server: ${name}`;

      const existing = this.db.prepare("SELECT id FROM mcp_servers WHERE id=?").get(serverId);
      if (!existing) {
        this.db.prepare(`
          INSERT INTO mcp_servers (id, name, description, location, tools, enabled, last_seen_at, discovered_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(serverId, name, description, location, JSON.stringify(tools), 1, now, now);
        added++;
      } else {
        this.db.prepare(`
          UPDATE mcp_servers SET name=?, description=?, location=?, tools=?, last_seen_at=?
          WHERE id=?
        `).run(name, description, location, JSON.stringify(tools), now, serverId);
        updated++;
      }
    }

    return { added, updated };
  }

  /** Record a tool call against an MCP server */
  recordUsage(serverId: string, toolName: string, success: boolean, durationMs?: number): void {
    try {
      this.db.prepare(`
        INSERT INTO mcp_usage (server_id, tool_name, success, duration_ms, called_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(serverId, toolName, success ? 1 : 0, durationMs ?? null, Date.now());

      // Update last_seen
      this.db.prepare("UPDATE mcp_servers SET last_seen_at=? WHERE id=?").run(Date.now(), serverId);
    } catch { /* non-critical */ }
  }

  /** Get usage stats for an MCP server */
  getUsageStats(serverId: string, days: number = 30): any {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return this.db.prepare(`
      SELECT
        COUNT(*) as total_calls,
        SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) as successes,
        SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as failures,
        AVG(duration_ms) as avg_duration_ms
      FROM mcp_usage
      WHERE server_id = ? AND called_at > ?
    `).get(serverId, since) ?? { total_calls: 0, successes: 0, failures: 0, avg_duration_ms: null };
  }

  /** Get all tool call stats across all servers */
  getToolStats(days: number = 30): any[] {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return this.db.prepare(`
      SELECT server_id, tool_name,
        COUNT(*) as call_count,
        SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) as successes,
        AVG(duration_ms) as avg_duration_ms
      FROM mcp_usage
      WHERE called_at > ?
      GROUP BY server_id, tool_name
      ORDER BY call_count DESC
    `).all(since) as any[];
  }

  /** Get server rankings by usage */
  getServerRankings(days: number = 30): any[] {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return this.db.prepare(`
      SELECT ms.id, ms.name, ms.tools, ms.last_seen_at,
        COUNT(mu.id) as total_calls,
        SUM(CASE WHEN mu.success=1 THEN 1 ELSE 0 END) as successes,
        AVG(mu.duration_ms) as avg_duration_ms
      FROM mcp_servers ms
      LEFT JOIN mcp_usage mu ON ms.id = mu.server_id AND mu.called_at > ?
      GROUP BY ms.id
      ORDER BY total_calls DESC
    `).all(since) as any[];
  }

  /** Get all servers */
  getAll(): MCPServer[] {
    return (this.db.prepare("SELECT * FROM mcp_servers ORDER BY name").all() as any[])
      .map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        location: r.location,
        tools: JSON.parse(r.tools || "[]"),
        enabled: !!r.enabled,
        lastSeenAt: r.last_seen_at,
        discoveredAt: r.discovered_at,
      }));
  }

  /** Auto-detect which MCP server a tool belongs to */
  detectServerForTool(toolName: string): string | null {
    const servers = this.getAll();
    for (const server of servers) {
      if (server.tools.some(t => t.toLowerCase() === toolName.toLowerCase())) {
        return server.id;
      }
    }
    return null;
  }
}
