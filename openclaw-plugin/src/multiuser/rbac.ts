import type { User, Permission, Role } from "./types.js";
import { ROLE_PERMISSIONS } from "./types.js";

export class RBACService {
  checkPermission(user: User, permission: Permission): boolean {
    if (!user.active) return false;
    return ROLE_PERMISSIONS[user.role].includes(permission);
  }

  checkPermissions(user: User, permissions: Permission[]): boolean {
    if (!user.active) return false;
    const allowed = ROLE_PERMISSIONS[user.role];
    return permissions.every((p) => allowed.includes(p));
  }

  checkAnyPermission(user: User, permissions: Permission[]): boolean {
    if (!user.active) return false;
    const allowed = ROLE_PERMISSIONS[user.role];
    return permissions.some((p) => allowed.includes(p));
  }

  getRolePermissions(role: Role): readonly Permission[] {
    return ROLE_PERMISSIONS[role];
  }

  filterByPermission(users: User[], permission: Permission): User[] {
    return users.filter((u) => this.checkPermission(u, permission));
  }

  requirePermission(user: User, permission: Permission): void {
    if (!this.checkPermission(user, permission)) {
      throw new PermissionError(permission, user.role);
    }
  }
}

export class PermissionError extends Error {
  readonly permission: Permission;
  readonly role: Role;

  constructor(permission: Permission, role: Role) {
    super(`Role '${role}' does not have permission '${permission}'`);
    this.name = "PermissionError";
    this.permission = permission;
    this.role = role;
  }
}
