import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Tenant, User } from "@/db/schema";
import { can } from "./permissions";

// ---------- Access ----------

/** Why the AI scribe is unavailable for this user, or null when it can be used. Consent and the monthly cap are checked per request. */
export function scribeBlockReason(user: Pick<User, "role" | "scribeEnabled">, tenant: Pick<Tenant, "scribeSeats" | "planStatus">): string | null {
  if (!can(user.role, "scribe.use")) return "Your role can't use the AI scribe.";
  if (!user.scribeEnabled && user.role !== "owner") return "The AI scribe isn't enabled for your account. Ask the clinic owner to assign you a seat.";
  if (tenant.scribeSeats <= 0 && tenant.planStatus !== "trialing") return "The AI scribe add-on isn't active for this clinic.";
  return null;
}

// ---------- Redaction (before anything leaves for the LLM) ----------

export type RedactionMap = Record<string, string>;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Replaces emails, phone numbers, national-ID-like strings and the patient's names with placeholders like [PHONE_1].
 * Same value -> same placeholder, so `restore` can put the originals back into the draft locally.
 */
export function redact(text: string, names: (string | null | undefined)[] = []): { text: string; map: RedactionMap } {
  const map: RedactionMap = {};
  const byValue = new Map<string, string>();
  const counts: Record<string, number> = {};
  const ph = (kind: string, value: string) => {
    const k = `${kind}:${value.toLowerCase()}`;
    let p = byValue.get(k);
    if (!p) {
      counts[kind] = (counts[kind] ?? 0) + 1;
      p = `[${kind}_${counts[kind]}]`;
      byValue.set(k, p);
      map[p] = value;
    }
    return p;
  };
  let out = text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, (m) => ph("EMAIL", m))
    .replace(/\b[A-Z]{2,3}-\d{6,10}-\d\b/gi, (m) => ph("ID", m)) // Ghana Card style GHA-123456789-0
    .replace(/(?<![\d.])(?:\+|0)\d[\d\s-]{7,14}\d(?![\d.])/g, (m) => {
      const digits = m.replace(/\D/g, "").length;
      return digits >= 9 && digits <= 15 ? ph("PHONE", m) : m;
    })
    .replace(/\b(?=[A-Z]{0,3}\d)[A-Z]{0,3}\d{7,}\b/g, (m) => ph("ID", m)); // NIN / Kenyan ID / passport-like
  const parts = [...new Set(names.flatMap((n) => (n ?? "").split(/\s+/)).filter((n) => n.length >= 2))]
    .sort((a, b) => b.length - a.length);
  for (const n of parts) out = out.replace(new RegExp(`(?<![\\p{L}\\[])${escapeRe(n)}(?![\\p{L}])`, "giu"), (m) => ph("NAME", m));
  return { text: out, map };
}

export function restore(text: string, map: RedactionMap): string {
  return text.replace(/\[(?:EMAIL|ID|PHONE|NAME)_\d+\]/g, (p) => map[p] ?? p);
}

// ---------- Model choice ----------

export const SCRIBE_MODELS = { short: "claude-haiku-5-5", long: "claude-sonnet-5-5" } as const;
export const LONG_TRANSCRIPT_WORDS = 1500;
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
export const chooseModel = (transcript: string) => (wordCount(transcript) < LONG_TRANSCRIPT_WORDS ? SCRIBE_MODELS.short : SCRIBE_MODELS.long);

// ---------- Speech to text (audio is streamed through, never stored) ----------

export async function transcribe(audio: Blob, apiKey: string): Promise<{ transcript: string; seconds: number }> {
  const res = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&detect_language=true", {
    method: "POST",
    headers: { Authorization: `Token ${apiKey}`, "Content-Type": audio.type || "audio/webm" },
    body: audio,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Speech-to-text failed: ${json?.err_msg ?? res.status}`);
  return {
    transcript: String(json?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ""),
    seconds: Math.round(Number(json?.metadata?.duration ?? 0)),
  };
}

// ---------- SOAP draft ----------

export const soapDraftSchema = z.object({
  complaint: z.string(),
  subjective: z.string(),
  objective: z.string(),
  assessment: z.string(),
  plan: z.string(),
});
export type SoapDraft = z.infer<typeof soapDraftSchema>;

export const SCRIBE_SYSTEM_PROMPT = `You are a clinical documentation assistant for a private clinic in West/East Africa.
You turn a consultation transcript into a draft SOAP note that the clinician will review, edit and sign.
Rules:
- Use ONLY information that was actually said in the transcript. Never invent findings, history, vitals, doses or results.
- Do NOT suggest diagnoses, investigations or treatments. In "assessment" and "plan", record only what the clinician explicitly stated.
- If something is unclear, inaudible or ambiguous, include it with "[?]" after it.
- Leave a field as an empty string if nothing relevant was said.
- Keep placeholders such as [NAME_1], [PHONE_1], [ID_1] exactly as written.
- Write concise clinical English. "complaint" is a short presenting complaint (one line).
Always respond by calling the record_soap_draft tool.`;

const SOAP_TOOL: Anthropic.Tool = {
  name: "record_soap_draft",
  description: "Record the draft SOAP note derived strictly from the transcript.",
  input_schema: {
    type: "object",
    properties: {
      complaint: { type: "string", description: "Presenting complaint, one line" },
      subjective: { type: "string", description: "History as reported by the patient" },
      objective: { type: "string", description: "Examination findings and measurements that were stated" },
      assessment: { type: "string", description: "Only the clinician's stated assessment/impression" },
      plan: { type: "string", description: "Only the clinician's stated plan" },
    },
    required: ["complaint", "subjective", "objective", "assessment", "plan"],
  },
};

export class ScribeConfigError extends Error {}

export async function draftSoap(redactedTranscript: string): Promise<{ draft: SoapDraft; model: string; inputTokens: number; outputTokens: number }> {
  if (!process.env.ANTHROPIC_API_KEY) throw new ScribeConfigError("The AI scribe is not configured on this server (ANTHROPIC_API_KEY is missing).");
  const model = chooseModel(redactedTranscript);
  const client = new Anthropic();
  const msg = await client.messages.create({
    model,
    max_tokens: 2000,
    system: SCRIBE_SYSTEM_PROMPT,
    tools: [SOAP_TOOL],
    tool_choice: { type: "tool", name: SOAP_TOOL.name },
    messages: [{ role: "user", content: `Consultation transcript:\n<transcript>\n${redactedTranscript}\n</transcript>` }],
  });
  const block = msg.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("The model did not return a draft");
  return { draft: soapDraftSchema.parse(block.input), model, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens };
}
