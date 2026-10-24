import { eq, inArray } from "drizzle-orm";
import { ActionForm, Submit } from "@/components/form";
import { ArrowLeft, BookOpen, Pencil, Plus, TestTube } from "lucide-react";
import { Badge, Check, cx, EmptyState, Field, Input, LinkButton, PageHeader, Panel, Select, Table, Td } from "@/components/ui";
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
  const labCount = tests.filter((x) => x.test.kind === "lab").length;
  return (
    <>
      <PageHeader icon={<BookOpen />} eyebrow="Lab · setup" title="Test catalogue"
        subtitle={`${labCount} lab tests · ${tests.length - labCount} imaging studies — default units, reference ranges and billing.`}
        actions={<LinkButton variant="ghost" href="/lab"><ArrowLeft className="h-4 w-4" />Worklist</LinkButton>} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel eyebrow="Catalogue" title="Tests & studies" icon={<TestTube />}>
          {tests.length === 0 ? (
            <EmptyState icon={<TestTube />} title="No tests yet">Add your first test with the form — it will appear in lab orders straight away.</EmptyState>
          ) : (
            <Table head={["Test", "Kind", "Unit", "Reference range", "Billed as", ""]}>
              {tests.map(({ test: x, service, price }) => (
                <tr key={x.id} className={cx(!x.active && "opacity-50", x.id === editId && "bg-accent/10")}>
                  <Td>
                    <div className="flex items-center gap-2 font-medium">{x.name} {!x.active && <Badge>inactive</Badge>}</div>
                    {x.code && <div className="font-mono text-xs text-muted">{x.code}</div>}
                  </Td>
                  <Td>{x.kind === "imaging" ? <Badge tone="teal">imaging</Badge> : <Badge tone="purple">lab</Badge>}</Td>
                  <Td className="text-muted">{x.unit}</Td>
                  <Td className="font-mono text-xs">{x.refRange}</Td>
                  <Td>{service ? <span>{service} <span className="tabular-nums text-muted">· {money(price, cur)}</span></span> : <span className="text-subtle">not billed</span>}</Td>
                  <Td className="text-right"><LinkButton variant="ghost" size="sm" href={`/lab/tests?edit=${x.id}`} aria-label={`Edit ${x.name}`}><Pencil className="h-3.5 w-3.5" />Edit</LinkButton></Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Panel glow={!!editing} eyebrow={editing ? "Editing" : "New"} title={editing ? editing.name : "Add test"} icon={editing ? <Pencil /> : <Plus />}
            actions={editing && <LinkButton variant="ghost" size="sm" href="/lab/tests">New instead</LinkButton>}>
            <ActionForm key={editing?.id ?? "new"} action={saveLabTestAction} resetOnSuccess={!editing} className="space-y-4">
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <Field label="Name"><Input name="name" defaultValue={editing?.name} required placeholder="Full blood count" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Code"><Input name="code" defaultValue={editing?.code ?? ""} className="font-mono" /></Field>
                <Field label="Kind"><Select name="kind" defaultValue={editing?.kind ?? "lab"}><option value="lab">Lab</option><option value="imaging">Imaging</option></Select></Field>
                <Field label="Unit"><Input name="unit" defaultValue={editing?.unit ?? ""} placeholder="mmol/L" /></Field>
                <Field label="Reference range"><Input name="refRange" defaultValue={editing?.refRange ?? ""} placeholder="3.5-5.0" /></Field>
              </div>
              <Field label="Service (price)" hint="Create lab/imaging services under Settings to bill tests.">
                <Select name="serviceId" defaultValue={editing?.serviceId ?? ""}>
                  <option value="">Not billed</option>{svc.map((s) => <option key={s.id} value={s.id}>{s.name} · {money(s.price, cur)}</option>)}
                </Select>
              </Field>
              {editing && <Check name="active" defaultChecked={editing.active} label="Active" />}
              <div className="flex justify-end"><Submit>{editing ? "Save changes" : "Add test"}</Submit></div>
            </ActionForm>
          </Panel>
        </div>
      </div>
    </>
  );
}
