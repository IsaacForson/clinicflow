import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Card, Empty, Input, PageHeader } from "@/components/ui";
import { messageLog, patients } from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { dateTime, fullName } from "@/lib/format";
import { quickReplyAction } from "../actions";
import { MessageTabs } from "../tabs";

export const metadata = { title: "Inbox · ClinicFlow" };

/** WhatsApp's 24h customer-service window for free-text replies. */
const inReplyWindow = (d: Date) => Date.now() - d.getTime() < 24 * 3600_000;

export default async function InboxPage() {
  const ctx = await requireCtx("messaging.send");
  const tz = ctx.tenant.timezone;
  const rows = await tx(ctx, async (t) => {
    await audit(t, ctx, "view", "message_inbox", null);
    const list = await t.select({ m: messageLog, p: { id: patients.id, firstName: patients.firstName, lastName: patients.lastName } })
      .from(messageLog).leftJoin(patients, eq(patients.id, messageLog.patientId))
      .where(eq(messageLog.direction, "in")).orderBy(desc(messageLog.createdAt)).limit(100);
    return list.map((r) => ({ ...r, open: inReplyWindow(r.m.createdAt) }));
  });

  return (
    <>
      <PageHeader title="Messages" subtitle="Replies from patients. Commands (1, 2, STOP, BP …) are handled automatically." />
      <MessageTabs current="inbox" />
      {rows.length === 0 ? <Empty title="No replies yet">Patients&apos; WhatsApp and SMS replies will show here.</Empty> : (
        <div className="space-y-3">
          {rows.map(({ m, p, open }) => {
            return (
              <Card key={m.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      {p ? <Link href={`/patients/${p.id}`} className="text-teal-800 hover:underline">{fullName(p)}</Link> : m.to}
                      <span className="ml-2 text-xs font-normal text-slate-500">{m.to} · {m.channel} · {dateTime(m.createdAt, tz)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{m.body}</p>
                  </div>
                  {m.templateKey?.startsWith("cmd:") && <Badge tone="teal">auto: {m.templateKey.slice(4)}</Badge>}
                </div>
                {open ? (
                  <ActionForm action={quickReplyAction} resetOnSuccess className="mt-3 flex gap-2 space-y-0">
                    <input type="hidden" name="inboundId" value={m.id} />
                    <Input name="body" placeholder="Quick reply…" required maxLength={1000} />
                    <Submit variant="secondary">Reply</Submit>
                  </ActionForm>
                ) : <p className="mt-2 text-xs text-slate-500">Reply window (24h) has closed — use <Link href={p ? `/messages/send?patient=${p.id}` : "/messages/send"} className="underline">Send message</Link>.</p>}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
