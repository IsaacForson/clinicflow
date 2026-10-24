"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formObject, run, UserError, type ActionState } from "@/lib/action";
import { AuthError, getCtx, tx } from "@/lib/auth";
import { initializePayment } from "@/lib/paystack";
import { can } from "@/lib/permissions";
import { currentSeats, limitError } from "../limits";
import { MIGRATION_TIERS, priceUsd } from "./pricing";

// Not requireWrite: a read-only (unpaid) account must still be able to pay.
async function billingCtx() {
  const ctx = await getCtx();
  if (!ctx) throw new AuthError("Your session has expired. Please sign in again.");
  if (!can(ctx.user.role, "settings.manage")) throw new AuthError("You don't have permission to do that.");
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
    // shortcut: billed in USD (public list price); switch to local-currency amounts if the Paystack merchant can't take USD.
    const r = await initializePayment({
      tenantId: null, email, amountMinor: priceUsd(o.plan, o.cycle, o.scribeSeats) * 100, currency: "USD", callbackUrl: callbackUrl(),
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
    const r = await initializePayment({
      tenantId: null, email, amountMinor: MIGRATION_TIERS[tier].priceUsd * 100, currency: "USD", callbackUrl: callbackUrl(),
      metadata: { kind: "migration", tenantId: ctx.tenant.id, tier },
    });
    if (!r) throw new UserError("Online payment isn't available right now. Please contact support.");
    redirect(r.url);
  });
}
