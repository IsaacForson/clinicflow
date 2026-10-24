import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import Link from "next/link";
import { Button, Card, Field, Input, LinkButton, Select, Table, Td } from "@/components/ui";
import { auditLog, patients, users } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { dateTime, dayRange, fullName } from "@/lib/format";

const PER_PAGE = 50;
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

export default async function AuditPage({ searchParams }: PageProps<"/settings/audit">) {
  const ctx = await requireCtx("audit.view");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const f = { user: str("user"), action: str("action"), entity: str("entity"), patient: str("patient"), from: day(sp.from), to: day(sp.to) };
  const pageNo = Math.max(1, Number(str("page")) || 1);
  const tz = ctx.tenant.timezone;

  const { rows, staff, patientMatch } = await tx(ctx, async (t) => {
    const staff = await t.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name));
    const [patientMatch] = f.patient ? await t.select({ id: patients.id }).from(patients).where(eq(patients.patientNo, f.patient.toUpperCase())) : [];
    const rows = f.patient && !patientMatch ? [] : await t.select({ a: auditLog, userName: users.name, p: { firstName: patients.firstName, lastName: patients.lastName, patientNo: patients.patientNo } })
      .from(auditLog).leftJoin(users, eq(users.id, auditLog.userId)).leftJoin(patients, eq(patients.id, auditLog.patientId))
      .where(and(
        f.user && /^[0-9a-f-]{36}$/.test(f.user) ? eq(auditLog.userId, f.user) : undefined,
        f.action ? eq(auditLog.action, f.action) : undefined,
        f.entity ? eq(auditLog.entity, f.entity) : undefined,
        patientMatch ? eq(auditLog.patientId, patientMatch.id) : undefined,
        f.from ? gte(auditLog.at, dayRange(f.from, tz).start) : undefined,
        f.to ? lt(auditLog.at, dayRange(f.to, tz).end) : undefined,
      )).orderBy(desc(auditLog.at)).limit(PER_PAGE + 1).offset((pageNo - 1) * PER_PAGE);
    return { rows, staff, patientMatch };
  });
  const qs = (page: number) => "?" + new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page: String(page) });

  return (
    <Card title="Audit log">
      <form className="mb-4 grid items-end gap-2 sm:grid-cols-7">
        <Field label="Staff">
          <Select name="user" defaultValue={f.user}><option value="">Anyone</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        </Field>
        <Field label="Action"><Input name="action" defaultValue={f.action} placeholder="view, update…" list="audit-actions" /></Field>
        <Field label="Record type"><Input name="entity" defaultValue={f.entity} placeholder="patient, invoice…" /></Field>
        <Field label="Patient no."><Input name="patient" defaultValue={f.patient} placeholder="P-000001" /></Field>
        <Field label="From"><Input name="from" type="date" defaultValue={f.from} /></Field>
        <Field label="To"><Input name="to" type="date" defaultValue={f.to} /></Field>
        <div className="flex gap-2"><Button type="submit">Filter</Button><LinkButton href="/settings/audit" variant="ghost">Clear</LinkButton></div>
        <datalist id="audit-actions">{["view", "create", "update", "delete", "sign", "export", "download", "login", "print", "send", "merge", "void"].map((a) => <option key={a} value={a} />)}</datalist>
      </form>
      {f.patient && !patientMatch && <p className="mb-2 text-sm text-amber-700">No patient with number {f.patient}.</p>}
      <Table head={["When", "Who", "Action", "Record", "Patient", "Details", "IP"]} empty="No matching entries.">
        {rows.slice(0, PER_PAGE).map(({ a, userName, p }) => (
          <tr key={a.id}>
            <Td>{dateTime(a.at, tz, { dateStyle: "medium", timeStyle: "medium" })}</Td>
            <Td>{userName ?? (a.userId ? "Unknown" : (a.details as { apiKeyId?: string } | null)?.apiKeyId ? "API key" : "System")}</Td>
            <Td>{a.action}</Td>
            <Td>{a.entity}{a.entityId && <span className="ml-1 font-mono text-xs text-slate-400">{a.entityId.slice(0, 8)}</span>}</Td>
            <Td>{p?.patientNo && <Link href={`/patients/${a.patientId}`} className="text-brand-800 hover:underline">{fullName(p)} ({p.patientNo})</Link>}</Td>
            <Td className="max-w-xs truncate font-mono text-xs" title={a.details ? JSON.stringify(a.details) : ""}>{a.details ? JSON.stringify(a.details) : ""}</Td>
            <Td className="text-xs">{a.ip}</Td>
          </tr>
        ))}
      </Table>
      <div className="mt-3 flex justify-between text-sm">
        {pageNo > 1 ? <Link href={qs(pageNo - 1)} className="text-brand-800 hover:underline">← Newer</Link> : <span />}
        <span className="text-slate-500">Page {pageNo}</span>
        {rows.length > PER_PAGE ? <Link href={qs(pageNo + 1)} className="text-brand-800 hover:underline">Older →</Link> : <span />}
      </div>
    </Card>
  );
}
