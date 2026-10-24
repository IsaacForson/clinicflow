import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { Badge, Card, LinkButton, PageHeader, Table, Td } from "@/components/ui";
import { patients, prescriptionItems, prescriptions, users } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { dateTime, fullName } from "@/lib/format";
import { can } from "@/lib/permissions";

export const metadata = { title: "Pharmacy" };

export default async function PharmacyPage() {
  const ctx = await requireCtx("dispense");
  const { rows, lines } = await tx(ctx, async (t) => {
    const rows = await t.select({ rx: prescriptions, p: patients, prescriber: users.name }).from(prescriptions)
      .innerJoin(patients, eq(patients.id, prescriptions.patientId)).leftJoin(users, eq(users.id, prescriptions.prescriberId))
      .where(inArray(prescriptions.status, ["issued", "partially_dispensed"])).orderBy(prescriptions.createdAt).limit(200);
    const lines = rows.length ? await t.select().from(prescriptionItems).where(inArray(prescriptionItems.prescriptionId, rows.map((r) => r.rx.id))) : [];
    return { rows, lines };
  });
  const recent = await tx(ctx, (t) => t.select({ rx: prescriptions, p: patients }).from(prescriptions).innerJoin(patients, eq(patients.id, prescriptions.patientId))
    .where(eq(prescriptions.status, "dispensed")).orderBy(desc(prescriptions.createdAt)).limit(10));
  const tz = ctx.tenant.timezone;
  return (
    <>
      <PageHeader title="Pharmacy" subtitle="Prescriptions waiting to be dispensed."
        actions={can(ctx.user.role, "inventory.manage") && <LinkButton variant="secondary" href="/pharmacy/inventory">Inventory</LinkButton>} />
      <Card title="Dispense queue">
        <Table head={["Prescribed", "Patient", "Prescriber", "Items", "Status", ""]} empty="Nothing waiting. New prescriptions appear here.">
          {rows.map(({ rx, p, prescriber }) => (
            <tr key={rx.id} className="hover:bg-slate-50">
              <Td>{dateTime(rx.createdAt, tz)}</Td>
              <Td><Link href={`/pharmacy/${rx.id}`} className="font-medium text-brand-800 hover:underline">{fullName(p)}</Link> <span className="font-mono text-xs text-slate-500">{p.patientNo}</span></Td>
              <Td>{prescriber ?? "—"}</Td>
              <Td className="max-w-sm truncate">{lines.filter((l) => l.prescriptionId === rx.id).map((l) => `${l.drugName} ×${l.quantity}`).join(", ")}</Td>
              <Td><Badge tone={rx.status === "issued" ? "yellow" : "blue"}>{rx.status.replace("_", " ")}</Badge></Td>
              <Td className="text-right"><LinkButton className="px-2 py-1 text-xs" href={`/pharmacy/${rx.id}`}>Dispense</LinkButton></Td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title="Recently dispensed" className="mt-4">
        <Table head={["Prescribed", "Patient", ""]} empty="None yet.">
          {recent.map(({ rx, p }) => (
            <tr key={rx.id}>
              <Td>{dateTime(rx.createdAt, tz)}</Td><Td><Link href={`/pharmacy/${rx.id}`} className="text-brand-800 hover:underline">{fullName(p)}</Link></Td>
              <Td className="text-right"><Link href={`/pharmacy/${rx.id}/labels`} className="text-xs text-brand-800 hover:underline">Labels</Link></Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
