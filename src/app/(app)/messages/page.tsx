import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import Link from "next/link";
import { Badge, Card, Input, PageHeader, Select, Stat, Table, Td } from "@/components/ui";
import { messageLog, patients } from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { addDays, dateTime, dayRange, fullName, localDay } from "@/lib/format";
import { PLANS } from "@/lib/plans";
import { MessageTabs } from "./tabs";

export const metadata = { title: "Messages" };

const STATUS_TONE = { queued: "gray", sent: "blue", delivered: "teal", read: "green", failed: "red", skipped: "yellow" } as const;
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const pick = <T extends string>(v: unknown, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : undefined);

export default async function MessagesPage({ searchParams }: PageProps<"/messages">) {
  const ctx = await requireCtx("messaging.send");
  const sp = await searchParams;
  const tz = ctx.tenant.timezone;
  const today = localDay(tz);
  const f = {
    channel: pick(sp.channel, ["whatsapp", "sms", "email"] as const),
    status: pick(sp.status, ["queued", "sent", "delivered", "read", "failed", "skipped"] as const),
    purpose: typeof sp.purpose === "string" && sp.purpose ? sp.purpose : undefined,
    from: day(sp.from), to: day(sp.to), q: String(sp.q ?? "").trim(),
  };
  const monthStart = dayRange(`${today.slice(0, 7)}-01`, tz).start;
  const allowance = PLANS[ctx.tenant.plan].reminders;

  const { rows, used, purposes } = await tx(ctx, async (t) => {
    const like = `%${f.q}%`;
    const rows = await t.select({ m: messageLog, p: { id: patients.id, firstName: patients.firstName, lastName: patients.lastName, patientNo: patients.patientNo } })
      .from(messageLog).leftJoin(patients, eq(patients.id, messageLog.patientId))
      .where(and(
        f.channel ? eq(messageLog.channel, f.channel) : undefined, f.status ? eq(messageLog.status, f.status) : undefined,
        f.purpose ? eq(messageLog.purpose, f.purpose) : undefined,
        f.from ? gte(messageLog.createdAt, dayRange(f.from, tz).start) : undefined, f.to ? lt(messageLog.createdAt, dayRange(f.to, tz).end) : undefined,
        f.q ? or(ilike(patients.patientNo, like), ilike(sql`${patients.firstName} || ' ' || ${patients.lastName}`, like), ilike(messageLog.to, like)) : undefined,
      )).orderBy(desc(messageLog.createdAt)).limit(200);
    const [{ used }] = await t.select({ used: sql<number>`count(*)::int` }).from(messageLog)
      .where(and(eq(messageLog.direction, "out"), gte(messageLog.createdAt, monthStart), inArray(messageLog.status, ["queued", "sent", "delivered", "read"])));
    const purposes = (await t.selectDistinct({ purpose: messageLog.purpose }).from(messageLog)).map((r) => r.purpose).sort();
    await audit(t, ctx, "view", "message_log", null, { details: f });
    return { rows, used, purposes };
  });
  const over = used - allowance;

  return (
    <>
      <PageHeader title="Messages" subtitle="WhatsApp first, SMS fallback. Every message records its purpose and consent." />
      <MessageTabs current="log" />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Sent this month" value={used} sub={`of ${allowance} included in ${PLANS[ctx.tenant.plan].name}`} />
        <div className="rounded-lg bg-white p-4 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200 sm:col-span-2">
          <div className="mb-2 h-2 overflow-hidden rounded bg-slate-100"><div className={over > 0 ? "h-full bg-amber-500" : "h-full bg-teal-600"} style={{ width: `${Math.min(100, (used / Math.max(allowance, 1)) * 100)}%` }} /></div>
          {over > 0
            ? <>You are {over} messages over your monthly allowance. Extra messages are billed at provider cost on your next invoice; reminders are never paused.</>
            : <>{allowance - used} included messages left this month. Reminders keep sending even above the allowance (billed at provider cost).</>}
        </div>
      </div>
      <Card>
        <form className="mb-3 grid gap-2 sm:grid-cols-7">
          <Input name="q" defaultValue={f.q} placeholder="Patient or number…" className="sm:col-span-2" />
          <Select name="channel" defaultValue={f.channel ?? ""}><option value="">All channels</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="email">Email</option></Select>
          <Select name="status" defaultValue={f.status ?? ""}><option value="">All statuses</option>{Object.keys(STATUS_TONE).map((s) => <option key={s}>{s}</option>)}</Select>
          <Select name="purpose" defaultValue={f.purpose ?? ""}><option value="">All purposes</option>{purposes.map((p) => <option key={p}>{p}</option>)}</Select>
          <Input type="date" name="from" defaultValue={f.from} max={today} aria-label="From" />
          <div className="flex gap-2"><Input type="date" name="to" defaultValue={f.to} max={addDays(today, 1)} aria-label="To" /><button className="rounded-md bg-slate-800 px-3 text-sm text-white">Filter</button></div>
        </form>
        <Table head={["When", "Patient", "", "Channel", "Purpose", "Message", "Status"]} empty="No messages match.">
          {rows.map(({ m, p }) => (
            <tr key={m.id} className="align-top">
              <Td className="text-xs">{dateTime(m.createdAt, tz)}</Td>
              <Td>{p ? <Link href={`/patients/${p.id}`} className="text-teal-800 hover:underline">{fullName(p)}</Link> : <span className="text-slate-500">{m.to}</span>}</Td>
              <Td><Badge tone={m.direction === "in" ? "purple" : "gray"}>{m.direction === "in" ? "in" : "out"}</Badge></Td>
              <Td className="capitalize">{m.channel}</Td>
              <Td>{m.purpose}</Td>
              <Td className="max-w-md whitespace-normal text-xs text-slate-600">{m.body}{m.error && <div className="text-red-600">{m.error}</div>}</Td>
              <Td><Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge></Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
