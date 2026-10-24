import { eq } from "drizzle-orm";
import { UserPlus } from "lucide-react";
import { LinkButton, PageHeader } from "@/components/ui";
import { insurers } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { createPatientAction } from "../actions";
import { PatientForm } from "../patient-form";

export default async function NewPatientPage() {
  const ctx = await requireCtx("patients.write");
  const ins = await tx(ctx, (t) => t.select({ id: insurers.id, name: insurers.name }).from(insurers).where(eq(insurers.active, true)).orderBy(insurers.name));
  return (
    <>
      <PageHeader eyebrow="Patients" icon={<UserPlus />} title="Register patient" subtitle="Takes under a minute. We check for duplicates before saving."
        actions={<LinkButton variant="ghost" href="/patients">Cancel</LinkButton>} />
      <PatientForm action={createPatientAction} insurers={ins} redirectTo="/patients/{id}" />
    </>
  );
}
