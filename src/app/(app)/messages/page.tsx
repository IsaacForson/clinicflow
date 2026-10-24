import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Filter, MessagesSquare, Search, Send } from "lucide-react";
import { Badge, Button, cx, Input, Kpi, LinkButton, PageHeader, Panel, Progress, Select, Table, Td } from "@/components/ui";
import { ChannelIcon } from "./channel-icon";
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
      <PageHeader icon={<MessagesSquare />} eyebrow="Patient messaging" title="Messages" subtitle="WhatsApp first, SMS fallback. Every message records its purpose and consent."
        actions={<LinkButton href="/messages/send"><Send className="h-4 w-4" />Send message</LinkButton>} />
      <MessageTabs current="log" />
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Kpi label="Sent this month" icon={<ArrowUpRight />} value={used} sub={`of ${allowance} included in ${PLANS[ctx.tenant.plan].name}`} />
        <div className="glass animate-rise p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">Monthly allowance</span>
            <Badge tone={over > 0 ? "yellow" : "green"}>{over > 0 ? `${over} over` : `${allowance - used} left`}</Badge>
          </div>
          <div className="mt-4 flex items-end justify-between text-sm"><span className="font-semibold tabular-nums text-fg">{used}</span><span className="tabular-nums text-muted">{allowance}</span></div>
          <Progress className="mt-2 h-2" tone={over > 0 ? "yellow" : "purple"} value={(used / Math.max(allowance, 1)) * 100} />
          <p className="mt-3 text-sm text-muted">
            {over > 0
              ? <>You are {over} messages over your monthly allowance. Extra messages are billed at provider cost on your next invoice; reminders are never paused.</>
              : <>{allowance - used} included messages left this month. Reminders keep sending even above the allowance (billed at provider cost).</>}
          </p>
        </div>
      </div>
      <Panel eyebrow="Log" title={`${rows.length} message${rows.length === 1 ? "" : "s"}`}>
        <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input name="q" defaultValue={f.q} placeholder="Patient or number…" className="pl-10" aria-label="Search" />
          </div>
          <Select name="channel" defaultValue={f.channel ?? ""} aria-label="Channel"><option value="">All channels</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="email">Email</option></Select>
          <Select name="status" defaultValue={f.status ?? ""} aria-label="Status"><option value="">All statuses</option>{Object.keys(STATUS_TONE).map((s) => <option key={s}>{s}</option>)}</Select>
          <Select name="purpose" defaultValue={f.purpose ?? ""} aria-label="Purpose"><option value="">All purposes</option>{purposes.map((p) => <option key={p}>{p}</option>)}</Select>
          <Input type="date" name="from" defaultValue={f.from} max={today} aria-label="From" />
          <div className="flex gap-2"><Input type="date" name="to" defaultValue={f.to} max={addDays(today, 1)} aria-label="To" /><Button variant="secondary" aria-label="Filter"><Filter className="h-4 w-4" /></Button></div>
        </form>
        <Table head={["", "Patient", "Purpose", "Message", "Status", "When"]} empty="No messages match these filters.">
          {rows.map(({ m, p }) => (
            <tr key={m.id} className="align-top">
              <Td className="pr-0"><div className="flex items-center gap-1.5"><ChannelIcon channel={m.channel} />{m.direction === "in" ? <ArrowDownLeft className="h-3.5 w-3.5 text-accent" aria-label="inbound" /> : <ArrowUpRight className="h-3.5 w-3.5 text-subtle" aria-label="outbound" />}</div></Td>
              <Td>{p ? <Link href={`/patients/${p.id}`} className="font-medium text-fg hover:text-accent">{fullName(p)}</Link> : <span className="text-muted">{m.to}</span>}{p && <div className="font-mono text-xs text-muted">{p.patientNo}</div>}</Td>
              <Td><span className="rounded-md bg-surface-3 px-2 py-0.5 text-xs text-muted">{m.purpose}</span></Td>
              <Td className={cx("min-w-64 max-w-md whitespace-normal text-xs", m.direction === "in" ? "text-fg" : "text-muted")}>{m.body}{m.error && <div className="mt-1 text-bad">{m.error}</div>}</Td>
              <Td><Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge></Td>
              <Td className="text-xs text-muted">{dateTime(m.createdAt, tz)}</Td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
