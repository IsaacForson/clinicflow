import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { consents, integrations, patients, scribeSessions, visits } from "@/db/schema";
import { audit, getCtx, tx } from "@/lib/auth";
import { localDay, zonedToUtc } from "@/lib/format";
import { SCRIBE_NOTES_CAP } from "@/lib/plans";
import { draftSoap, redact, restore, ScribeConfigError, scribeBlockReason, transcribe } from "@/lib/scribe";

export const maxDuration = 120;

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const err = (error: string, status: number) => Response.json({ error }, { status });

/**
 * POST multipart: visitId + (audio file | transcript text). Returns a SOAP draft for the clinician to review.
 * Audio is streamed to speech-to-text and never stored; only the redacted transcript reaches the LLM.
 */
export async function POST(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return err("Your session has expired. Please sign in again.", 401);
  if (ctx.access === "read_only") return err("This account is read-only until the subscription is renewed.", 403);
  const blocked = scribeBlockReason(ctx.user, ctx.tenant);
  if (blocked) return err(blocked, 403);
  if (!process.env.ANTHROPIC_API_KEY) return err("The AI scribe is not configured on this server yet (missing ANTHROPIC_API_KEY). Ask your administrator.", 503);

  const fd = await req.formData().catch(() => null);
  const visitId = String(fd?.get("visitId") ?? "");
  const audio = fd?.get("audio");
  let transcript = String(fd?.get("transcript") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(visitId)) return err("Missing consultation", 400);
  if (!(audio instanceof File && audio.size > 0) && !transcript) return err("Record audio or paste a transcript", 400);
  if (audio instanceof File && audio.size > MAX_AUDIO_BYTES) return err("Recording is too long. Split it into shorter parts.", 413);
  if (transcript.length > 100_000) return err("Transcript is too long", 413);

  // Pre-checks inside RLS: visit, consent, monthly cap, tenant STT key.
  const pre = await tx(ctx, async (t) => {
    const [v] = await t.select({ id: visits.id, status: visits.status, patientId: visits.patientId }).from(visits).where(eq(visits.id, visitId));
    if (!v) return { error: "Consultation not found", status: 404 } as const;
    if (v.status === "signed") return { error: "This note is signed. Use an addendum instead.", status: 409 } as const;
    const [consent] = await t.select().from(consents).where(and(eq(consents.patientId, v.patientId), eq(consents.type, "ai_scribe")))
      .orderBy(desc(consents.createdAt)).limit(1);
    if (!consent?.granted || consent.revokedAt) return { error: "Record the patient's AI scribe consent (Patient → Consent) before using the scribe.", status: 403 } as const;
    const tz = ctx.tenant.timezone;
    const monthStart = zonedToUtc(localDay(tz).slice(0, 8) + "01", "00:00", tz);
    const [{ n }] = await t.select({ n: sql<number>`count(*)::int` }).from(scribeSessions)
      .where(and(eq(scribeSessions.practitionerId, ctx.user.id), gte(scribeSessions.createdAt, monthStart), ne(scribeSessions.status, "failed")));
    if (n >= SCRIBE_NOTES_CAP) return { error: `You've reached this month's fair-use limit of ${SCRIBE_NOTES_CAP} scribe notes.`, status: 429 } as const;
    const [p] = await t.select({ firstName: patients.firstName, lastName: patients.lastName, otherNames: patients.otherNames }).from(patients).where(eq(patients.id, v.patientId));
    const [dg] = await t.select({ config: integrations.config }).from(integrations)
      .where(and(eq(integrations.provider, "deepgram"), eq(integrations.active, true))).limit(1);
    const deepgramKey = (dg ? (JSON.parse(dg.config).apiKey as string | undefined) : undefined) ?? process.env.DEEPGRAM_API_KEY;
    return { visit: v, names: [p?.firstName, p?.lastName, p?.otherNames], deepgramKey };
  });
  if ("error" in pre) return err(pre.error!, pre.status!);

  let audioSeconds = 0;
  if (audio instanceof File && audio.size > 0) {
    if (!pre.deepgramKey) return err("Speech-to-text isn't configured (missing DEEPGRAM_API_KEY). Paste or dictate the transcript instead.", 503);
    try {
      const r = await transcribe(audio, pre.deepgramKey);
      transcript = [transcript, r.transcript].filter(Boolean).join("\n");
      audioSeconds = r.seconds;
    } catch (e) {
      return err((e as Error).message, 502);
    }
    if (!transcript) return err("No speech was detected in the recording.", 422);
  }

  const { text: redacted, map } = redact(transcript, pre.names);
  let result: Awaited<ReturnType<typeof draftSoap>> | null = null;
  let failure: string | null = null;
  try {
    result = await draftSoap(redacted);
  } catch (e) {
    if (e instanceof ScribeConfigError) return err(e.message, 503);
    console.error("scribe draft failed", e);
    failure = "The AI draft failed. Please try again, or write the note manually.";
  }
  const draft = result ? Object.fromEntries(Object.entries(result.draft).map(([k, v]) => [k, restore(v, map)])) : null;

  const session = await tx(ctx, async (t) => {
    const [s] = await t.insert(scribeSessions).values({
      tenantId: ctx.tenant.id, visitId, practitionerId: ctx.user.id, status: result ? "drafted" : "failed",
      transcript, draft: draft ? JSON.stringify(draft) : null, model: result?.model ?? null,
      inputTokens: result?.inputTokens ?? 0, outputTokens: result?.outputTokens ?? 0, audioSeconds,
    }).returning({ id: scribeSessions.id });
    await audit(t, ctx, "create", "scribe_session", s.id, { patientId: pre.visit.patientId, details: { model: result?.model ?? null, audioSeconds, ok: !!result } });
    return s;
  });
  if (!result) return err(failure!, 502);
  return Response.json({ sessionId: session.id, draft, transcript, model: result.model });
}
