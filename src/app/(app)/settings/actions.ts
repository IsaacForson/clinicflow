"use server";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { branches, documents, services, tenants } from "@/db/schema";
import { formObject, run, UserError, zBool, zMoney, type ActionState } from "@/lib/action";
import { audit, requireWrite, tx } from "@/lib/auth";
import { e164 } from "@/lib/format";
import { hasFeature } from "@/lib/plans";
import { COUNTRIES } from "@/lib/provision";
import { putFile } from "@/lib/storage";
import { assertSeats } from "./limits";

const profileSchema = z.object({
  name: z.string().min(2, "Clinic name is required"),
  phone: z.string().optional(), email: z.string().email().optional(), address: z.string().optional(),
  registrationNo: z.string().optional(), taxId: z.string().optional(), letterhead: z.string().max(500).optional(),
  country: z.string().refine((c) => c in COUNTRIES, "Choose a country"),
  currency: z.string().regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code like GHS"),
  timezone: z.string().refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz), "Choose a valid timezone"),
});

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("settings.manage");
    const o = profileSchema.parse(formObject(fd));
    const logo = fd.get("logo");
    let logoKey: string | null = null;
    if (logo instanceof File && logo.size > 0) {
      if (!/^image\/(png|jpe?g|webp)$/.test(logo.type)) throw new UserError("Logo must be a PNG, JPG or WebP image");
      if (logo.size > 2 * 1024 * 1024) throw new UserError("Logo must be smaller than 2 MB");
      logoKey = await putFile(ctx.tenant.id, logo.name, Buffer.from(await logo.arrayBuffer()));
    }
    await tx(ctx, async (t) => {
      let logoUrl: string | undefined;
      if (logoKey) {
        const [d] = await t.insert(documents).values({ tenantId: ctx.tenant.id, name: (logo as File).name, mime: (logo as File).type, size: (logo as File).size, storageKey: logoKey, category: "logo", uploadedBy: ctx.user.id }).returning({ id: documents.id });
        logoUrl = `/api/files/${d.id}`;
      }
      await t.update(tenants).set({
        name: o.name, phone: e164(o.phone, o.country), email: o.email ?? null, address: o.address ?? null, registrationNo: o.registrationNo ?? null,
        taxId: o.taxId ?? null, letterhead: o.letterhead ?? null, country: o.country, currency: o.currency, timezone: o.timezone,
        ...(logoUrl ? { logoUrl } : {}),
      }).where(eq(tenants.id, ctx.tenant.id));
      await audit(t, ctx, "update", "tenant", ctx.tenant.id);
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Clinic profile saved." };
  });
}

const branchSchema = z.object({ id: z.string().uuid().optional(), name: z.string().min(1, "Branch name is required"), address: z.string().optional(), phone: z.string().optional(), active: zBool });

export async function saveBranchAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("settings.manage");
    const o = branchSchema.parse(formObject(fd));
    const row = { name: o.name, address: o.address ?? null, phone: e164(o.phone, ctx.tenant.country) };
    await tx(ctx, async (t) => {
      if (o.id) {
        const [b] = await t.select().from(branches).where(eq(branches.id, o.id));
        if (!b) throw new UserError("Branch not found");
        if (!o.active && b.isMain) throw new UserError("The main branch can't be deactivated. Make another branch main first.");
        if (o.active && !b.active) await assertSeats(t, ctx.tenant, { branches: 1 });
        await t.update(branches).set({ ...row, active: o.active }).where(eq(branches.id, o.id));
        await audit(t, ctx, "update", "branch", o.id);
      } else {
        const existing = await t.select({ id: branches.id }).from(branches).where(eq(branches.active, true));
        if (existing.length && !hasFeature(ctx.tenant, "multi_branch")) throw new UserError("Multiple branches are available on the Group plan.");
        await assertSeats(t, ctx.tenant, { branches: 1 });
        const [b] = await t.insert(branches).values({ ...row, tenantId: ctx.tenant.id, isMain: existing.length === 0 }).returning({ id: branches.id });
        await audit(t, ctx, "create", "branch", b.id);
      }
    });
    revalidatePath("/settings/branches");
    return { ok: true, message: "Branch saved." };
  });
}

export async function makeMainBranchAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("settings.manage");
    const id = z.string().uuid().parse(fd.get("id"));
    await tx(ctx, async (t) => {
      const [b] = await t.select().from(branches).where(and(eq(branches.id, id), eq(branches.active, true)));
      if (!b) throw new UserError("Branch not found or inactive");
      await t.update(branches).set({ isMain: false }).where(ne(branches.id, id));
      await t.update(branches).set({ isMain: true }).where(eq(branches.id, id));
      await audit(t, ctx, "update", "branch", id, { details: { isMain: true } });
    });
    revalidatePath("/settings/branches");
  });
}

const serviceSchema = z.object({
  id: z.string().uuid().optional(), name: z.string().min(1, "Service name is required"), code: z.string().optional(),
  category: z.enum(["consultation", "lab", "imaging", "procedure", "drug", "other"]),
  price: zMoney, durationMin: z.coerce.number().int().min(0).max(600).default(15), active: zBool,
});

export async function saveServiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("settings.manage");
    const o = serviceSchema.parse(formObject(fd));
    const row = { name: o.name, code: o.code ?? null, category: o.category, priceMinor: o.price, durationMin: o.durationMin };
    await tx(ctx, async (t) => {
      if (o.id) {
        await t.update(services).set({ ...row, active: o.active }).where(eq(services.id, o.id));
        await audit(t, ctx, "update", "service", o.id, { details: { priceMinor: o.price } });
      } else {
        const [s] = await t.insert(services).values({ ...row, tenantId: ctx.tenant.id }).returning({ id: services.id });
        await audit(t, ctx, "create", "service", s.id, { details: { priceMinor: o.price } });
      }
    });
    revalidatePath("/settings/services");
    return { ok: true, message: "Saved." };
  });
}

export async function saveRemindersAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("settings.manage");
    const f = formObject(fd);
    const hours = [...new Set((f.reminderHours ?? "").split(/[,\s]+/).filter(Boolean).map(Number))];
    if (hours.some((h) => !Number.isInteger(h) || h < 1 || h > 336)) throw new UserError("Reminder hours must be whole numbers between 1 and 336, e.g. 24, 2");
    if (hours.length > 5) throw new UserError("Up to 5 reminders per appointment");
    const icd = [...new Set((f.notifiableIcd ?? "").toUpperCase().split(/[,\s]+/).filter(Boolean))];
    if (icd.some((c) => !/^[A-Z]\d{2}(\.\w{1,4})?$/.test(c))) throw new UserError("ICD-10 codes look like A00 or B50.9");
    await tx(ctx, async (t) => {
      await t.update(tenants).set({ reminderHours: hours.sort((a, b) => b - a), notifiableIcd: icd }).where(eq(tenants.id, ctx.tenant.id));
      await audit(t, ctx, "update", "tenant", ctx.tenant.id, { details: { reminderHours: hours, notifiableIcd: icd } });
    });
    revalidatePath("/settings/reminders");
    return { ok: true, message: "Saved. New appointments use these reminder times." };
  });
}
