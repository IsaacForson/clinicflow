import {
  BellRing, CalendarCheck, Check, CloudOff, CreditCard, Download, FileText, ListOrdered, Mic, ShieldCheck, Wallet, X,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PLANS, TRIAL_DAYS } from "@/lib/plans";
import { SitePage } from "./pricing/site";

export const metadata: Metadata = {
  title: { absolute: "ClinicFlow — Run your clinic without paper" },
  description: "Queue and walk-ins, patient records, billing with mobile money and insurance, and automatic WhatsApp reminders for private clinics in Ghana, Nigeria and Kenya. Keeps working when the internet drops.",
};

const HOOKS = [
  { icon: BellRing, title: "Cut no-shows with automatic WhatsApp reminders", body: "Patients get a reminder a day before and two hours before, in their language. Reply to confirm or reschedule." },
  { icon: Wallet, title: "Know your day's revenue before you close the door", body: "Every cedi, naira and shilling by cash, mobile money, card and insurance. Cash-up takes two minutes." },
  { icon: ShieldCheck, title: "No add-on fees. Your data is always yours.", body: "Reminders, backups and full data export are included in every plan. If you stop paying, you keep read access." },
];

const FEATURES = [
  { icon: ListOrdered, title: "Queue & walk-ins", body: "Walk-ins and booked patients in one live queue: waiting, with doctor, lab, billing, pharmacy. Everyone sees who is next." },
  { icon: FileText, title: "Patient records", body: "SOAP notes with specialty templates, vitals, diagnoses (ICD-10), prescriptions, lab results, referrals and documents in one timeline." },
  { icon: CreditCard, title: "Billing, mobile money & insurance", body: "Invoices from the consultation, MTN MoMo, M-Pesa and card via Paystack, insurer splits and claim batches, receipts and cash-up." },
  { icon: CalendarCheck, title: "WhatsApp & SMS reminders", body: "Appointment reminders, results-ready messages and follow-ups — with recorded consent and one-tap opt-out." },
  { icon: CloudOff, title: "Offline-tolerant", body: "Recent records stay viewable when the line drops. Notes and payments are saved on the device and sync when you reconnect." },
  { icon: Mic, title: "AI scribe add-on", body: "Record the consultation (with consent) and get a draft note. The clinician always reviews and signs — nothing is filed automatically." },
  { icon: Download, title: "Data export guarantee", body: "Download everything — patients, visits, invoices — as CSV any time, even on a read-only account. No exit fees, ever." },
];

const COMPARE: [string, string, string][] = [
  ["Price", "From $29/month, published", "Quote only, often per bed or per module"],
  ["Setup", "Same day — import your patient list", "Weeks of consultants and training"],
  ["Contract", "Monthly, cancel any time", "Multi-year with setup fees"],
  ["Works through unstable internet", "Yes", "Usually needs a constant connection or a local server"],
  ["WhatsApp reminders", "Included", "Extra module or not available"],
  ["Mobile money", "MoMo, M-Pesa, card built in", "Custom integration"],
  ["Data export", "Full CSV export, always free", "On request, sometimes charged"],
  ["Built for", "1–15 practitioner clinics", "Hospitals"],
];

export default function LandingPage() {
  return (
    <SitePage>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50/80 to-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-2 lg:pt-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-brand-800 ring-1 ring-brand-200">
              For private clinics in Ghana, Nigeria & Kenya
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Run your clinic without paper</h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              ClinicFlow brings your queue, patient records, billing and reminders into one simple system your front desk will actually use —
              and it keeps working when the internet doesn&apos;t.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-lg bg-brand-700 px-5 py-3 font-medium text-white shadow-sm hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
                Start your {TRIAL_DAYS}-day free trial
              </Link>
              <Link href="/pricing" className="rounded-lg bg-white px-5 py-3 font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50">See pricing</Link>
            </div>
            <p className="mt-3 text-sm text-slate-500">No card required · Set up in an afternoon · Cancel any time</p>
          </div>
          <ProductPreview />
        </div>
      </section>

      {/* Hooks */}
      <section aria-label="Why clinics switch" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-6 md:grid-cols-3">
          {HOOKS.map((h) => (
            <div key={h.title} className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
              <h.icon className="h-6 w-6 text-brand-700" aria-hidden />
              <h2 className="mt-4 text-lg font-semibold text-slate-900">{h.title}</h2>
              <p className="mt-2 text-slate-600">{h.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-16 bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Everything a busy clinic needs. Nothing it doesn&apos;t.</h2>
          <p className="mt-3 max-w-2xl text-slate-600">From the moment a patient walks in to the receipt in their hand — one flow, designed for front desks with a queue out the door.</p>
          <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-700 text-white"><f.icon className="h-5 w-5" aria-hidden /></span>
                <div>
                  <h3 className="font-semibold text-slate-900">{f.title}</h3>
                  <p className="mt-1 text-slate-600">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Offline */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid items-center gap-10 rounded-3xl bg-slate-900 p-8 text-white sm:p-12 lg:grid-cols-2">
          <div>
            <CloudOff className="h-8 w-8 text-brand-300" aria-hidden />
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">Light goes off. Network drops. Your clinic keeps going.</h2>
            <p className="mt-4 text-slate-300">
              Install ClinicFlow on any phone, tablet or laptop. Pages you&apos;ve opened stay readable offline, and consultation notes and payments are
              saved on the device, then synced the moment you&apos;re back online — with nothing lost and nothing counted twice.
            </p>
          </div>
          <ul className="space-y-3 text-slate-200">
            {["Works on low-cost Android phones and old laptops", "Uses very little data — no heavy downloads", "Notes merge safely if two people edited offline", "Payments are recorded once, even if sync retries"].map((x) => (
              <li key={x} className="flex gap-3"><Check className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" aria-hidden />{x}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Comparison */}
      <section aria-labelledby="compare" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-20">
        <h2 id="compare" className="text-3xl font-semibold tracking-tight text-slate-900">Built for clinics, not hospitals</h2>
        <p className="mt-3 max-w-2xl text-slate-600">Enterprise hospital systems are priced and designed for 200-bed facilities. ClinicFlow is built for a practice like yours.</p>
        <div className="mt-8 overflow-x-auto rounded-2xl ring-1 ring-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr><th scope="col" className="px-4 py-3 font-semibold text-slate-900"><span className="sr-only">Feature</span></th><th scope="col" className="px-4 py-3 font-semibold text-brand-800">ClinicFlow</th><th scope="col" className="px-4 py-3 font-semibold text-slate-600">Typical enterprise system</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {COMPARE.map(([k, us, them]) => (
                <tr key={k}>
                  <th scope="row" className="px-4 py-3 font-medium text-slate-900">{k}</th>
                  <td className="px-4 py-3 text-slate-900"><span className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />{us}</span></td>
                  <td className="px-4 py-3 text-slate-600"><span className="flex gap-2"><X className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />{them}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pricing teaser + CTA */}
      <section className="bg-brand-700">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-14 text-white sm:px-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Simple pricing from ${PLANS.solo.priceUsd}/month</h2>
            <p className="mt-2 text-brand-100">{TRIAL_DAYS}-day free trial, no card. 30-day money-back guarantee. Reminders and backups always included.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/signup" className="rounded-lg bg-white px-5 py-3 font-medium text-brand-800 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Start free trial</Link>
            <Link href="/pricing" className="rounded-lg px-5 py-3 font-medium text-white ring-1 ring-white/60 hover:bg-brand-600">Compare plans</Link>
          </div>
        </div>
      </section>
    </SitePage>
  );
}

/** Static illustration of the dashboard (decorative). */
function ProductPreview() {
  const bars = [40, 62, 48, 75, 58, 90, 70];
  return (
    <div aria-hidden className="rounded-2xl bg-white p-4 shadow-xl shadow-brand-900/10 ring-1 ring-slate-200 sm:p-6">
      <div className="flex items-center justify-between">
        <div><p className="text-xs text-slate-500">Today · Main branch</p><p className="font-semibold text-slate-900">Good morning, Dr. Mensah</p></div>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Synced</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[["Revenue today", "GH₵ 4,820"], ["Patients", "37"], ["No-shows", "4.2%"]].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">{k}</p><p className="mt-1 text-lg font-semibold text-slate-900">{v}</p></div>
        ))}
      </div>
      <div className="mt-4 flex h-28 items-end gap-2 rounded-lg bg-slate-50 p-3">
        {bars.map((h, i) => <div key={i} className="flex-1 rounded-t bg-brand-600" style={{ height: `${h}%` }} />)}
      </div>
      <ul className="mt-4 divide-y divide-slate-100 text-sm">
        {[["#12", "Ama Owusu", "With doctor", "bg-brand-50 text-brand-800"], ["#13", "Chinedu Okafor", "Waiting", "bg-slate-100 text-slate-700"], ["#14", "Wanjiru Kamau", "Billing", "bg-amber-50 text-amber-800"]].map(([n, name, s, c]) => (
          <li key={n} className="flex items-center justify-between py-2"><span><span className="mr-2 font-mono text-xs text-slate-400">{n}</span>{name}</span><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c}`}>{s}</span></li>
        ))}
      </ul>
    </div>
  );
}
