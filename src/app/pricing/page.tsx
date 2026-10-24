import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { cx } from "@/components/ui";
import { GRACE_DAYS, PLANS, SCRIBE_NOTES_CAP, SCRIBE_PRICE_USD, TRIAL_DAYS, type PlanKey } from "@/lib/plans";
import { SitePage } from "./site";

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

export default function PricingPage() {
  const plans = Object.entries(PLANS) as [PlanKey, (typeof PLANS)[PlanKey]][];
  return (
    <SitePage>
      <section className="bg-gradient-to-b from-brand-50/80 to-white">
        <div className="mx-auto max-w-6xl px-4 pb-6 pt-14 text-center sm:px-6 sm:pt-20">
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Simple, honest pricing</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            One monthly price per clinic. No setup fees, no per-patient charges, no add-on fees for reminders or backups.
          </p>
          <p className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-700">
            {[`${TRIAL_DAYS}-day free trial, no card`, "Annual: 2 months free", "30-day money-back guarantee", "Read-only, never locked out"].map((x) => (
              <span key={x} className="flex items-center gap-1.5"><Check className="h-4 w-4 text-brand-700" aria-hidden />{x}</span>
            ))}
          </p>
        </div>
      </section>

      <section aria-label="Plans" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {plans.map(([key, p]) => {
            const featured = key === "clinic";
            return (
              <div key={key} className={cx("relative flex flex-col rounded-2xl bg-white p-6 ring-1", featured ? "shadow-xl shadow-brand-900/10 ring-2 ring-brand-600" : "ring-slate-200")}>
                {featured && <span className="absolute -top-3 left-6 rounded-full bg-brand-700 px-3 py-0.5 text-xs font-medium text-white">Most popular</span>}
                <h2 className="text-lg font-semibold text-slate-900">{p.name}</h2>
                <p className="mt-1 text-sm text-slate-600">{BLURB[key]}</p>
                <p className="mt-5"><span className="text-4xl font-semibold tracking-tight text-slate-900">${p.priceUsd}</span><span className="text-slate-500">/month</span></p>
                <p className="mt-1 text-sm text-slate-500">or ${p.priceUsd * 10}/year (2 months free)</p>
                <ul className="mt-5 space-y-1.5 border-y border-slate-100 py-4 text-sm text-slate-700">
                  <li>Up to <strong>{p.practitioners}</strong> practitioner{p.practitioners === 1 ? "" : "s"} · {p.users} staff logins</li>
                  <li><strong>{p.reminders.toLocaleString("en")}</strong> WhatsApp/SMS reminders a month</li>
                  <li>{p.branches === 1 ? "1 location" : `Up to ${p.branches} branches`}</li>
                </ul>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-700">
                  {p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden />{FEATURE_LABELS[f] ?? f}</li>)}
                </ul>
                <Link href={`/signup?plan=${key}`} className={cx("mt-6 rounded-lg px-4 py-2.5 text-center font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600", featured ? "bg-brand-700 text-white hover:bg-brand-800" : "bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50")}>
                  Start free trial<span className="sr-only"> of {p.name}</span>
                </Link>
              </div>
            );
          })}
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-6 ring-1 ring-slate-200">
            <h2 className="font-semibold text-slate-900">AI Scribe add-on <span className="ml-1 text-slate-600">${SCRIBE_PRICE_USD}/practitioner/month</span></h2>
            <p className="mt-2 text-sm text-slate-600">
              Record the consultation with the patient&apos;s consent and get a draft SOAP note in seconds. The clinician always reviews, edits and signs —
              nothing is filed automatically. Fair use up to {SCRIBE_NOTES_CAP} notes per practitioner per month. Audio and transcripts are never used to train AI models.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-6 ring-1 ring-slate-200">
            <h2 className="font-semibold text-slate-900">Migration service <span className="ml-1 text-slate-600">$99–$299 one-time</span></h2>
            <p className="mt-2 text-sm text-slate-600">
              We import your patient list, outstanding balances and upcoming appointments from spreadsheets or your old system, so you start on day one with your history.
              $99 for a simple patient list; up to $299 for full records from another system.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="faq" className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6">
        <h2 id="faq" className="text-2xl font-semibold tracking-tight text-slate-900">Questions</h2>
        <dl className="mt-6 divide-y divide-slate-200">
          {FAQ.map(([q, a]) => (
            <div key={q} className="py-4"><dt className="font-medium text-slate-900">{q}</dt><dd className="mt-1 text-slate-600">{a}</dd></div>
          ))}
        </dl>
      </section>
    </SitePage>
  );
}
