/**
 * SoloFlow — WebSocket Server
 *
 * Real-time workflow event streaming over WebSocket connections.
 * Supports per-workflow subscriptions, heartbeat, and broadcast.
 */

import type { WorkflowId, StateEvent } from "../types";
import type { WebSocketConnection, WsClientMessage, WsServerMessage } from "./types";

export class WebSocketServer {
  private readonly connections = new Map<string, WebSocketConnection>();
  private readonly subscriptions = new Map<WorkflowId, Set<string>>();
  private eventListener: (() => void) | null = null;
  private nextId = 0;

  constructor(private readonly workflowService: import("../services/workflow-service").WorkflowService) {}

  init(): void {
    this.eventListener = this.workflowService.subscribe((event: StateEvent) => {
      const workflowId = (event as { workflowId?: WorkflowId }).workflowId;
      if (!workflowId) return;

      const message: WsServerMessage = { type: "event", event };
      this.broadcastToWorkflow(workflowId, message);
    });
  }

  destroy(): void {
    if (this.eventListener) {
      this.eventListener();
      this.eventListener = null;
    }
    for (const conn of this.connections.values()) {
      conn.close();
    }
    this.connections.clear();
    this.subscriptions.clear();
  }

  handleConnection(ws: WebSocketConnection): void {
    this.connections.set(ws.id, ws);

    this.sendTo(ws.id, { type: "pong" });

    ws.close = ws.close.bind(ws);
    const originalClose = ws.close;
    ws.close = () => {
      this.removeAllSubscriptions(ws.id);
      this.connections.delete(ws.id);
      originalClose();
    };
  }

  broadcast(event: string, data: unknown): void {
    const message = JSON.stringify({ type: event, data } as WsServerMessage);
    for (const conn of this.connections.values()) {
      if (conn.isAlive) {
        conn.send(message);
      }
    }
  }

  subscribe(workflowId: WorkflowId, wsId: string): void {
    if (!this.subscriptions.has(workflowId)) {
      this.subscriptions.set(workflowId, new Set());
    }
    this.subscriptions.get(workflowId)!.add(wsId);
    this.sendTo(wsId, { type: "subscribed", workflowId });
  }

  unsubscribe(workflowId: WorkflowId, wsId: string): void {
    const subs = this.subscriptions.get(workflowId);
    if (subs) {
      subs.delete(wsId);
      if (subs.size === 0) {
        this.subscriptions.delete(workflowId);
      }
    }
    this.sendTo(wsId, { type: "unsubscribed", workflowId });
  }

  handleMessage(wsId: string, raw: string): void {
    let msg: WsClientMessage;
    try {
      msg = JSON.parse(raw) as WsClientMessage;
    } catch {
      this.sendTo(wsId, { type: "error", message: "Invalid JSON" });
      return;
    }

    switch (msg.type) {
      case "subscribe":
        this.subscribe(msg.workflowId, wsId);
        break;
      case "unsubscribe":
        this.unsubscribe(msg.workflowId, wsId);
        break;
      case "ping":
        this.sendTo(wsId, { type: "pong" });
        break;
      default:
        this.sendTo(wsId, { type: "error", message: `Unknown message type: ${(msg as { type: string }).type}` });
    }
  }

  get connectionCount(): number {
    return this.connections.size;
  }

  get subscriptionCount(): number {
    return this.subscriptions.size;
  }

  generateConnectionId(): string {
    return `ws-${++this.nextId}`;
  }

  private sendTo(wsId: string, message: WsServerMessage): void {
    const conn = this.connections.get(wsId);
    if (conn?.isAlive) {
      conn.send(JSON.stringify(message));
    }
  }

  private broadcastToWorkflow(workflowId: WorkflowId, message: WsServerMessage): void {
    const subs = this.subscriptions.get(workflowId);
    if (!subs) return;

    const data = JSON.stringify(message);
    for (const wsId of subs) {
      const conn = this.connections.get(wsId);
      if (conn?.isAlive) {
        conn.send(data);
      }
    }
  }

  private removeAllSubscriptions(wsId: string): void {
    for (const [workflowId, subs] of this.subscriptions) {
      subs.delete(wsId);
      if (subs.size === 0) {
        this.subscriptions.delete(workflowId);
      }
    }
  }
}
