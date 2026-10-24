import "server-only";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { users } from "@/db/schema";
import type { Ctx } from "@/lib/auth";

/** Active practitioners who work at the current branch. */
export const branchPractitioners = (t: Tx, ctx: Ctx) =>
  t.select({ id: users.id, name: users.name, title: users.title }).from(users).where(and(
    eq(users.isPractitioner, true), eq(users.active, true),
    or(isNull(users.branchIds), sql`${ctx.branchId}::uuid = any(${users.branchIds})`),
  )).orderBy(users.name);
