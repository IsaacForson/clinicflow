"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { claims, insurers, insurerTariffs, services } from "@/db/schema";
import { formObject, run, UserError, zInt, zMoney, type ActionState } from "@/lib/action";
import { audit, tx } from "@/lib/auth";
import { buildClaim, deleteDraftClaim, settleClaimItem } from "@/lib/billing/claims";
import { dayRange } from "@/lib/format";
import { requireInsuranceWrite } from "./guard";

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function saveInsurerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireInsuranceWrite();
    const o = z.object({
      id: uuid.optional(), name: z.string().min(1).max(120), code: z.string().max(40).optional(), contactName: z.string().max(120).optional(),
      phone: z.string().max(40).optional(), email: z.string().email().optional(), claimEmail: z.string().email().optional(),
      coveragePercent: zInt.min(0).max(100).default(100), active: z.string().optional(),
    }).parse(formObject(fd));
    const row = {
      name: o.name, code: o.code ?? null, contactName: o.contactName ?? null, phone: o.phone ?? null, email: o.email ?? null,
      claimEmail: o.claimEmail ?? null, coveragePercent: o.coveragePercent, active: o.id ? o.active === "on" : true,
    };
    const id = await tx(ctx, async (t) => {
      if (o.id) {
        await t.update(insurers).set(row).where(eq(insurers.id, o.id));
        await audit(t, ctx, "update", "insurer", o.id);
        return o.id;
      }
      const [i] = await t.insert(insurers).values({ ...row, tenantId: ctx.tenant.id }).returning({ id: insurers.id });
      await audit(t, ctx, "create", "insurer", i.id);
      return i.id;
    });
    revalidatePath("/insurance");
    return { ok: true, id, message: "Saved" };
  });
}

/** Tariff grid: fields price_<serviceId> (blank = use clinic price) and covered_<serviceId>. */
export async function saveTariffAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireInsuranceWrite();
    const insurerId = uuid.parse(fd.get("insurerId"));
    const f = formObject(fd);
    await tx(ctx, async (t) => {
      const svcs = await t.select({ id: services.id, price: services.priceMinor }).from(services);
      for (const s of svcs) {
        if (!(`row_${s.id}` in f)) continue;
        const price = f[`price_${s.id}`] ? zMoney.parse(f[`price_${s.id}`]) : s.price;
        const covered = f[`covered_${s.id}`] === "on";
        await t.insert(insurerTariffs).values({ tenantId: ctx.tenant.id, insurerId, serviceId: s.id, priceMinor: price, covered })
          .onConflictDoUpdate({ target: [insurerTariffs.insurerId, insurerTariffs.serviceId], set: { priceMinor: price, covered } });
      }
      await audit(t, ctx, "update", "insurer_tariff", insurerId);
    });
    revalidatePath(`/insurance/insurers/${insurerId}`);
    return { ok: true, message: "Tariff saved" };
  });
}

export async function createClaimAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireInsuranceWrite();
    const o = z.object({ insurerId: uuid, periodStart: day, periodEnd: day }).parse(formObject(fd));
    if (o.periodEnd < o.periodStart) throw new UserError("End date is before start date");
    const tz = ctx.tenant.timezone;
    const claim = await tx(ctx, async (t) => {
      const c = await buildClaim(t, ctx, { ...o, start: dayRange(o.periodStart, tz).start, end: dayRange(o.periodEnd, tz).end });
      await audit(t, ctx, "create", "claim", c.id, { details: { batchNo: c.batchNo, totalClaimedMinor: c.totalClaimedMinor } });
      return c;
    });
    revalidatePath("/insurance");
    return { ok: true, id: claim.id };
  });
}

export async function submitClaimAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireInsuranceWrite();
    const id = uuid.parse(fd.get("claimId"));
    await tx(ctx, async (t) => {
      const [c] = await t.update(claims).set({ status: "submitted", submittedAt: new Date() }).where(and(eq(claims.id, id), eq(claims.status, "draft"))).returning();
      if (!c) throw new UserError("Only draft claims can be submitted");
      await audit(t, ctx, "submit", "claim", id);
    });
    revalidatePath(`/insurance/claims/${id}`);
  });
}

export async function deleteClaimAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireInsuranceWrite();
    const id = uuid.parse(fd.get("claimId"));
    await tx(ctx, async (t) => {
      await deleteDraftClaim(t, id);
      await audit(t, ctx, "delete", "claim", id);
    });
    revalidatePath("/insurance");
    return { ok: true, id: "" };
  });
}

export async function settleClaimItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireInsuranceWrite();
    const o = z.object({
      claimId: uuid, itemId: uuid, outcome: z.enum(["paid", "partially_paid", "rejected"]), amount: zMoney.optional(),
      reason: z.string().max(300).optional(), clientId: z.string().min(8),
    }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      const [c] = await t.select({ status: claims.status }).from(claims).where(eq(claims.id, o.claimId));
      if (c?.status === "draft") throw new UserError("Mark the claim as submitted first");
      await settleClaimItem(t, ctx, { itemId: o.itemId, outcome: o.outcome, amountMinor: o.amount, reason: o.reason, clientId: o.clientId });
      await audit(t, ctx, "settle", "claim_item", o.itemId, { details: { outcome: o.outcome, amountMinor: o.amount } });
    });
    revalidatePath(`/insurance/claims/${o.claimId}`);
  });
}
