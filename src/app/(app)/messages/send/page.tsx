import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { AlertTriangle, Search, Send, ShieldCheck, UserPlus } from "lucide-react";
import { A, Avatar, Badge, Callout, EmptyState, Field, Input, LinkButton, PageHeader, Panel, Select } from "@/components/ui";
import { SendFields } from "../composer";
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
      <PageHeader icon={<Send />} eyebrow="Patient messaging" title="Send message" subtitle="One-off messages. Purpose and consent are recorded with every message." />
      <MessageTabs current="send" />
      {!patient ? (
        <Panel icon={<Search />} eyebrow="Step 1" title="Choose a patient" className="max-w-3xl">
          <form className="relative mb-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input name="q" defaultValue={q} placeholder="Name, patient number or phone…" autoFocus className="h-12 pl-10 text-base" aria-label="Search patients" />
          </form>
          {!q ? <p className="py-6 text-center text-sm text-muted">Type a name, patient number or phone and press Enter.</p>
            : matches.length === 0 ? <EmptyState icon={<UserPlus />} title="No patients match"><A href="/patients/new">Register the patient</A> first.</EmptyState> : (
            <ul className="space-y-1">
              {matches.map((p) => (
                <li key={p.id}>
                  <Link href={`/messages/send?patient=${p.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-surface-2">
                    <Avatar name={fullName(p)} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-fg">{fullName(p)}</div>
                      <div className="truncate text-xs text-muted"><span className="font-mono">{p.patientNo}</span>{p.phone && ` · ${p.phone}`}</div>
                    </div>
                    <span className="text-xs font-medium text-accent">Select →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Panel eyebrow="Compose" title={`Message ${patient.firstName}`} icon={<Send />} glow>
            {optedOut && <div className="mb-4"><Callout tone="yellow" icon={<AlertTriangle />}>This patient has opted out of messages. Only billing messages can be sent.</Callout></div>}
            <ActionForm action={sendAdhocAction} resetOnSuccess className="space-y-4">
              <input type="hidden" name="patientId" value={patient.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Purpose">
                  <Select name="purpose" defaultValue="follow_up">{Object.entries(PURPOSE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                </Field>
                <Field label="Channel">
                  <Select name="channel" defaultValue={patient.preferredChannel}><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="email">Email</option></Select>
                </Field>
              </div>
              <SendFields templates={DEFAULT_TEMPLATES} sample={{ name: patient.firstName, clinic: ctx.tenant.name }} />
              <div className="flex justify-end"><Submit size="lg"><Send className="h-4 w-4" />Send</Submit></div>
            </ActionForm>
          </Panel>
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Panel eyebrow="Recipient">
              <div className="flex flex-col items-center gap-3 text-center">
                <Avatar name={fullName(patient)} size="lg" />
                <div>
                  <div className="text-base font-semibold text-fg">{fullName(patient)}</div>
                  <div className="font-mono text-xs text-muted">{patient.patientNo}</div>
                  <div className="mt-1 text-xs text-muted">{patient.phone ?? patient.email ?? "no contact"}</div>
                </div>
                {optedOut ? <Badge tone="yellow">opted out</Badge> : consent ? <Badge tone="green">consent on file</Badge> : <Badge>no consent record</Badge>}
                <LinkButton variant="ghost" size="sm" href="/messages/send">Change patient</LinkButton>
              </div>
              <p className="mt-4 flex items-start gap-2 border-t border-line pt-4 text-[11px] text-subtle"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />Opt-out always wins: messages to opted-out patients are skipped and logged.</p>
            </Panel>
          </aside>
        </div>
      )}
    </>
  );
}
