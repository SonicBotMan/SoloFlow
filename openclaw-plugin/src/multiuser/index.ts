/**
 * SoloFlow Multi-User System — Facade combining auth, tenants, RBAC, and namespaces.
 */

import type { OpenClawApi } from "../types.js";
import type { User, UserId, TenantId, Role, Permission, AuthConfig, TenantSettings } from "./types.js";
import { asUserId } from "./types.js";
import { AuthService, AuthError } from "./auth.js";
import { TenantManager } from "./tenant.js";
import { RBACService } from "./rbac.js";
import { NamespaceManager } from "./namespace.js";

export class MultiUserSystem {
  readonly auth: AuthService;
  readonly tenants: TenantManager;
  readonly rbac: RBACService;
  readonly namespaces: NamespaceManager;

  constructor(config?: Partial<AuthConfig>) {
    this.auth = new AuthService(config);
    this.tenants = new TenantManager();
    this.rbac = new RBACService();
    this.namespaces = new NamespaceManager();
  }

  async createUser(params: {
    name: string;
    email: string;
    tenantName: string;
    role?: Role;
    tenantSettings?: Partial<TenantSettings>;
  }): Promise<{ user: User; token: string }> {
    const tenant = this.tenants.createTenant(params.tenantName, params.tenantSettings);
    const userId = asUserId(crypto.randomUUID());
    const now = Date.now();
    const role = params.role ?? "admin";

    const user: User = {
      id: userId,
      name: params.name,
      email: params.email,
      tenantId: tenant.id,
      role,
      createdAt: now,
      updatedAt: now,
      active: true,
    };

    this.tenants.addUser(tenant.id, userId, role);
    this.auth.upsertUser(user);

    const token = await this.auth.createToken(user);

    return { user, token };
  }

  async addTeamMember(
    adminUserId: UserId,
    tenantId: TenantId,
    params: { name: string; email: string; role: Role },
  ): Promise<{ user: User; token: string }> {
    const admin = this.auth.getUser(adminUserId);
    if (!admin) throw new AuthError("Admin user not found");

    this.rbac.requirePermission(admin, "user.manage");

    const userId = asUserId(crypto.randomUUID());
    const now = Date.now();

    const user: User = {
      id: userId,
      name: params.name,
      email: params.email,
      tenantId,
      role: params.role,
      createdAt: now,
      updatedAt: now,
      active: true,
    };

    this.tenants.addUser(tenantId, userId, params.role);
    this.auth.upsertUser(user);

    const token = await this.auth.createToken(user);
    return { user, token };
  }

  async authenticateRequest(token: string): Promise<User> {
    return this.auth.authenticate(token);
  }

  async authenticateApiKey(key: string): Promise<User> {
    return this.auth.validateApiKey(key);
  }

  async generateApiKey(userId: UserId, name: string, expiresInDays?: number) {
    const user = this.auth.getUser(userId);
    if (!user) throw new AuthError("User not found");
    return this.auth.generateApiKey(user, name, expiresInDays);
  }

  checkPermission(user: User, permission: Permission): boolean {
    return this.rbac.checkPermission(user, permission);
  }

  requirePermission(user: User, permission: Permission): void {
    this.rbac.requirePermission(user, permission);
  }

  initialize(api: OpenClawApi): () => void {
    api.services.register("soloflow.multiuser-auth", this.auth);
    api.services.register("soloflow.multiuser-tenants", this.tenants);
    api.services.register("soloflow.multiuser-rbac", this.rbac);
    api.services.register("soloflow.multiuser-namespaces", this.namespaces);
    api.services.register("soloflow.multiuser", this);

    api.rpc.register({
      name: "soloflow.multiuser.authenticate",
      description: "Authenticate a JWT token and return user info",
      handler: async (params) => {
        const user = await this.authenticateRequest(params["token"] as string);
        return { userId: user.id, tenantId: user.tenantId, role: user.role };
      },
    });

    api.rpc.register({
      name: "soloflow.multiuser.apiKey",
      description: "Authenticate an API key and return user info",
      handler: async (params) => {
        const user = await this.authenticateApiKey(params["key"] as string);
        return { userId: user.id, tenantId: user.tenantId, role: user.role };
      },
    });

    api.rpc.register({
      name: "soloflow.multiuser.createApiKey",
      description: "Generate a new API key for a user",
      handler: async (params) => {
        const userId = asUserId(params["userId"] as string);
        const name = params["name"] as string;
        const expiresInDays = params["expiresInDays"] as number | undefined;
        const result = await this.generateApiKey(userId, name, expiresInDays);
        return { id: result.id, key: result.key };
      },
    });

    api.rpc.register({
      name: "soloflow.multiuser.checkPermission",
      description: "Check if a user has a specific permission",
      handler: async (params) => {
        const userId = asUserId(params["userId"] as string);
        const permission = params["permission"] as Permission;
        const user = this.auth.getUser(userId);
        if (!user) return { allowed: false };
        return { allowed: this.checkPermission(user, permission) };
      },
    });

    api.logger.info("[soloflow] multi-user system initialized");

    return () => {
      const serviceNames = [
        "soloflow.multiuser",
        "soloflow.multiuser-auth",
        "soloflow.multiuser-tenants",
        "soloflow.multiuser-rbac",
        "soloflow.multiuser-namespaces",
      ];
      for (const name of serviceNames) {
        try { api.services.unregister(name); } catch { /* best effort */ }
      }

      const rpcNames = [
        "soloflow.multiuser.authenticate",
        "soloflow.multiuser.apiKey",
        "soloflow.multiuser.createApiKey",
        "soloflow.multiuser.checkPermission",
      ];
      for (const name of rpcNames) {
        try { api.rpc.unregister(name); } catch { /* best effort */ }
      }
    };
  }
}

export { AuthService, AuthError } from "./auth.js";
export { TenantManager, TenantError } from "./tenant.js";
export { RBACService, PermissionError } from "./rbac.js";
export { NamespaceManager } from "./namespace.js";
export type {
  User, UserId, Tenant, TenantId, Role, Permission,
  AuthConfig, JwtPayload, ApiKey, NamespacedKey, TenantSettings,
} from "./types.js";
