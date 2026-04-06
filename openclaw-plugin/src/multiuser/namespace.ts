import type { UserId, TenantId, NamespacedKey } from "./types.js";

const NAMESPACE_SEPARATOR = ":";

export class NamespaceManager {
  private readonly prefix: string;

  constructor(prefix = "sf") {
    this.prefix = prefix;
  }

  getUserNamespace(userId: UserId): string {
    return `${this.prefix}${NAMESPACE_SEPARATOR}user${NAMESPACE_SEPARATOR}${userId as string}`;
  }

  getTenantNamespace(tenantId: TenantId): string {
    return `${this.prefix}${NAMESPACE_SEPARATOR}tenant${NAMESPACE_SEPARATOR}${tenantId as string}`;
  }

  forUser(userId: UserId, collection: string, key: string): NamespacedKey {
    const namespace = this.getUserNamespace(userId);
    const full = `${namespace}${NAMESPACE_SEPARATOR}${collection}${NAMESPACE_SEPARATOR}${key}`;
    return { namespace, key, full };
  }

  forTenant(tenantId: TenantId, collection: string, key: string): NamespacedKey {
    const namespace = this.getTenantNamespace(tenantId);
    const full = `${namespace}${NAMESPACE_SEPARATOR}${collection}${NAMESPACE_SEPARATOR}${key}`;
    return { namespace, key, full };
  }

  forWorkflow(userId: UserId, workflowId: string): NamespacedKey {
    return this.forUser(userId, "workflows", workflowId);
  }

  forMemory(userId: UserId, memoryType: string, key: string): NamespacedKey {
    return this.forUser(userId, `memory:${memoryType}`, key);
  }

  forSkill(userId: UserId, skillId: string): NamespacedKey {
    return this.forUser(userId, "skills", skillId);
  }

  listKeysPattern(namespace: string, collection: string): string {
    return `${namespace}${NAMESPACE_SEPARATOR}${collection}${NAMESPACE_SEPARATOR}*`;
  }

  extractId(namespacedKey: string): string | null {
    const parts = namespacedKey.split(NAMESPACE_SEPARATOR);
    return parts.at(-1) ?? null;
  }
}
