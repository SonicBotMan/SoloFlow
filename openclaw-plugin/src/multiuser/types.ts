/**
 * SoloFlow Multi-User — Type Definitions
 *
 * Branded IDs, user/tenant models, RBAC roles & permissions.
 */

// ─── Branded ID Types ──────────────────────────────────────────────

export type UserId = string & { readonly __brand: unique symbol };
export type TenantId = string & { readonly __brand: unique symbol };
export type ApiKeyId = string & { readonly __brand: unique symbol };

// ─── Roles ─────────────────────────────────────────────────────────

export const ROLES = ["admin", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number];

// ─── Permissions ───────────────────────────────────────────────────

export const PERMISSIONS = [
  // Workflow
  "workflow.create",
  "workflow.read",
  "workflow.update",
  "workflow.delete",
  "workflow.execute",
  "workflow.cancel",

  // Step
  "step.create",
  "step.read",
  "step.update",
  "step.delete",

  // Memory
  "memory.read",
  "memory.write",
  "memory.delete",

  // Skill
  "skill.read",
  "skill.write",
  "skill.delete",

  // Tenant admin
  "tenant.manage",
  "user.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// ─── Role-Permission Mapping ───────────────────────────────────────

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  editor: [
    "workflow.create",
    "workflow.read",
    "workflow.update",
    "workflow.delete",
    "workflow.execute",
    "workflow.cancel",
    "step.create",
    "step.read",
    "step.update",
    "step.delete",
    "memory.read",
    "memory.write",
    "memory.delete",
    "skill.read",
    "skill.write",
    "skill.delete",
  ],
  viewer: [
    "workflow.read",
    "step.read",
    "memory.read",
    "skill.read",
  ],
} as const;

// ─── User ──────────────────────────────────────────────────────────

export interface User {
  readonly id: UserId;
  readonly name: string;
  readonly email: string;
  readonly tenantId: TenantId;
  readonly role: Role;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly active: boolean;
}

// ─── Tenant ────────────────────────────────────────────────────────

export interface Tenant {
  readonly id: TenantId;
  readonly name: string;
  readonly members: ReadonlyMap<UserId, Role>;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly active: boolean;
  readonly settings: TenantSettings;
}

export interface TenantSettings {
  readonly maxWorkflows: number;
  readonly maxConcurrency: number;
  readonly retentionDays: number;
  readonly features: ReadonlySet<string>;
}

// ─── API Key ───────────────────────────────────────────────────────

export interface ApiKey {
  readonly id: ApiKeyId;
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly keyHash: string;
  readonly createdAt: number;
  readonly expiresAt: number | null;
  readonly active: boolean;
}

// ─── JWT Payload ───────────────────────────────────────────────────

export interface JwtPayload {
  readonly sub: string;       // UserId
  readonly tenant: string;    // TenantId
  readonly role: Role;
  readonly iat: number;
  readonly exp: number;
}

// ─── Namespaced Storage Key ────────────────────────────────────────

export interface NamespacedKey {
  readonly namespace: string;
  readonly key: string;
  readonly full: string;
}

// ─── Auth Config ───────────────────────────────────────────────────

export interface AuthConfig {
  readonly jwtSecret: string;
  readonly jwtIssuer: string;
  readonly jwtExpiresIn: string;
  readonly apiKeyBytes: number;
}

// ─── Helper: branded ID constructors ───────────────────────────────

export function asUserId(id: string): UserId {
  return id as UserId;
}

export function asTenantId(id: string): TenantId {
  return id as TenantId;
}

export function asApiKeyId(id: string): ApiKeyId {
  return id as ApiKeyId;
}
