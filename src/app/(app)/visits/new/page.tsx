import { eq } from "drizzle-orm";
import { Stethoscope } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { Avatar, Field, LinkButton, PageHeader, Select } from "@/components/ui";
import { patients, queueTickets } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { CLINICAL_TEMPLATES } from "@/lib/clinical-templates";
import { age, fullName } from "@/lib/format";
import { startVisitAction } from "../actions";

/** Confirm step (no side effects on GET, so link prefetching can't create visits). */
export default async function NewVisitPage({ searchParams }: PageProps<"/visits/new">) {
  const ctx = await requireCtx("clinical.write");
  const sp = await searchParams;
  const ticketId = typeof sp.ticket === "string" ? sp.ticket : undefined;
  const patientId = typeof sp.patient === "string" ? sp.patient : undefined;
  const data = await tx(ctx, async (t) => {
    const [ticket] = ticketId ? await t.select().from(queueTickets).where(eq(queueTickets.id, ticketId)) : [];
    const pid = ticket?.patientId ?? patientId;
    const [p] = pid ? await t.select().from(patients).where(eq(patients.id, pid)) : [];
    return p ? { p, ticket } : null;
  }).catch(() => null);
  if (!data) notFound();
  if (data.ticket?.visitId) redirect(`/visits/${data.ticket.visitId}`);
  return (
    <>
      <PageHeader eyebrow="Consultations" icon={<Stethoscope />} title="Start consultation"
        actions={<LinkButton variant="ghost" href={`/patients/${data.p.id}`}>Cancel</LinkButton>} />
      <div className="mx-auto max-w-lg">
        <section className="glass ring-aurora relative overflow-hidden p-6 animate-rise sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-aurora opacity-20 blur-3xl" aria-hidden />
          <div className="relative flex items-center gap-4">
            <Avatar name={fullName(data.p)} size="lg" />
            <div className="min-w-0">
              <div className="truncate text-xl font-semibold text-fg">{fullName(data.p)}</div>
              <div className="text-xs text-muted"><span className="font-mono">{data.p.patientNo}</span>{age(data.p.dob) ? ` · ${age(data.p.dob)}` : ""}{data.ticket ? ` · ticket #${data.ticket.ticketNo}` : ""}</div>
            </div>
          </div>
          <ActionForm action={startVisitAction} className="relative mt-6 space-y-5">
            {data.ticket ? <input type="hidden" name="ticketId" value={data.ticket.id} /> : <input type="hidden" name="patientId" value={data.p.id} />}
            <Field label="Note template" hint="You can switch template inside the consultation.">
              <Select name="template" defaultValue="general">
                {Object.values(CLINICAL_TEMPLATES).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </Select>
            </Field>
            <Submit size="lg" className="w-full" autoFocus><Stethoscope className="h-4 w-4" aria-hidden />Start consultation</Submit>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
