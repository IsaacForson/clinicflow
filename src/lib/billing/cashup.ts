import { and, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { payments } from "@/db/schema";

type Row = { method: (typeof payments.$inferSelect)["method"]; total: number; n: number };

/**
 * Money movements for a branch day. Payments count on the day they were received (even if later refunded),
 * refunds count on the day they were given back, so past cash-ups never change.
 */
export async function dayMoney(t: Tx, o: { branchId: string; start: Date; end: Date; cashier?: string | null }) {
  const range = (col: typeof payments.receivedAt | typeof payments.refundedAt) => sql`${col} >= ${o.start.toISOString()} and ${col} < ${o.end.toISOString()}`;
  const received: Row[] = await t.select({ method: payments.method, total: sql<number>`sum(${payments.amountMinor})::int`, n: sql<number>`count(*)::int` })
    .from(payments).where(and(eq(payments.branchId, o.branchId), inArray(payments.status, ["succeeded", "refunded"]), range(payments.receivedAt),
      o.cashier ? eq(payments.receivedBy, o.cashier) : undefined)).groupBy(payments.method);
  const refunded: Row[] = await t.select({ method: payments.method, total: sql<number>`sum(${payments.amountMinor})::int`, n: sql<number>`count(*)::int` })
    .from(payments).where(and(eq(payments.branchId, o.branchId), eq(payments.status, "refunded"), range(payments.refundedAt),
      o.cashier ? eq(payments.refundedBy, o.cashier) : undefined)).groupBy(payments.method);
  const sum = (rows: Row[], m: string) => rows.find((r) => r.method === m)?.total ?? 0;
  return { received, refunded, cashIn: sum(received, "cash"), cashRefunded: sum(refunded, "cash") };
}
