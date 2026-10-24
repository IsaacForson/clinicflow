import { sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { counters } from "@/db/schema";

const PREFIX: Record<string, string> = { patient: "P", invoice: "INV", receipt: "RCT", claim: "CLM" };

/** Next human-readable number per tenant, e.g. P-000123. Row lock keeps it gap-free under concurrency. */
export async function nextNumber(t: Tx, tenantId: string, key: keyof typeof PREFIX | string): Promise<string> {
  const [row] = await t.insert(counters).values({ tenantId, key, value: 1 })
    .onConflictDoUpdate({ target: [counters.tenantId, counters.key], set: { value: sql`${counters.value} + 1` } })
    .returning({ value: counters.value });
  return `${PREFIX[key] ?? key.toUpperCase()}-${String(row.value).padStart(6, "0")}`;
}
