import type { Tenant, TenantId, UserId, Role, TenantSettings } from "./types.js";
import { asTenantId } from "./types.js";

const DEFAULT_SETTINGS: TenantSettings = {
  maxWorkflows: 100,
  maxConcurrency: 5,
  retentionDays: 90,
  features: new Set(["workflows", "memory", "skills"]),
};

export class TenantManager {
  private readonly tenants = new Map<TenantId, Tenant>();

  createTenant(name: string, settings?: Partial<TenantSettings>): Tenant {
    const id = asTenantId(crypto.randomUUID());
    const now = Date.now();
    const mergedSettings: TenantSettings = {
      maxWorkflows: settings?.maxWorkflows ?? DEFAULT_SETTINGS.maxWorkflows,
      maxConcurrency: settings?.maxConcurrency ?? DEFAULT_SETTINGS.maxConcurrency,
      retentionDays: settings?.retentionDays ?? DEFAULT_SETTINGS.retentionDays,
      features: settings?.features ?? new Set(DEFAULT_SETTINGS.features),
    };

    const tenant: Tenant = {
      id,
      name,
      members: new Map(),
      createdAt: now,
      updatedAt: now,
      active: true,
      settings: mergedSettings,
    };

    this.tenants.set(id, tenant);
    return tenant;
  }

  getTenant(id: TenantId): Tenant | undefined {
    return this.tenants.get(id);
  }

  listTenants(): Tenant[] {
    return [...this.tenants.values()];
  }

  addUser(tenantId: TenantId, userId: UserId, role: Role): Tenant {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new TenantError(`Tenant ${tenantId as string} not found`);

    const members = new Map(tenant.members);
    members.set(userId, role);

    const updated: Tenant = { ...tenant, members, updatedAt: Date.now() };
    this.tenants.set(tenantId, updated);
    return updated;
  }

  removeUser(tenantId: TenantId, userId: UserId): Tenant {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new TenantError(`Tenant ${tenantId as string} not found`);

    const members = new Map(tenant.members);
    if (!members.has(userId)) throw new TenantError(`User ${userId as string} is not a member`);

    members.delete(userId);

    const updated: Tenant = { ...tenant, members, updatedAt: Date.now() };
    this.tenants.set(tenantId, updated);
    return updated;
  }

  setUserRole(tenantId: TenantId, userId: UserId, role: Role): Tenant {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new TenantError(`Tenant ${tenantId as string} not found`);

    const members = new Map(tenant.members);
    if (!members.has(userId)) throw new TenantError(`User ${userId as string} is not a member`);

    members.set(userId, role);

    const updated: Tenant = { ...tenant, members, updatedAt: Date.now() };
    this.tenants.set(tenantId, updated);
    return updated;
  }

  deactivateTenant(id: TenantId): Tenant {
    const tenant = this.tenants.get(id);
    if (!tenant) throw new TenantError(`Tenant ${id as string} not found`);

    const updated: Tenant = { ...tenant, active: false, updatedAt: Date.now() };
    this.tenants.set(id, updated);
    return updated;
  }

  getUserTenants(userId: UserId): Tenant[] {
    return [...this.tenants.values()].filter(
      (t) => t.active && t.members.has(userId),
    );
  }

  getUserRole(tenantId: TenantId, userId: UserId): Role | undefined {
    return this.tenants.get(tenantId)?.members.get(userId);
  }
}

export class TenantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantError";
  }
}
