import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { Card, Field, PageHeader, Select } from "@/components/ui";
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
      <PageHeader title="Start consultation" subtitle={`${fullName(data.p)} · ${data.p.patientNo}${age(data.p.dob) ? ` · ${age(data.p.dob)}` : ""}`} />
      <Card className="max-w-md">
        <ActionForm action={startVisitAction}>
          {data.ticket ? <input type="hidden" name="ticketId" value={data.ticket.id} /> : <input type="hidden" name="patientId" value={data.p.id} />}
          <Field label="Note template">
            <Select name="template" defaultValue="general">
              {Object.values(CLINICAL_TEMPLATES).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </Select>
          </Field>
          <Submit className="w-full py-3" autoFocus>Start consultation</Submit>
        </ActionForm>
      </Card>
    </>
  );
}
