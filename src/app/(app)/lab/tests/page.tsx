import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Card, Field, Input, LinkButton, PageHeader, Select, Table, Td } from "@/components/ui";
import { labTests, services } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { money } from "@/lib/format";
import { saveLabTestAction } from "../actions";

export const metadata = { title: "Lab test catalogue" };

export default async function LabTestsPage({ searchParams }: PageProps<"/lab/tests">) {
  const ctx = await requireCtx("lab.result");
  const editId = (await searchParams).edit;
  const { tests, svc } = await tx(ctx, async (t) => ({
    tests: await t.select({ test: labTests, service: services.name, price: services.priceMinor }).from(labTests)
      .leftJoin(services, eq(services.id, labTests.serviceId)).orderBy(labTests.kind, labTests.name),
    svc: await t.select({ id: services.id, name: services.name, price: services.priceMinor }).from(services)
      .where(inArray(services.category, ["lab", "imaging"])).orderBy(services.name),
  }));
  const editing = tests.find((x) => x.test.id === editId)?.test;
  const cur = ctx.tenant.currency;
  return (
    <>
      <PageHeader title="Lab test catalogue" subtitle="Tests and imaging studies, with default units, reference ranges and the service used for billing."
        actions={<LinkButton variant="secondary" href="/lab">Back to worklist</LinkButton>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Table head={["Name", "Code", "Kind", "Unit", "Reference range", "Billed as", ""]} empty="No tests yet. Add your first test.">
            {tests.map(({ test: x, service, price }) => (
              <tr key={x.id} className={x.active ? "" : "text-slate-400"}>
                <Td className="font-medium">{x.name} {!x.active && <Badge>inactive</Badge>}</Td>
                <Td>{x.code}</Td><Td className="capitalize">{x.kind}</Td><Td>{x.unit}</Td><Td>{x.refRange}</Td>
                <Td>{service ? `${service} · ${money(price, cur)}` : <span className="text-slate-400">not billed</span>}</Td>
                <Td><Link href={`/lab/tests?edit=${x.id}`} className="text-brand-800 hover:underline">Edit</Link></Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title={editing ? `Edit ${editing.name}` : "Add test"} actions={editing && <Link href="/lab/tests" className="text-xs text-slate-500">New instead</Link>}>
          <ActionForm key={editing?.id ?? "new"} action={saveLabTestAction} resetOnSuccess={!editing}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field label="Name"><Input name="name" defaultValue={editing?.name} required /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code"><Input name="code" defaultValue={editing?.code ?? ""} /></Field>
              <Field label="Kind"><Select name="kind" defaultValue={editing?.kind ?? "lab"}><option value="lab">Lab</option><option value="imaging">Imaging</option></Select></Field>
              <Field label="Unit"><Input name="unit" defaultValue={editing?.unit ?? ""} placeholder="mmol/L" /></Field>
              <Field label="Reference range"><Input name="refRange" defaultValue={editing?.refRange ?? ""} placeholder="3.5-5.0" /></Field>
            </div>
            <Field label="Service (price)" hint="Create lab/imaging services under Settings to bill tests.">
              <Select name="serviceId" defaultValue={editing?.serviceId ?? ""}>
                <option value="">Not billed</option>{svc.map((s) => <option key={s.id} value={s.id}>{s.name} · {money(s.price, cur)}</option>)}
              </Select>
            </Field>
            {editing && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={editing.active} /> Active</label>}
            <Submit>{editing ? "Save" : "Add test"}</Submit>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
