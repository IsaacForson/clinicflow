import { z } from "zod";

const opt = (max = 200) => z.string().max(max).optional();
const yes = z.string().optional().transform((v) => v === "on" || v === "yes" || v === "true");

/** Answers a patient submits on the public intake form (stored encrypted as JSON). */
export const intakeSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  otherNames: opt(100),
  sex: z.enum(["female", "male", "other", "unknown"]).default("unknown"),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker for date of birth").optional(),
  phone: opt(30),
  email: z.string().email("Enter a valid email").max(200).optional(),
  address: opt(300),
  occupation: opt(100),
  allergies: opt(1000),
  medications: opt(2000),
  history: opt(3000),
  emergencyName: opt(100),
  emergencyPhone: opt(30),
  consentMessaging: yes,
  consentDataProcessing: yes,
  consentTreatment: yes,
});
export type IntakeData = z.infer<typeof intakeSchema>;

// ~ a 600x200 PNG signature is well under this.
export const zSignature = z.string({ error: "Please sign in the box" })
  .max(300_000, "Signature is too large — clear it and sign again")
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "Please sign in the box");

const NONE = /^(none|nil|no|nkda|nka|n\/a|na|-)$/i;

/** "Penicillin - rash" / "Peanuts: swelling" / "Dust" per line → allergy rows; "none"/"NKDA" lines are ignored. */
export function parseAllergies(text: string | undefined): { substance: string; reaction: string | null }[] {
  if (!text) return [];
  const out: { substance: string; reaction: string | null }[] = [];
  for (const raw of text.split(/\r?\n|;/)) {
    const line = raw.trim();
    if (!line || NONE.test(line)) continue;
    const m = line.match(/^(.+?)\s*(?::|\(|\s[-–]\s)\s*(.+?)\)?$/);
    const substance = (m ? m[1] : line).trim();
    const reaction = m ? m[2].trim() || null : null;
    if (substance && !out.some((o) => o.substance.toLowerCase() === substance.toLowerCase())) out.push({ substance: substance.slice(0, 100), reaction: reaction?.slice(0, 200) ?? null });
  }
  return out;
}
