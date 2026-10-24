"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formObject, run, UserError, type ActionState } from "@/lib/action";
import { AuthError, getCtx, tx } from "@/lib/auth";
import { initializePayment } from "@/lib/paystack";
import { can } from "@/lib/permissions";
import { currentSeats, limitError } from "../limits";
import { clinicBilling } from "@/lib/currency";
import { subscriptionTotal } from "@/lib/money";
import { MIGRATION_TIERS } from "./pricing";

// Not requireWrite: a read-only (unpaid) account must still be able to pay.
async function billingCtx() {
  const ctx = await getCtx();
  if (!ctx) throw new AuthError("Your session has expired. Please sign in again.");
  if (ctx.impersonatedBy) throw new AuthError("Support view is read-only.");
  if (!can(ctx.user.role, "subscription.manage")) throw new AuthError("You don't have permission to do that.");
  const email = ctx.user.email ?? ctx.tenant.email;
  if (!email) throw new UserError("Add an email address to your account or clinic profile first — Paystack sends the receipt there.");
  return { ctx, email };
}

const callbackUrl = () => (process.env.APP_URL ? `${process.env.APP_URL}/settings/subscription?paid=1` : undefined);

export async function checkoutAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { ctx, email } = await billingCtx();
    const o = z.object({ plan: z.enum(["solo", "clinic", "group"]), cycle: z.enum(["monthly", "annual"]), scribeSeats: z.coerce.number().int().min(0).max(15).default(0) }).parse(formObject(fd));
    const seats = await tx(ctx, (t) => currentSeats(t, ctx.tenant.id));
    const err = limitError(o.plan, o.scribeSeats, seats);
    if (err) throw new UserError(`You currently use more than this plan allows: ${err}`);
    // Charged in the clinic's own currency (USD only where Paystack can't take that currency).
    const { charge } = await clinicBilling(ctx.tenant.currency);
    const r = await initializePayment({
      tenantId: null, email, amountMinor: subscriptionTotal(charge, o.plan, o.cycle, o.scribeSeats), currency: charge.currency, callbackUrl: callbackUrl(),
      metadata: { kind: "subscription", tenantId: ctx.tenant.id, plan: o.plan, cycle: o.cycle, scribeSeats: o.scribeSeats },
    });
    if (!r) throw new UserError("Online payment isn't available right now. Please contact support to renew.");
    redirect(r.url);
  });
}

export async function migrationCheckoutAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { ctx, email } = await billingCtx();
    const tier = z.enum(Object.keys(MIGRATION_TIERS) as [keyof typeof MIGRATION_TIERS]).parse(fd.get("tier"));
    const { charge } = await clinicBilling(ctx.tenant.currency);
    const r = await initializePayment({
      tenantId: null, email, amountMinor: charge.migration[tier], currency: charge.currency, callbackUrl: callbackUrl(),
      metadata: { kind: "migration", tenantId: ctx.tenant.id, tier },
    });
    if (!r) throw new UserError("Online payment isn't available right now. Please contact support.");
    redirect(r.url);
  });
}
