"use server";
import { rm } from "node:fs/promises";
import path from "node:path";
import { and, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminDb } from "@/db";
import { auditLog, fxRates, jobs, platformAdmins, platformSessions, priceBook, sessions, tenants, users } from "@/db/schema";
import { formObject, run, UserError, zInt, type ActionState } from "@/lib/action";
import { hashPassword, randomToken, sha256 } from "@/lib/crypto";
import { platformLog, requireAdminAction } from "@/lib/platform-auth";
import { CURRENCIES } from "@/lib/countries";
import { refreshRates } from "@/lib/fx";
import { deletionRequests } from "@/lib/platform-metrics";

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function loadTenant(id: string) {
  const [t] = await adminDb().select().from(tenants).where(eq(tenants.id, id));
  if (!t) throw new UserError("Clinic not found");
  return t;
}

export async function updateClinicBillingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAdminAction("clinics.billing");
    const o = z.object({
      tenantId: uuid, plan: z.enum(["solo", "clinic", "group"]), planStatus: z.enum(["trialing", "active", "past_due", "read_only", "cancelled"]),
      billingCycle: z.enum(["monthly", "annual"]), currentPeriodEnd: day.optional(), scribeSeats: zInt.pipe(z.number().min(0).max(100)),
    }).parse(formObject(fd));
    const before = await loadTenant(o.tenantId);
    const after = { plan: o.plan, planStatus: o.planStatus, billingCycle: o.billingCycle, scribeSeats: o.scribeSeats, currentPeriodEnd: o.currentPeriodEnd ? new Date(`${o.currentPeriodEnd}T23:59:59Z`) : before.currentPeriodEnd };
    await adminDb().update(tenants).set(after).where(eq(tenants.id, o.tenantId));
    await platformLog(ctx, "clinic_billing_update", { tenantId: o.tenantId, entity: "tenant", entityId: o.tenantId,
      details: { before: { plan: before.plan, planStatus: before.planStatus, billingCycle: before.billingCycle, scribeSeats: before.scribeSeats, currentPeriodEnd: before.currentPeriodEnd }, after } });
    revalidatePath(`/admin/clinics/${o.tenantId}`);
    return { ok: true, message: "Subscription updated." };
  });
}

export async function extendTrialAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAdminAction("clinics.billing");
    const o = z.object({ tenantId: uuid, days: zInt.pipe(z.number().min(1).max(90)) }).parse(formObject(fd));
    const t = await loadTenant(o.tenantId);
    const from = t.trialEndsAt && t.trialEndsAt > new Date() ? t.trialEndsAt : new Date();
    const trialEndsAt = new Date(from.getTime() + o.days * 86400_000);
    await adminDb().update(tenants).set({ trialEndsAt, planStatus: t.planStatus === "active" ? "active" : "trialing" }).where(eq(tenants.id, o.tenantId));
    await platformLog(ctx, "clinic_trial_extend", { tenantId: o.tenantId, entity: "tenant", entityId: o.tenantId, details: { days: o.days, trialEndsAt } });
    revalidatePath(`/admin/clinics/${o.tenantId}`);
    return { ok: true, message: `Trial extended by ${o.days} days.` };
  });
}

/** Suspension is for abuse/fraud: staff are signed out and can't sign in. Data is kept untouched. */
export async function setSuspendedAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAdminAction("clinics.suspend");
    const o = z.object({ tenantId: uuid, suspend: z.enum(["1", "0"]), reason: z.string().max(500).optional() }).parse(formObject(fd));
    await loadTenant(o.tenantId);
    if (o.suspend === "1") {
      if (!o.reason || o.reason.length < 5) throw new UserError("Give the reason for suspending (shown in the audit log).");
      await adminDb().update(tenants).set({ suspendedAt: new Date(), suspendReason: o.reason }).where(eq(tenants.id, o.tenantId));
      await adminDb().delete(sessions).where(and(eq(sessions.tenantId, o.tenantId), isNull(sessions.impersonatedBy)));
    } else {
      await adminDb().update(tenants).set({ suspendedAt: null, suspendReason: null }).where(eq(tenants.id, o.tenantId));
    }
    await platformLog(ctx, o.suspend === "1" ? "clinic_suspend" : "clinic_unsuspend", { tenantId: o.tenantId, entity: "tenant", entityId: o.tenantId, details: { reason: o.reason ?? null } });
    revalidatePath(`/admin/clinics/${o.tenantId}`);
    return { ok: true, message: o.suspend === "1" ? "Clinic suspended and staff signed out." : "Clinic reactivated." };
  });
}

export async function saveClinicNotesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAdminAction("clinics.notes");
    const o = z.object({ tenantId: uuid, notes: z.string().max(5000).optional() }).parse(formObject(fd));
    await adminDb().update(tenants).set({ adminNotes: o.notes ?? null }).where(eq(tenants.id, o.tenantId));
    await platformLog(ctx, "clinic_notes_update", { tenantId: o.tenantId, entity: "tenant", entityId: o.tenantId });
    revalidatePath(`/admin/clinics/${o.tenantId}`);
    return { ok: true, message: "Notes saved." };
  });
}

/**
 * Read-only support view: opens the clinic app in this browser as a 1-hour session flagged with this admin's id.
 * Every page view inside is audited in the clinic's own log with impersonatedBy; no writes are possible.
 */
export async function startSupportViewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAdminAction("clinics.impersonate");
    const o = z.object({ tenantId: uuid, reason: z.string().min(5, "Say why you need to view this clinic (e.g. ticket number)").max(300) }).parse(formObject(fd));
    const t = await loadTenant(o.tenantId);
    const [owner] = await adminDb().select().from(users).where(and(eq(users.tenantId, t.id), eq(users.role, "owner"), eq(users.active, true))).limit(1);
    if (!owner) throw new UserError("This clinic has no active owner account to view as.");
    const token = randomToken();
    await adminDb().insert(sessions).values({ id: sha256(token), userId: owner.id, tenantId: t.id, mfaPending: false, impersonatedBy: ctx.admin.id, expiresAt: new Date(Date.now() + 3600_000), ip: ctx.ip });
    await adminDb().insert(auditLog).values({ tenantId: t.id, userId: null, action: "support_view_start", entity: "tenant", entityId: t.id, details: { impersonatedBy: ctx.admin.id, admin: ctx.admin.name, reason: o.reason }, ip: ctx.ip });
    await platformLog(ctx, "support_view_start", { tenantId: t.id, entity: "tenant", entityId: t.id, details: { reason: o.reason } });
    (await cookies()).set("cf_session", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 3600 });
    redirect("/dashboard");
  });
}

/** Permanent deletion after the owner's request: removes every clinic row (cascade) and stored files. Audit logs are kept. */
export async function deleteClinicAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAdminAction("clinics.delete");
    const o = z.object({ tenantId: uuid, confirm: z.string() }).parse(formObject(fd));
    const t = await loadTenant(o.tenantId);
    if (o.confirm.trim() !== t.name) throw new UserError("Type the clinic name exactly to confirm.");
    const [req] = await deletionRequests(t.id);
    if (!req) throw new UserError("The clinic owner hasn't requested deletion. Deletion only happens on the owner's request.");
    if (req.deleteAfter && new Date(req.deleteAfter) > new Date()) throw new UserError(`The 30-day waiting period ends on ${req.deleteAfter.slice(0, 10)}.`);
    await platformLog(ctx, "clinic_delete", { tenantId: t.id, entity: "tenant", entityId: t.id, details: { name: t.name, requestedAt: req.requestedAt } });
    await adminDb().delete(tenants).where(eq(tenants.id, t.id));
    await rm(path.resolve(process.env.STORAGE_DIR || ".storage", t.id), { recursive: true, force: true });
    redirect("/admin/clinics?deleted=1");
  });
}

export async function retryJobAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAdminAction("system.jobs");
    const id = formObject(fd).id;
    const where = id ? and(eq(jobs.id, uuid.parse(id)), eq(jobs.status, "failed")) : eq(jobs.status, "failed");
    const rows = await adminDb().update(jobs).set({ status: "pending", attempts: 0, runAt: new Date(), lastError: null, lockedAt: null }).where(where).returning({ id: jobs.id });
    await platformLog(ctx, "jobs_retry", { entity: "job", entityId: id ?? null, details: { count: rows.length } });
    revalidatePath("/admin/system");
    return { ok: true, message: `${rows.length} job${rows.length === 1 ? "" : "s"} queued again.` };
  });
}

// ---------- Team ----------
const tempPassword = () => randomToken(12);

export async function createAdminAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAdminAction("team.manage");
    const o = z.object({ email: z.string().email(), name: z.string().min(2), role: z.enum(["super_admin", "support", "finance"]) }).parse(formObject(fd));
    const email = o.email.toLowerCase();
    const [dupe] = await adminDb().select({ id: platformAdmins.id }).from(platformAdmins).where(eq(platformAdmins.email, email));
    if (dupe) throw new UserError("A team member with that email already exists.");
    const password = tempPassword();
    const [a] = await adminDb().insert(platformAdmins).values({ email, name: o.name, role: o.role, passwordHash: await hashPassword(password) }).returning({ id: platformAdmins.id });
    await platformLog(ctx, "admin_create", { entity: "platform_admin", entityId: a.id, details: { email, role: o.role } });
    revalidatePath("/admin/team");
    return { ok: true, message: `Temporary password for ${email}: ${password} — shown only once. They set up 2FA at first sign-in.` };
  });
}

export async function updateAdminAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAdminAction("team.manage");
    const o = z.object({ id: uuid, op: z.enum(["role", "deactivate", "activate", "reset_2fa", "reset_password"]), role: z.enum(["super_admin", "support", "finance"]).optional() }).parse(formObject(fd));
    if (o.id === ctx.admin.id && o.op !== "reset_password") throw new UserError("You can't change your own access. Ask another super admin.");
    let message = "Saved.";
    if (o.op === "role") {
      if (!o.role) throw new UserError("Choose a role");
      await adminDb().update(platformAdmins).set({ role: o.role }).where(eq(platformAdmins.id, o.id));
    } else if (o.op === "deactivate" || o.op === "activate") {
      if (o.op === "deactivate") {
        const others = await adminDb().select({ id: platformAdmins.id }).from(platformAdmins).where(and(eq(platformAdmins.role, "super_admin"), eq(platformAdmins.active, true), ne(platformAdmins.id, o.id)));
        if (!others.length) throw new UserError("Keep at least one active super admin.");
      }
      await adminDb().update(platformAdmins).set({ active: o.op === "activate" }).where(eq(platformAdmins.id, o.id));
    } else if (o.op === "reset_2fa") {
      await adminDb().update(platformAdmins).set({ totpEnabled: false, totpSecret: null }).where(eq(platformAdmins.id, o.id));
      message = "2FA reset. They'll enrol again at next sign-in.";
    } else {
      const password = tempPassword();
      await adminDb().update(platformAdmins).set({ passwordHash: await hashPassword(password) }).where(eq(platformAdmins.id, o.id));
      message = `New temporary password: ${password} — shown only once.`;
    }
    if (o.op !== "role") await adminDb().delete(platformSessions).where(and(eq(platformSessions.adminId, o.id), ne(platformSessions.id, ctx.sessionId)));
    await platformLog(ctx, `admin_${o.op}`, { entity: "platform_admin", entityId: o.id, details: { role: o.role ?? null } });
    revalidatePath("/admin/team");
    return { ok: true, message };
  });
}

/** Each admin picks the currency Control shows money in ("auto" = from the country they're browsing from). */
export async function setAdminCurrencyAction(fd: FormData) {
  const ctx = await requireAdminAction();
  const v = String(fd.get("currency") ?? "auto");
  const currency = v === "auto" ? null : z.enum(CURRENCIES as [string, ...string[]]).parse(v);
  await adminDb().update(platformAdmins).set({ currency }).where(eq(platformAdmins.id, ctx.admin.id));
  revalidatePath("/admin", "layout");
}

// ---------- Pricing & exchange rates ----------
export async function saveRateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAdminAction("clinics.billing");
    const o = z.object({ currency: z.enum(CURRENCIES as [string, ...string[]]), perUsd: z.coerce.number().positive(), locked: z.string().optional() }).parse(formObject(fd));
    if (o.currency === "USD" && o.perUsd !== 1) throw new UserError("USD is the base currency (always 1).");
    const locked = o.locked === "on";
    await adminDb().insert(fxRates).values({ currency: o.currency, perUsd: o.perUsd, locked, source: "manual" })
      .onConflictDoUpdate({ target: fxRates.currency, set: { perUsd: o.perUsd, locked, source: "manual", updatedAt: new Date() } });
    await platformLog(ctx, "fx_rate_set", { entity: "fx_rate", entityId: o.currency, details: { perUsd: o.perUsd, locked } });
    revalidatePath("/admin", "layout");
    return { ok: true, message: `${o.currency} rate saved.` };
  });
}

export async function refreshRatesAction(_: ActionState, _fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAdminAction("clinics.billing");
    let n: number;
    try { n = await refreshRates(); } catch (e) { throw new UserError(`Couldn't fetch rates: ${(e as Error).message}`); }
    await platformLog(ctx, "fx_rates_refresh", { details: { updated: n } });
    revalidatePath("/admin", "layout");
    return { ok: true, message: `${n} rates updated (locked rates left as they are).` };
  });
}

/** Local price list for one currency (major units in the form). Empty "reset" clears it back to converted USD prices. */
export async function savePriceBookAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireAdminAction("clinics.billing");
    const f = formObject(fd);
    const currency = z.enum(CURRENCIES as [string, ...string[]]).parse(f.currency);
    if (f.reset === "1") {
      await adminDb().delete(priceBook).where(eq(priceBook.currency, currency));
      await platformLog(ctx, "price_book_reset", { entity: "price_book", entityId: currency });
      revalidatePath("/admin/pricing");
      return { ok: true, message: `${currency} prices reset to converted USD prices.` };
    }
    const amt = z.coerce.number().positive().transform((v) => Math.round(v * 100));
    const o = z.object({ solo: amt, clinic: amt, group: amt, scribe: amt, migrationBasic: amt, migrationStandard: amt, migrationFull: amt }).parse(f);
    if (!(o.solo < o.clinic && o.clinic < o.group)) throw new UserError("Plan prices should go up: Solo < Clinic < Group.");
    await adminDb().insert(priceBook).values({ currency, ...o, updatedBy: ctx.admin.id })
      .onConflictDoUpdate({ target: priceBook.currency, set: { ...o, updatedBy: ctx.admin.id, updatedAt: new Date() } });
    await platformLog(ctx, "price_book_set", { entity: "price_book", entityId: currency, details: o });
    revalidatePath("/admin/pricing");
    return { ok: true, message: `${currency} prices saved. New checkouts use them immediately.` };
  });
}
