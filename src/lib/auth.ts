import type { Enums } from "@/types/database.types";

export type UserRole = Enums<"user_role">;

export const ROLE_DASHBOARDS: Record<UserRole, string> = {
  admin: "/admin",
  supervisor: "/supervisor",
  waiter: "/waiter",
  kitchen: "/kitchen",
  cashier: "/cashier",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  waiter: "Garçom",
  kitchen: "Cozinha",
  cashier: "Caixa",
};

const STAFF_ROUTE_ACCESS: Array<{
  prefix: string;
  roles: UserRole[];
}> = [
  { prefix: "/waiter", roles: ["waiter"] },
  { prefix: "/kitchen", roles: ["kitchen"] },
  { prefix: "/cashier", roles: ["cashier"] },
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/supervisor", roles: ["admin", "supervisor"] },
  { prefix: "/orders", roles: ["admin", "cashier", "waiter"] },
];

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function getAllowedRoles(pathname: string) {
  return STAFF_ROUTE_ACCESS.find(({ prefix }) =>
    matchesPrefix(pathname, prefix),
  )?.roles;
}

export function isStaffRoute(pathname: string) {
  return getAllowedRoles(pathname) !== undefined;
}
