"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminDb } from "@/db";
import { auditLog, intakeForms } from "@/db/schema";
import { formObject, run, UserError, type ActionState } from "@/lib/action";
import { sha256 } from "@/lib/crypto";
import { intakeSchema, zSignature } from "../schema";

/** Public (no login): the token is the only credential. Every write is pinned to the form's own tenant. */
export async function submitIntakeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const token = z.string().min(16).max(100).parse(fd.get("token"));
    const data = intakeSchema.parse(formObject(fd));
    const signature = zSignature.parse(fd.get("signature") || undefined);
    const db = adminDb();
    const [f] = await db.select().from(intakeForms).where(eq(intakeForms.tokenHash, sha256(token))).limit(1);
    if (!f || f.expiresAt < new Date()) throw new UserError("This link has expired. Please ask the clinic to send a new one.");
    if (f.status !== "sent") throw new UserError("This form has already been submitted. Thank you!");
    const [u] = await db.update(intakeForms)
      .set({ data: JSON.stringify(data), signature, status: "submitted", submittedAt: new Date() })
      .where(and(eq(intakeForms.id, f.id), eq(intakeForms.tenantId, f.tenantId), eq(intakeForms.status, "sent")))
      .returning({ id: intakeForms.id });
    if (!u) throw new UserError("This form has already been submitted. Thank you!");
    await db.insert(auditLog).values({ tenantId: f.tenantId, userId: null, action: "submit", entity: "intake_form", entityId: f.id, patientId: f.patientId });
    revalidatePath(`/intake/${token}`);
    return { ok: true, message: "Thank you — your form has been sent to the clinic." };
  });
}
