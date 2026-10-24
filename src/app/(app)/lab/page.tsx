import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { ActionButton } from "@/components/form";
import { Badge, Card, LinkButton, PageHeader, Table, Tabs, Td } from "@/components/ui";
import { labOrderItems, labOrders, patients, users } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { dateTime, fullName } from "@/lib/format";
import { setLabStatusAction } from "./actions";
import { LAB_TONE } from "./flag";

export const metadata = { title: "Lab & imaging · ClinicFlow" };

const STATUSES = ["ordered", "collected", "resulted", "notified", "cancelled"] as const;

function ageOf(d: Date) {
  const m = Math.floor((Date.now() - d.getTime()) / 60_000);
  return m < 60 ? `${m}m` : m < 48 * 60 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
}

export default async function LabPage({ searchParams }: PageProps<"/lab">) {
  const ctx = await requireCtx("lab.result");
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status) ?? "ordered";
  const { rows, items } = await tx(ctx, async (t) => {
    const rows = await t.select({ o: labOrders, p: patients, doctor: users.name }).from(labOrders)
      .innerJoin(patients, eq(patients.id, labOrders.patientId)).leftJoin(users, eq(users.id, labOrders.orderedBy))
      .where(and(eq(labOrders.branchId, ctx.branchId), eq(labOrders.status, status)))
      .orderBy(status === "ordered" || status === "collected" ? labOrders.createdAt : desc(labOrders.createdAt)).limit(200);
    const items = rows.length ? await t.select({ orderId: labOrderItems.orderId, name: labOrderItems.name }).from(labOrderItems).where(inArray(labOrderItems.orderId, rows.map((r) => r.o.id))) : [];
    return { rows, items };
  });
  const tz = ctx.tenant.timezone;
  return (
    <>
      <PageHeader title="Lab & imaging" subtitle="Worklist for this branch."
        actions={<><LinkButton href="/lab/new">New lab order</LinkButton><LinkButton variant="secondary" href="/lab/tests">Test catalogue</LinkButton></>} />
      <Tabs current={status} tabs={STATUSES.map((s) => ({ key: s, href: `/lab?status=${s}`, label: s[0].toUpperCase() + s.slice(1) }))} />
      <Card>
        <Table head={["Ordered", "Age", "Patient", "Ordered by", "Tests", "Status", ""]} empty={`No ${status} orders.`}>
          {rows.map(({ o, p, doctor }) => (
            <tr key={o.id} className="hover:bg-slate-50">
              <Td>{dateTime(o.createdAt, tz)}</Td>
              <Td>{ageOf(o.createdAt)}</Td>
              <Td><Link href={`/lab/${o.id}`} className="font-medium text-teal-800 hover:underline">{fullName(p)}</Link> <span className="font-mono text-xs text-slate-500">{p.patientNo}</span></Td>
              <Td>{doctor ?? "—"}</Td>
              <Td className="max-w-xs truncate">{items.filter((i) => i.orderId === o.id).map((i) => i.name).join(", ")}</Td>
              <Td><Badge tone={LAB_TONE[o.status]}>{o.status}</Badge>{o.externalLab && <span className="ml-1 text-xs text-slate-500">→ {o.externalLab}</span>}</Td>
              <Td className="text-right">
                {o.status === "ordered" && <ActionButton action={setLabStatusAction} fields={{ id: o.id, status: "collected" }}>Sample collected</ActionButton>}
                {o.status !== "ordered" && <LinkButton variant="ghost" className="px-2 py-1 text-xs" href={`/lab/${o.id}`}>Open</LinkButton>}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
