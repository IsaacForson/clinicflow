import { and, eq, ne, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { branches, users, type Tenant } from "@/db/schema";
import { UserError } from "@/lib/action";
import { PLANS, type PlanKey } from "@/lib/plans";

export type Seats = { users: number; practitioners: number; branches: number; scribe: number };

/** Why `next` doesn't fit the plan (and scribe seats), or null if it does. */
export function limitError(plan: PlanKey, scribeSeats: number, next: Seats): string | null {
  const p = PLANS[plan];
  if (next.users > p.users) return `The ${p.name} plan allows ${p.users} active staff accounts. Deactivate someone or upgrade.`;
  if (next.practitioners > p.practitioners) return `The ${p.name} plan allows ${p.practitioners} practitioner${p.practitioners === 1 ? "" : "s"}. Upgrade to add more.`;
  if (next.branches > p.branches) return `The ${p.name} plan allows ${p.branches} branch${p.branches === 1 ? "" : "es"}. Upgrade to Group for more.`;
  if (next.scribe > scribeSeats) return `You have ${scribeSeats} AI scribe seat${scribeSeats === 1 ? "" : "s"}. Add seats under Subscription.`;
  return null;
}

/** Current active seats, optionally ignoring one user (the one being edited). */
export async function currentSeats(t: Tx, tenantId: string, exceptUserId?: string): Promise<Seats> {
  const [u] = await t.select({
    users: sql<number>`count(*)::int`,
    practitioners: sql<number>`count(*) filter (where ${users.isPractitioner})::int`,
    scribe: sql<number>`count(*) filter (where ${users.scribeEnabled})::int`,
  }).from(users).where(and(eq(users.tenantId, tenantId), eq(users.active, true), exceptUserId ? ne(users.id, exceptUserId) : undefined));
  const [b] = await t.select({ n: sql<number>`count(*)::int` }).from(branches).where(and(eq(branches.tenantId, tenantId), eq(branches.active, true)));
  return { ...u, branches: b.n };
}

/** Throws UserError if adding `add` to current seats exceeds the tenant's plan. */
export async function assertSeats(t: Tx, tenant: Pick<Tenant, "id" | "plan" | "scribeSeats">, add: Partial<Seats>, exceptUserId?: string) {
  const cur = await currentSeats(t, tenant.id, exceptUserId);
  const next = { users: cur.users + (add.users ?? 0), practitioners: cur.practitioners + (add.practitioners ?? 0), branches: cur.branches + (add.branches ?? 0), scribe: cur.scribe + (add.scribe ?? 0) };
  // Only complain about the dimension that grows, so an over-limit account can still edit unrelated things.
  const grown = Object.fromEntries(Object.entries(next).map(([k, v]) => [k, (add[k as keyof Seats] ?? 0) > 0 ? v : 0])) as Seats;
  const err = limitError(tenant.plan, tenant.scribeSeats, grown);
  if (err) throw new UserError(err);
}
