import { eq } from "drizzle-orm";
import { UserPen } from "lucide-react";
import { notFound } from "next/navigation";
import { LinkButton, PageHeader } from "@/components/ui";
import { insurers, patients } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { fullName } from "@/lib/format";
import { updatePatientAction } from "../../actions";
import { PatientForm } from "../../patient-form";

export default async function EditPatientPage({ params }: PageProps<"/patients/[id]/edit">) {
  const { id } = await params;
  const ctx = await requireCtx("patients.write");
  const [p, ins] = await tx(ctx, async (t) => [
    (await t.select().from(patients).where(eq(patients.id, id)))[0],
    await t.select({ id: insurers.id, name: insurers.name }).from(insurers).where(eq(insurers.active, true)),
  ] as const);
  if (!p) notFound();
  return (
    <>
      <PageHeader eyebrow={`Patient · ${p.patientNo}`} icon={<UserPen />} title={`Edit ${fullName(p)}`}
        actions={<LinkButton variant="ghost" href={`/patients/${id}`}>Cancel</LinkButton>} />
      <PatientForm action={updatePatientAction} patient={p} insurers={ins} redirectTo={`/patients/${id}`} />
    </>
  );
}
