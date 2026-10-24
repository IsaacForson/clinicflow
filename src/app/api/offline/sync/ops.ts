import { z } from "zod";
import { NOTE_FIELDS } from "@/lib/visits";

const text = z.string().max(20_000);
const note = z.object({
  ...Object.fromEntries(NOTE_FIELDS.map((f) => [f, text.optional()])) as Record<(typeof NOTE_FIELDS)[number], z.ZodOptional<typeof text>>,
  extra: z.record(z.string().max(100), text).optional(),
}).strict();

const base = { id: z.number().int().nonnegative(), userId: z.uuid() };

/** Ops the offline outbox can replay. Validated at the trust boundary before anything touches the database. */
export const opSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("visit.note"), visitId: z.uuid(), baseVersion: z.number().int().positive(), note }),
  z.object({
    ...base, type: z.literal("payment"),
    clientId: z.string().min(8).max(100), invoiceId: z.uuid().nullable(), patientId: z.uuid(),
    amountMinor: z.number().int().positive().max(1_000_000_000),
    method: z.enum(["cash", "mobile_money", "card", "bank", "insurance", "deposit"]),
    reference: z.string().max(200).nullable().optional(),
  }),
]);
export const syncBody = z.object({ ops: z.array(opSchema).min(1).max(100) });

export type SyncOp = z.infer<typeof opSchema>;
/** Op as queued by the client (id is assigned by IndexedDB). */
export type OutboxOp = SyncOp extends infer T ? (T extends SyncOp ? Omit<T, "id"> : never) : never;

/**
 * saved: applied. rejected: permanently refused (kept on the device for the user to review, never silently dropped).
 * retry: transient (server error, or queued by a different signed-in user) — stays pending.
 */
export type OpResult = { id: number; status: "saved" | "rejected" | "retry"; error?: string; version?: number };

export const OP_PERMISSION = { "visit.note": "clinical.write", payment: "payments.receive" } as const;
