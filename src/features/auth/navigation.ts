import type { UserRole } from "@/lib/auth";

export type NavigationModes = { counter_enabled: boolean; uses_waiter: boolean; dine_in_qr_enabled: boolean };
export type Destination = { id: string; label: string; href: string };
export type NavigationGroup = { label: string; destinations: Destination[] };
const destination = (id: string, label: string, href: string): Destination => ({ id, label, href });

// Presentation only. Existing route guards, requireStaff and RLS remain authoritative.
export function operationDestinations(role: UserRole, modes: NavigationModes | null, pathname = ""): Destination[] {
  if (role === "supervisor") return [destination("approvals", "Aprovações", "/supervisor")];
  if (role === "kitchen") return [destination("kitchen", "Cozinha", "/kitchen")];
  if (role === "waiter") return modes?.uses_waiter ? [destination("tables", "Mesas", "/waiter"), destination("orders", "Pedidos", "/orders")] : [];
  const entries: Destination[] = [];
  if (modes?.counter_enabled) entries.push(destination("counter", "Balcão", "/cashier/counter"), destination("ready", "Prontos", `${pathname === "/cashier/counter" ? pathname : "/cashier"}#cashier-ready`));
  if (modes?.dine_in_qr_enabled) entries.push(destination("tables", "Mesas", "/cashier#cashier-tables"), destination("qr", "Confirmar QR", "/cashier#cashier-qr"));
  entries.push(destination("orders", "Pedidos", "/orders"));
  if (role === "admin") entries.push(destination("kitchen", "Cozinha", "/kitchen"));
  return entries;
}

export function isCurrentDestination(entry: Destination, pathname: string, hash: string) {
  const [path, anchor = ""] = entry.href.split("#");
  if (anchor) return pathname === path && hash === `#${anchor}`;
  if (entry.id === "overview") return pathname === path;
  return (pathname === path || pathname.startsWith(`${path}/`)) && !hash;
}

// Display projection only; PostgreSQL still owns session/order business dates.
export function displayBusinessDate(now: number, timezone: string, cutoff: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now).map(part => [part.type, part.value]));
  const previous = `${parts.hour}:${parts.minute}:${parts.second}` < (cutoff.length === 5 ? `${cutoff}:00` : cutoff);
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day - Number(previous))).toISOString().slice(0, 10);
}
