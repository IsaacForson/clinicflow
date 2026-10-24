import { ArrowRight, Check, ChevronDown, Minus, Mic, Upload } from "lucide-react";
import type { Metadata } from "next";
import { Badge, cx, IconTile, LinkButton } from "@/components/ui";
import { GRACE_DAYS, PLANS, SCRIBE_NOTES_CAP, SCRIBE_PRICE_USD, TRIAL_DAYS, type PlanKey } from "@/lib/plans";
import { CtaBand, Eyebrow, SitePage } from "./site";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Solo $${PLANS.solo.priceUsd}, Clinic $${PLANS.clinic.priceUsd}, Group $${PLANS.group.priceUsd} per month. ${TRIAL_DAYS}-day free trial, no card. Reminders, backups and data export always included.`,
};

const FEATURE_LABELS: Record<string, string> = {
  appointments: "Appointments & online booking", records: "Patient records & consultation notes", billing: "Billing, receipts & mobile money",
  export: "Full data export & daily backups", queue: "Live queue & walk-ins", lab: "Lab & imaging orders and results", dispensary: "Pharmacy & stock",
  insurance: "Insurance splits & claim batches", branding: "Your logo on receipts & letters", multi_branch: "Multiple branches", api: "API & webhooks", accounting: "Accounting exports",
};

const BLURB: Record<PlanKey, string> = {
  solo: "For a single practitioner with a front desk.",
  clinic: "For a growing clinic with a lab or dispensary.",
  group: "For multi-doctor practices and branches.",
};

const FAQ: [string, string][] = [
  ["Do I need a card to start?", `No. Every plan starts with a ${TRIAL_DAYS}-day free trial with all features on. You only add payment when you choose a plan.`],
  ["How does annual billing work?", "Pay for 10 months and get 12 — two months free on any plan."],
  ["What if I'm not happy?", "Ask for a refund within 30 days of your first payment and we'll return it in full. No forms, no questions."],
  ["What happens if we stop paying?", `Nothing is deleted and you're never locked out. After a ${GRACE_DAYS}-day grace period the account becomes read-only: you can still view every record and export all your data.`],
  ["Can you move our existing records?", "Yes. Our migration service imports patients, balances and appointments from spreadsheets or your old system — $99 for a simple patient list, up to $299 for full history from another system."],
  ["Are reminders extra?", "No. WhatsApp and SMS reminders are included in every plan up to the monthly allowance shown — reminders, backups and data export are never paid add-ons."],
  ["Which payment methods do you accept?", "Card and mobile money through Paystack, billed in US dollars or your local currency equivalent."],
];

const plans = Object.entries(PLANS) as [PlanKey, (typeof PLANS)[PlanKey]][];

export default function PricingPage() {
  return (
    <SitePage>
      {/* Billing period toggle is CSS-only (radio + :has), so it works before/without JS. */}
      <div className="group/bill">
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute left-1/2 top-[-10rem] h-[28rem] w-[48rem] -translate-x-1/2 rounded-full bg-accent/25 blur-[120px]" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-16 text-center sm:px-6 sm:pt-24">
            <div className="animate-rise"><Eyebrow>Pricing</Eyebrow></div>
            <h1 className="mx-auto mt-6 max-w-3xl animate-rise text-5xl font-semibold leading-[1.03] tracking-[-0.045em] text-fg [animation-delay:80ms] sm:text-7xl">
              Simple, <span className="text-aurora">honest</span> pricing.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl animate-rise text-lg text-muted [animation-delay:160ms]">
              One monthly price per clinic. No setup fees, no per-patient charges, no add-on fees for reminders or backups.
            </p>

            <fieldset className="mt-9 inline-flex animate-rise rounded-2xl border border-line bg-surface p-1 backdrop-blur [animation-delay:240ms]">
              <legend className="sr-only">Billing period</legend>
              {[["monthly", "Monthly"], ["annual", "Annual"]].map(([v, label]) => (
                <label key={v} className="relative flex cursor-pointer items-center gap-2 rounded-xl px-5 py-2 text-sm font-medium text-muted transition has-[:checked]:bg-surface-3 has-[:checked]:text-fg has-[:checked]:shadow-[inset_0_0_0_1px_var(--line-strong)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
                  <input type="radio" name="billing" id={`bill-${v}`} value={v} defaultChecked={v === "monthly"} className="sr-only" />
                  {label}
                  {v === "annual" && <span className="rounded-md bg-ok/12 px-1.5 py-0.5 text-[10px] font-semibold text-ok">2 months free</span>}
                </label>
              ))}
            </fieldset>

            <ul className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted">
              {[`${TRIAL_DAYS}-day free trial, no card`, "30-day money-back guarantee", "Read-only, never locked out"].map((x) => (
                <li key={x} className="flex items-center gap-1.5"><Check className="h-4 w-4 text-ok" aria-hidden />{x}</li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-label="Plans" className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
          <div className="grid gap-5 lg:grid-cols-3">
            {plans.map(([key, p], i) => {
              const featured = key === "clinic";
              return (
                <article id={key} key={key} className={cx("glass relative flex scroll-mt-28 flex-col p-7 animate-rise", featured && "ring-aurora shadow-glow lg:-my-3 lg:py-10")} style={{ animationDelay: `${300 + i * 80}ms` }}>
                  {featured && <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-aurora opacity-20 blur-3xl" aria-hidden />}
                  <div className="relative flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-fg">{p.name}</h2>
                    {featured && <Badge tone="purple">Most popular</Badge>}
                  </div>
                  <p className="relative mt-1 text-sm text-muted">{BLURB[key]}</p>

                  <div className="relative mt-6 group-has-[#bill-annual:checked]/bill:hidden">
                    <p><span className="text-5xl font-semibold tracking-[-0.04em] text-fg tabular-nums">${p.priceUsd}</span><span className="text-muted">/month</span></p>
                    <p className="mt-1.5 text-sm text-subtle">or ${p.priceUsd * 10}/year (2 months free)</p>
                  </div>
                  <div className="relative mt-6 hidden group-has-[#bill-annual:checked]/bill:block">
                    <p><span className="text-5xl font-semibold tracking-[-0.04em] text-fg tabular-nums">${p.priceUsd * 10}</span><span className="text-muted">/year</span></p>
                    <p className="mt-1.5 text-sm text-ok">2 months free · ${p.priceUsd * 2} saved</p>
                  </div>

                  <dl className="relative mt-6 grid grid-cols-3 gap-2 rounded-2xl border border-line bg-surface p-3 text-center">
                    {[["Practitioners", p.practitioners], ["Staff logins", p.users], ["Reminders/mo", p.reminders.toLocaleString("en")]].map(([k, v]) => (
                      <div key={k} className="flex flex-col-reverse"><dt className="text-[10px] uppercase tracking-[0.12em] text-subtle">{k}</dt><dd className="text-lg font-semibold text-fg tabular-nums">{v}</dd></div>
                    ))}
                  </dl>

                  <ul className="relative mt-6 flex-1 space-y-2.5 text-sm text-fg">
                    <li className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-2" aria-hidden />{p.branches === 1 ? "1 location" : `Up to ${p.branches} branches`}</li>
                    {p.features.map((f) => <li key={f} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-2" aria-hidden />{FEATURE_LABELS[f] ?? f}</li>)}
                  </ul>
                  <LinkButton href={`/signup?plan=${key}`} variant={featured ? "primary" : "secondary"} size="lg" className="relative mt-8 w-full">
                    Start free trial<span className="sr-only"> of {p.name}</span>
                  </LinkButton>
                </article>
              );
            })}
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <AddOn icon={<Mic />} title="AI Scribe add-on" price={`$${SCRIBE_PRICE_USD}/practitioner/month`}>
              Record the consultation with the patient&apos;s consent and get a draft SOAP note in seconds. The clinician always reviews, edits and signs —
              nothing is filed automatically. Fair use up to {SCRIBE_NOTES_CAP} notes per practitioner per month. Audio and transcripts are never used to train AI models.
            </AddOn>
            <AddOn icon={<Upload />} title="Migration service" price="$99–$299 one-time">
              We import your patient list, outstanding balances and upcoming appointments from spreadsheets or your old system, so you start on day one with your history.
              $99 for a simple patient list; up to $299 for full records from another system.
            </AddOn>
          </div>
        </section>
      </div>

      {/* Compare matrix */}
      <section aria-labelledby="matrix" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 id="matrix" className="text-3xl font-semibold tracking-[-0.03em] text-fg sm:text-4xl">Compare plans</h2>
        <div className="glass mt-8 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="px-5 py-4 text-left"><span className="sr-only">Feature</span></th>
                {plans.map(([k, p]) => <th key={k} scope="col" className={cx("px-5 py-4 text-center font-semibold text-fg", k === "clinic" && "bg-accent/10")}>{p.name}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {Object.entries(FEATURE_LABELS).map(([f, label]) => (
                <tr key={f}>
                  <th scope="row" className="whitespace-nowrap px-5 py-3.5 text-left font-normal text-muted">{label}</th>
                  {plans.map(([k, p]) => (
                    <td key={k} className={cx("px-5 py-3.5 text-center", k === "clinic" && "bg-accent/10")}>
                      {(p.features as readonly string[]).includes(f)
                        ? <Check className="mx-auto h-4 w-4 text-ok" aria-label="Included" />
                        : <Minus className="mx-auto h-4 w-4 text-subtle" aria-label="Not included" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq" className="mx-auto grid max-w-6xl gap-10 px-4 pb-24 sm:px-6 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <Eyebrow>FAQ</Eyebrow>
          <h2 id="faq" className="mt-5 text-3xl font-semibold tracking-[-0.03em] text-fg sm:text-4xl">Questions, answered.</h2>
          <p className="mt-4 text-muted">Anything else? Start a trial and message us from inside the app.</p>
          <LinkButton href="/signup" variant="ghost" className="mt-4 -ml-4">Start free trial <ArrowRight className="h-4 w-4" aria-hidden /></LinkButton>
        </div>
        <div className="space-y-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className="glass group p-0 open:border-line-strong">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium text-fg [&::-webkit-details-marker]:hidden">
                {q}<ChevronDown className="h-4 w-4 shrink-0 text-subtle transition group-open:rotate-180" aria-hidden />
              </summary>
              <p className="px-5 pb-5 leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <CtaBand title={<>Try every feature, <span className="text-aurora">free for {TRIAL_DAYS} days.</span></>} body="No card required. Pick a plan when you're ready — or don't, and export everything you entered." />
    </SitePage>
  );
}

function AddOn({ icon, title, price, children }: { icon: React.ReactNode; title: string; price: string; children: React.ReactNode }) {
  return (
    <div className="glass flex gap-4 p-6">
      <IconTile>{icon}</IconTile>
      <div>
        <h2 className="font-semibold text-fg">{title} <span className="ml-1 text-sm font-medium text-accent">{price}</span></h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>
      </div>
    </div>
  );
}
