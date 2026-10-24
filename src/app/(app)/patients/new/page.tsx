import { eq } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui";
import { insurers } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { createPatientAction } from "../actions";
import { PatientForm } from "../patient-form";

export default async function NewPatientPage() {
  const ctx = await requireCtx("patients.write");
  const ins = await tx(ctx, (t) => t.select({ id: insurers.id, name: insurers.name }).from(insurers).where(eq(insurers.active, true)).orderBy(insurers.name));
  return (
    <>
      <PageHeader title="Register patient" />
      <Card><PatientForm action={createPatientAction} insurers={ins} redirectTo="/patients/{id}" /></Card>
    </>
  );
}
