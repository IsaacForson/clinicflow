import { AuthError, audit, getCtx, tx } from "@/lib/auth";
import { UserError } from "@/lib/action";
import { recordPayment } from "@/lib/billing";
import { can } from "@/lib/permissions";
import { applyVisitNote } from "@/lib/visits";
import { OP_PERMISSION, syncBody, type OpResult } from "./ops";

/**
 * Replays the offline outbox in order. Each op runs in its own transaction so one refusal doesn't undo the rest.
 * Server wins: notes merge via applyVisitNote, payments are idempotent on clientId and invoice totals are recomputed here.
 */
export async function POST(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return Response.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  const parsed = syncBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid sync request", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });

  const results: OpResult[] = [];
  let halted = false;
  for (const op of parsed.data.ops) {
    // Keep order: once something fails transiently, later ops wait for the next sync.
    if (halted) { results.push({ id: op.id, status: "retry" }); continue; }
    // Clinical/billing changes must be attributed to whoever made them on a shared device.
    if (op.userId !== ctx.user.id) { results.push({ id: op.id, status: "retry", error: "Saved by another user; syncs when they sign in." }); continue; }
    if (!can(ctx.user.role, OP_PERMISSION[op.type])) { results.push({ id: op.id, status: "rejected", error: "You don't have permission to do that." }); continue; }
    if (ctx.access === "read_only") { results.push({ id: op.id, status: "rejected", error: "This account is read-only until the subscription is renewed." }); continue; }
    try {
      if (op.type === "visit.note") {
        const v = await tx(ctx, (t) => applyVisitNote(t, ctx, { visitId: op.visitId, baseVersion: op.baseVersion, note: op.note }));
        results.push({ id: op.id, status: "saved", version: v.version });
      } else {
        await tx(ctx, async (t) => {
          const p = await recordPayment(t, ctx, {
            clientId: op.clientId, invoiceId: op.invoiceId, patientId: op.patientId, amountMinor: op.amountMinor, method: op.method, reference: op.reference ?? null,
          });
          await audit(t, ctx, "create", "payment", p.id, { patientId: op.patientId, details: { offline: true, clientId: op.clientId } });
        });
        results.push({ id: op.id, status: "saved" });
      }
    } catch (e) {
      if (e instanceof UserError || e instanceof AuthError) results.push({ id: op.id, status: "rejected", error: e.message });
      else { console.error("offline sync", e); halted = true; results.push({ id: op.id, status: "retry" }); }
    }
  }
  return Response.json({ results });
}
