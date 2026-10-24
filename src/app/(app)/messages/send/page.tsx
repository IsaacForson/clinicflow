import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { consents, patients } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { fullName } from "@/lib/format";
import { DEFAULT_TEMPLATES } from "@/lib/messaging";
import { sendAdhocAction } from "../actions";
import { MessageTabs, PURPOSE_LABELS } from "../tabs";

export const metadata = { title: "Send message" };

export default async function SendPage({ searchParams }: PageProps<"/messages/send">) {
  const ctx = await requireCtx("messaging.send");
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim();
  const patientId = typeof sp.patient === "string" && /^[0-9a-f-]{36}$/i.test(sp.patient) ? sp.patient : null;
  const { patient, consent, matches } = await tx(ctx, async (t) => {
    const [patient] = patientId ? await t.select().from(patients).where(eq(patients.id, patientId)) : [];
    const [consent] = patient ? await t.select().from(consents).where(and(eq(consents.patientId, patient.id), eq(consents.type, "messaging"))).orderBy(desc(consents.createdAt)).limit(1) : [];
    const like = `%${q}%`;
    const matches = !patient && q ? await t.select().from(patients).where(and(isNull(patients.deletedAt), isNull(patients.mergedIntoId), or(
      ilike(patients.patientNo, like), ilike(sql`${patients.firstName} || ' ' || ${patients.lastName}`, like), ilike(patients.phone, like),
    ))).limit(20) : [];
    return { patient, consent, matches };
  });
  const optedOut = consent && (!consent.granted || consent.revokedAt);

  return (
    <>
      <PageHeader title="Messages" />
      <MessageTabs current="send" />
      {!patient ? (
        <Card title="Choose a patient" className="max-w-2xl">
          <form className="mb-3"><Input name="q" defaultValue={q} placeholder="Name, patient number or phone…" autoFocus /></form>
          <ul className="divide-y divide-slate-100 text-sm">
            {matches.map((p) => <li key={p.id} className="py-2"><Link className="font-medium text-teal-800 hover:underline" href={`/messages/send?patient=${p.id}`}>{fullName(p)}</Link> <span className="text-slate-500">{p.patientNo} · {p.phone}</span></li>)}
            {q && matches.length === 0 && <li className="py-2 text-slate-500">No patients match.</li>}
          </ul>
        </Card>
      ) : (
        <Card title={`Message ${fullName(patient)} (${patient.phone ?? patient.email ?? "no contact"})`} className="max-w-2xl">
          {optedOut && <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">This patient has opted out of messages. Only billing messages can be sent.</p>}
          <ActionForm action={sendAdhocAction} resetOnSuccess>
            <input type="hidden" name="patientId" value={patient.id} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Purpose">
                <Select name="purpose" defaultValue="follow_up">{Object.entries(PURPOSE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
              </Field>
              <Field label="Template">
                <Select name="templateKey" defaultValue="custom">
                  <option value="custom">Custom message</option>
                  {Object.keys(DEFAULT_TEMPLATES).map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
                </Select>
              </Field>
              <Field label="Channel">
                <Select name="channel" defaultValue={patient.preferredChannel}><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="email">Email</option></Select>
              </Field>
            </div>
            <Field label="Message (for a custom message)" hint="Outside the 24-hour WhatsApp window, free text is delivered by SMS.">
              <Textarea name="body" maxLength={1000} placeholder={`Hello ${patient.firstName}, …`} />
            </Field>
            <Submit>Send</Submit>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
