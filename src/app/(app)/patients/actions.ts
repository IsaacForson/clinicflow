"use server";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  allergies, appointments, consents, diagnoses, documents, guardians, invoices, labOrders, patients, payments,
  prescriptions, queueTickets, referrals, visits, vitals, carePlans, patientScheduleItems, messageLog, intakeForms, portalTokens,
} from "@/db/schema";
import { formObject, run, UserError, type ActionState } from "@/lib/action";
import { audit, requireWrite, tx } from "@/lib/auth";
import { blindIndex } from "@/lib/crypto";
import { emit } from "@/lib/events";
import { e164 } from "@/lib/format";
import { nextNumber } from "@/lib/numbers";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, putFile } from "@/lib/storage";

const patientSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  otherNames: z.string().optional(),
  sex: z.enum(["female", "male", "other", "unknown"]).default("unknown"),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  phone: z.string().optional(),
  altPhone: z.string().optional(),
  email: z.string().email().optional(),
  nationalId: z.string().optional(),
  address: z.string().optional(),
  occupation: z.string().optional(),
  bloodGroup: z.string().optional(),
  emergencyName: z.string().optional(),
  emergencyPhone: z.string().optional(),
  insurerId: z.string().uuid().optional(),
  memberNo: z.string().optional(),
  insuranceExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  referralSource: z.string().optional(),
  preferredChannel: z.enum(["whatsapp", "sms", "email"]).default("whatsapp"),
  language: z.string().default("en"),
  notes: z.string().optional(),
});

function toRow(o: z.infer<typeof patientSchema>, country: string) {
  return {
    ...o,
    otherNames: o.otherNames ?? null, dob: o.dob ?? null, phone: e164(o.phone, country), altPhone: e164(o.altPhone, country),
    email: o.email ?? null, nationalId: o.nationalId ?? null, nationalIdIndex: o.nationalId ? blindIndex(o.nationalId) : null,
    address: o.address ?? null, occupation: o.occupation ?? null, bloodGroup: o.bloodGroup ?? null,
    emergencyName: o.emergencyName ?? null, emergencyPhone: e164(o.emergencyPhone, country), insurerId: o.insurerId ?? null,
    memberNo: o.memberNo ?? null, insuranceExpiry: o.insuranceExpiry ?? null, referralSource: o.referralSource ?? null, notes: o.notes ?? null,
  };
}

export async function createPatientAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("patients.write");
    const f = formObject(fd);
    const o = patientSchema.parse(f);
    const id = await tx(ctx, async (t) => {
      const row = toRow(o, ctx.tenant.country);
      if (f.force !== "1") {
        const dupes = await findDuplicates(t, row);
        if (dupes.length) throw new UserError(`Possible duplicate: ${dupes.map((d) => `${d.firstName} ${d.lastName} (${d.patientNo})`).join(", ")}. Tick "Create anyway" if this is a different person.`);
      }
      const [p] = await t.insert(patients).values({ ...row, tenantId: ctx.tenant.id, patientNo: await nextNumber(t, ctx.tenant.id, "patient"), createdBy: ctx.user.id }).returning({ id: patients.id });
      if (f.consentMessaging) {
        await t.insert(consents).values({ tenantId: ctx.tenant.id, patientId: p.id, type: "messaging", granted: f.consentMessaging === "yes", method: "verbal", recordedBy: ctx.user.id });
      }
      await t.insert(consents).values({ tenantId: ctx.tenant.id, patientId: p.id, type: "data_processing", granted: true, method: "verbal", recordedBy: ctx.user.id });
      await audit(t, ctx, "create", "patient", p.id, { patientId: p.id });
      await emit(t, ctx.tenant.id, "patient.created", { id: p.id });
      return p.id;
    });
    revalidatePath("/patients");
    return { ok: true, id };
  });
}

async function findDuplicates(t: Parameters<Parameters<typeof tx>[1]>[0], row: { firstName: string; lastName: string; dob: string | null; phone: string | null; nationalIdIndex: string | null }, exceptId?: string) {
  const conds = [and(eq(patients.firstName, row.firstName), eq(patients.lastName, row.lastName), row.dob ? eq(patients.dob, row.dob) : undefined)];
  if (row.phone) conds.push(and(eq(patients.phone, row.phone), eq(patients.lastName, row.lastName)));
  if (row.nationalIdIndex) conds.push(eq(patients.nationalIdIndex, row.nationalIdIndex));
  return t.select({ id: patients.id, firstName: patients.firstName, lastName: patients.lastName, patientNo: patients.patientNo })
    .from(patients).where(and(or(...conds), isNull(patients.deletedAt), isNull(patients.mergedIntoId), exceptId ? ne(patients.id, exceptId) : undefined)).limit(5);
}

export async function updatePatientAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("patients.write");
    const id = z.string().uuid().parse(fd.get("id"));
    const o = patientSchema.parse(formObject(fd));
    await tx(ctx, async (t) => {
      await t.update(patients).set({ ...toRow(o, ctx.tenant.country), updatedAt: new Date() }).where(eq(patients.id, id));
      await audit(t, ctx, "update", "patient", id, { patientId: id });
      await emit(t, ctx.tenant.id, "patient.updated", { id });
    });
    revalidatePath(`/patients/${id}`);
    return { ok: true, id };
  });
}

export async function addAllergyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("patients.write");
    const o = z.object({ patientId: z.string().uuid(), substance: z.string().min(1), reaction: z.string().optional(), severity: z.enum(["mild", "moderate", "severe"]) }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      await t.insert(allergies).values({ ...o, tenantId: ctx.tenant.id });
      await audit(t, ctx, "create", "allergy", null, { patientId: o.patientId, details: { substance: o.substance } });
    });
    revalidatePath(`/patients/${o.patientId}`);
  });
}

export async function removeAllergyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("patients.write");
    const o = z.object({ id: z.string().uuid(), patientId: z.string().uuid() }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      await t.delete(allergies).where(eq(allergies.id, o.id));
      await audit(t, ctx, "delete", "allergy", o.id, { patientId: o.patientId });
    });
    revalidatePath(`/patients/${o.patientId}`);
  });
}

export async function addGuardianAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("patients.write");
    const o = z.object({ patientId: z.string().uuid(), name: z.string().min(1), relationship: z.string().min(1), phone: z.string().optional(), guardianPatientId: z.string().uuid().optional() }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      await t.insert(guardians).values({ ...o, phone: e164(o.phone, ctx.tenant.country), tenantId: ctx.tenant.id });
      await audit(t, ctx, "create", "guardian", null, { patientId: o.patientId });
    });
    revalidatePath(`/patients/${o.patientId}`);
  });
}

export async function recordConsentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("patients.write");
    const o = z.object({
      patientId: z.string().uuid(), type: z.enum(["messaging", "data_processing", "portal", "ai_scribe", "telehealth", "treatment"]),
      granted: z.enum(["yes", "no"]), method: z.enum(["verbal", "signature", "whatsapp", "form"]), signature: z.string().optional(),
    }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      await t.insert(consents).values({ tenantId: ctx.tenant.id, patientId: o.patientId, type: o.type, granted: o.granted === "yes", method: o.method, signature: o.signature ?? null, recordedBy: ctx.user.id });
      await audit(t, ctx, "create", "consent", null, { patientId: o.patientId, details: { type: o.type, granted: o.granted } });
    });
    revalidatePath(`/patients/${o.patientId}`);
  });
}

export async function uploadDocumentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("patients.write");
    const patientId = z.string().uuid().parse(fd.get("patientId"));
    const category = z.enum(["lab_result", "imaging", "referral", "id", "photo", "other"]).parse(fd.get("category") ?? "other");
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choose a file");
    if (file.size > MAX_UPLOAD_BYTES) throw new UserError("File is larger than 15 MB");
    if (!ALLOWED_MIME.test(file.type)) throw new UserError("Only images, PDF, text and CSV files are allowed");
    const key = await putFile(ctx.tenant.id, file.name, Buffer.from(await file.arrayBuffer()));
    await tx(ctx, async (t) => {
      const [d] = await t.insert(documents).values({ tenantId: ctx.tenant.id, patientId, name: file.name, mime: file.type, size: file.size, storageKey: key, category, uploadedBy: ctx.user.id }).returning({ id: documents.id });
      if (category === "photo") await t.update(patients).set({ photoKey: key }).where(eq(patients.id, patientId));
      await audit(t, ctx, "create", "document", d.id, { patientId });
    });
    revalidatePath(`/patients/${patientId}`);
  });
}

/** Merge duplicate `fromId` into `intoId`: re-point every record, then mark the duplicate as merged. */
export async function mergePatientsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("patients.merge");
    const o = z.object({ fromId: z.string().uuid(), intoId: z.string().uuid() }).parse(formObject(fd));
    if (o.fromId === o.intoId) throw new UserError("Choose two different patients");
    await tx(ctx, async (t) => {
      const [from] = await t.select().from(patients).where(eq(patients.id, o.fromId));
      const [into] = await t.select().from(patients).where(eq(patients.id, o.intoId));
      if (!from || !into || from.mergedIntoId || into.mergedIntoId) throw new UserError("Patient not found or already merged");
      const tables = [allergies, appointments, consents, diagnoses, documents, guardians, invoices, labOrders, payments, prescriptions, queueTickets, referrals, visits, vitals, carePlans, patientScheduleItems, messageLog, intakeForms, portalTokens];
      for (const tbl of tables) await t.update(tbl).set({ patientId: o.intoId } as never).where(eq(tbl.patientId, o.fromId));
      // Fill blanks on the surviving record from the duplicate.
      const fill: Partial<typeof patients.$inferInsert> = {};
      for (const k of ["dob", "phone", "altPhone", "email", "address", "occupation", "bloodGroup", "insurerId", "memberNo", "nationalId", "nationalIdIndex", "emergencyName", "emergencyPhone"] as const) {
        if (!into[k] && from[k]) (fill as Record<string, unknown>)[k] = from[k];
      }
      if (Object.keys(fill).length) await t.update(patients).set(fill).where(eq(patients.id, o.intoId));
      await t.update(patients).set({ mergedIntoId: o.intoId, deletedAt: new Date() }).where(eq(patients.id, o.fromId));
      await audit(t, ctx, "merge", "patient", o.intoId, { patientId: o.intoId, details: { mergedFrom: o.fromId, fromNo: from.patientNo } });
    });
    revalidatePath("/patients");
    return { ok: true, id: o.intoId };
  });
}
