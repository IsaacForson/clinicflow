import { desc } from "drizzle-orm";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Card, Dl, Input, Table, Td } from "@/components/ui";
import { billingEvents } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { dateOnly, dateTime, money } from "@/lib/format";
import { PLANS, SCRIBE_PRICE_USD, type PlanKey } from "@/lib/plans";
import { checkoutAction, migrationCheckoutAction } from "./actions";
import { MIGRATION_TIERS, priceUsd } from "./pricing";

const STATUS_TONE = { trialing: "blue", active: "green", past_due: "yellow", read_only: "red", cancelled: "gray" } as const;

export default async function SubscriptionPage({ searchParams }: PageProps<"/settings/subscription">) {
  const ctx = await requireCtx("settings.manage");
  const t = ctx.tenant;
  const paid = (await searchParams).paid;
  const events = await tx(ctx, (x) => x.select().from(billingEvents).orderBy(desc(billingEvents.createdAt)).limit(50));
  return (
    <div className="space-y-4">
      {paid && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Thank you — your payment is being confirmed. This page updates once Paystack notifies us (usually within a minute).</p>}
      <Card title="Current subscription">
        <Dl items={[
          ["Plan", `${PLANS[t.plan].name} (${t.billingCycle})`],
          ["Status", <Badge key="s" tone={STATUS_TONE[t.planStatus]}>{t.planStatus.replace("_", " ")}</Badge>],
          ["Trial ends", t.planStatus === "trialing" ? dateOnly(t.trialEndsAt, t.timezone) : null],
          ["Current period ends", dateOnly(t.currentPeriodEnd, t.timezone)],
          ["AI scribe seats", `${t.scribeSeats} × $${SCRIBE_PRICE_USD}/month`],
          ["Access", ctx.access === "full" ? "Full" : "Read-only — your data is safe and can still be viewed and exported"],
        ]} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {(Object.keys(PLANS) as PlanKey[]).map((key) => {
          const p = PLANS[key];
          return (
            <Card key={key} title={<>{p.name} {key === t.plan && <Badge tone="teal">Current</Badge>}</>}>
              <p className="text-2xl font-semibold">${p.priceUsd}<span className="text-sm font-normal text-slate-500">/month</span></p>
              <p className="text-xs text-slate-500">or ${priceUsd(key, "annual", 0)}/year — 2 months free</p>
              <ul className="my-3 space-y-0.5 text-sm text-slate-600">
                <li>{p.practitioners} practitioner{p.practitioners === 1 ? "" : "s"}, {p.users} staff accounts</li>
                <li>{p.branches} branch{p.branches === 1 ? "" : "es"} · {p.reminders.toLocaleString()} reminders/month</li>
                <li className="capitalize">{p.features.filter((f) => f !== "records").join(", ").replace(/_/g, " ")}</li>
              </ul>
              <ActionForm action={checkoutAction} className="space-y-2">
                <input type="hidden" name="plan" value={key} />
                <div className="flex gap-3 text-sm">
                  <label className="flex items-center gap-1"><input type="radio" name="cycle" value="monthly" defaultChecked={t.billingCycle !== "annual"} /> Monthly</label>
                  <label className="flex items-center gap-1"><input type="radio" name="cycle" value="annual" defaultChecked={t.billingCycle === "annual"} /> Annual</label>
                </div>
                <label className="flex items-center gap-2 text-sm">AI scribe seats <Input name="scribeSeats" type="number" min={0} max={p.practitioners} defaultValue={Math.min(t.scribeSeats, p.practitioners)} className="w-20" /></label>
                <Submit className="w-full">{key === t.plan && t.planStatus === "active" ? "Renew / change seats" : `Choose ${p.name}`}</Submit>
              </ActionForm>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-slate-500">AI Scribe is ${SCRIBE_PRICE_USD} per practitioner per month. Reminders, backups and data export are included in every plan. If a payment lapses, your account becomes read-only — never locked.</p>

      <Card title="Done-for-you migration (one-off)">
        <div className="grid gap-3 sm:grid-cols-3">
          {Object.entries(MIGRATION_TIERS).map(([key, m]) => (
            <ActionForm key={key} action={migrationCheckoutAction} className="rounded-md p-3 ring-1 ring-slate-200">
              <input type="hidden" name="tier" value={key} />
              <p className="font-medium">{m.name} — ${m.priceUsd}</p>
              <p className="text-sm text-slate-600">{m.detail}</p>
              <Submit variant="secondary">Pay ${m.priceUsd}</Submit>
            </ActionForm>
          ))}
        </div>
      </Card>

      <Card title="Billing history">
        <Table head={["Date", "Event", "Amount", "Reference"]} empty="No payments yet.">
          {events.map((e) => (
            <tr key={e.id}>
              <Td>{dateTime(e.createdAt, t.timezone)}</Td>
              <Td>{e.type}</Td>
              <Td>{e.amountMinor != null ? money(e.amountMinor, e.currency ?? "USD") : ""}</Td>
              <Td className="font-mono text-xs">{e.providerRef}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
