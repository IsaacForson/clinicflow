import {
  ArrowRight, BellRing, Check, CloudOff, CreditCard, Download, FileText, ListOrdered, MessageCircle, Mic, Smartphone, Upload, Wallet, X,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/app/(app)/nav";
import { Avatar, Badge, cx, IconTile, LinkButton, Sparkline } from "@/components/ui";
import { PLANS, TRIAL_DAYS, type PlanKey } from "@/lib/plans";
import { Price, PriceCurrencySwitcher } from "./pricing/price";
import { CtaBand, Eyebrow, SitePage } from "./pricing/site";

export const metadata: Metadata = {
  title: { absolute: "ClinicFlow — Run your clinic without paper" },
  description: "Queue and walk-ins, patient records, billing with mobile money and insurance, and automatic WhatsApp reminders for private clinics in Ghana, Nigeria and Kenya. Keeps working when the internet drops.",
};

const TRUST = ["MTN MoMo", "M-Pesa", "Paystack card", "WhatsApp & SMS", "ICD-10", "Insurance claims", "Works offline"];

const STEPS = [
  { icon: Smartphone, title: "Start your trial", body: `${TRIAL_DAYS} days, every feature on, no card. Works on the phones, tablets and laptops you already have.` },
  { icon: Upload, title: "Bring your patients", body: "Import your patient list the same day — or let our migration service move your history for you." },
  { icon: ListOrdered, title: "Open the queue", body: "Front desk checks patients in. Doctors, lab, billing and pharmacy all see who is next." },
  { icon: Wallet, title: "Get paid, stay full", body: "Receipts by cash, MoMo, M-Pesa or card. Reminders go out on their own, so fewer chairs sit empty." },
];

const COMPARE: [string, string, string][] = [
  ["Price", "Published monthly price in your currency", "Quote only, often per bed or per module"],
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
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 top-[-12rem] h-[36rem] w-[56rem] -translate-x-1/2 rounded-full bg-accent/25 blur-[120px]" aria-hidden />
        <div className="pointer-events-none absolute right-[-8rem] top-40 h-80 w-80 rounded-full bg-accent-2/20 blur-[100px]" aria-hidden />
        <div className="pointer-events-none absolute left-[-6rem] top-[28rem] h-72 w-72 rounded-full bg-accent-3/15 blur-[100px]" aria-hidden />

        <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-16 text-center sm:px-6 sm:pt-24">
          <div className="animate-rise"><Eyebrow>For private clinics in Ghana, Nigeria &amp; Kenya</Eyebrow></div>
          <h1 className="mx-auto mt-6 max-w-4xl animate-rise text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.045em] text-fg [animation-delay:80ms] sm:text-7xl">
            Run your clinic <span className="text-aurora">without paper.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl animate-rise text-lg leading-relaxed text-muted [animation-delay:160ms] sm:text-xl">
            Queue, patient records, billing and reminders in one calm system your front desk will actually use — and it keeps working when the internet doesn&apos;t.
          </p>
          <div className="mt-9 flex animate-rise flex-wrap justify-center gap-3 [animation-delay:240ms]">
            <LinkButton href="/signup" size="lg">Start your {TRIAL_DAYS}-day free trial <ArrowRight className="h-4 w-4" aria-hidden /></LinkButton>
            <LinkButton href="/pricing" size="lg" variant="secondary">See pricing</LinkButton>
          </div>
          <p className="mt-4 animate-rise text-sm text-subtle [animation-delay:300ms]">No card required · Set up in an afternoon · Cancel any time</p>
        </div>

        <ProductMockup />
      </section>

      {/* Trust strip */}
      <section aria-label="Built in" className="border-y border-line bg-surface/50">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-7 sm:px-6 md:flex-row md:justify-between">
          <p className="shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-subtle">Built in, not bolted on</p>
          <ul className="flex flex-wrap justify-center gap-x-7 gap-y-2 text-sm font-medium text-muted">
            {TRUST.map((t) => <li key={t} className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-accent-2" aria-hidden />{t}</li>)}
          </ul>
        </div>
      </section>

      {/* Bento features */}
      <section id="features" aria-labelledby="features-title" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-24 sm:px-6 sm:py-32">
        <SectionHead id="features-title" eyebrow="One flow, door to receipt" title={<>Everything a busy clinic needs. <span className="text-subtle">Nothing it doesn&apos;t.</span></>}>
          From the moment a patient walks in to the receipt in their hand — designed for front desks with a queue out the door.
        </SectionHead>

        <div className="mt-14 grid gap-4 lg:grid-cols-6">
          <Bento className="lg:col-span-4" icon={<ListOrdered />} title="Queue & walk-ins" body="Walk-ins and booked patients in one live queue: waiting, with doctor, lab, billing, pharmacy. Everyone sees who is next.">
            <div className="mt-6 grid grid-cols-3 gap-2 text-xs" aria-hidden>
              {[["Waiting", 3, "gray"], ["With doctor", 2, "purple"], ["Billing", 1, "yellow"]].map(([l, n, tone], i) => (
                <div key={l as string} className="rounded-xl border border-line bg-surface p-2.5">
                  <div className="flex items-center justify-between text-subtle"><span>{l}</span><span className="tabular-nums">{n}</span></div>
                  {Array.from({ length: n as number }, (_, j) => (
                    <div key={j} className="mt-2 flex items-center gap-2 rounded-lg bg-surface-2 p-1.5">
                      <span className={cx("h-1.5 w-1.5 rounded-full", tone === "purple" ? "bg-accent" : tone === "yellow" ? "bg-warn" : "bg-subtle")} />
                      <span className="h-1.5 flex-1 rounded-full bg-surface-3" style={{ maxWidth: `${60 + ((i + j) % 3) * 15}%` }} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Bento>

          <Bento className="lg:col-span-2" icon={<BellRing />} tone="teal" title="Cut no-shows on autopilot" body="WhatsApp and SMS reminders a day before and two hours before, in the patient's language — with recorded consent and one-tap opt-out.">
            <div className="mt-6 space-y-2 text-xs" aria-hidden>
              <p className="max-w-[85%] rounded-2xl rounded-bl-md border border-line bg-surface-2 px-3 py-2 text-muted">Reminder: your appointment is tomorrow at 10:30. Reply 1 to confirm.</p>
              <p className="ml-auto w-fit rounded-2xl rounded-br-md bg-accent-2/15 px-3 py-2 font-medium text-accent-2">1</p>
            </div>
          </Bento>

          <Bento className="lg:col-span-2" icon={<CreditCard />} tone="green" title="Billing, mobile money & insurance" body="Invoices from the consultation. MoMo, M-Pesa and card via Paystack, insurer splits and claim batches, receipts and a two-minute cash-up.">
            <ul className="mt-6 space-y-1.5 text-xs tabular-nums" aria-hidden>
              {[["Cash", "GH₵ 1,240"], ["Mobile money", "GH₵ 2,310"], ["Insurance", "GH₵ 1,270"]].map(([k, v]) => (
                <li key={k} className="flex justify-between rounded-lg bg-surface-2 px-3 py-2"><span className="text-muted">{k}</span><span className="font-medium text-fg">{v}</span></li>
              ))}
            </ul>
          </Bento>

          <Bento className="lg:col-span-2" icon={<FileText />} title="Patient records" body="SOAP notes with specialty templates, vitals, ICD-10 diagnoses, prescriptions, lab results, referrals and documents in one timeline." />

          <Bento className="lg:col-span-2" icon={<CloudOff />} tone="blue" title="Offline-tolerant" body="Recent records stay viewable when the line drops. Notes and payments are saved on the device and sync when you reconnect." />

          <Bento className="lg:col-span-3" icon={<Mic />} title="AI scribe add-on" body="Record the consultation (with consent) and get a draft note. The clinician always reviews and signs — nothing is filed automatically.">
            <div className="mt-6 flex h-10 items-center gap-[3px]" aria-hidden>
              {Array.from({ length: 48 }, (_, i) => (
                <span key={i} className="flex-1 rounded-full bg-gradient-to-t from-accent/40 to-accent-2/80" style={{ height: `${20 + Math.abs(Math.sin(i * 0.7) * 80)}%` }} />
              ))}
            </div>
          </Bento>

          <Bento className="lg:col-span-3" icon={<Download />} tone="teal" title="No add-on fees. Your data is always yours." body="Reminders, backups and full CSV export are in every plan — even on a read-only account. If you stop paying, you keep read access. No exit fees, ever." />
        </div>
      </section>

      {/* Offline spotlight */}
      <section aria-labelledby="offline-title" className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="glass relative grid items-center gap-10 overflow-hidden p-8 sm:p-12 lg:grid-cols-2">
          <div className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-accent-2/15 blur-3xl" aria-hidden />
          <div className="relative">
            <IconTile tone="teal" className="h-11 w-11"><CloudOff /></IconTile>
            <h2 id="offline-title" className="mt-5 text-3xl font-semibold tracking-[-0.03em] text-fg sm:text-4xl">Light goes off. Network drops. <span className="text-aurora">Your clinic keeps going.</span></h2>
            <p className="mt-4 leading-relaxed text-muted">
              Install ClinicFlow on any phone, tablet or laptop. Pages you&apos;ve opened stay readable offline, and consultation notes and payments are
              saved on the device, then synced the moment you&apos;re back online — nothing lost, nothing counted twice.
            </p>
          </div>
          <ul className="relative grid gap-3 sm:grid-cols-2">
            {["Works on low-cost Android phones and old laptops", "Uses very little data — no heavy downloads", "Notes merge safely if two people edited offline", "Payments are recorded once, even if sync retries"].map((x) => (
              <li key={x} className="rounded-2xl border border-line bg-surface p-4 text-sm text-fg">
                <Check className="mb-2 h-4 w-4 text-ok" aria-hidden />{x}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section id="how" aria-labelledby="how-title" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-24 sm:px-6 sm:py-32">
        <SectionHead id="how-title" eyebrow="How it works" title="Paper on Monday. ClinicFlow by Tuesday.">
          No consultants, no server in the back room. Most clinics are up and running in an afternoon.
        </SectionHead>
        <div className="relative mt-14">
        <div className="pointer-events-none absolute inset-x-8 top-[2.15rem] hidden h-px bg-gradient-to-r from-accent-2/0 via-accent/50 to-accent-2/0 lg:block" aria-hidden />
        <ol className="relative grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="glass relative p-6 transition duration-300 hover:-translate-y-1 hover:border-line-strong">
              <div className="flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-aurora text-on-accent shadow-glow [&>svg]:h-5 [&>svg]:w-5" aria-hidden><s.icon /></span>
                <span className="font-mono text-xs text-subtle">0{i + 1}</span>
              </div>
              <h3 className="mt-5 font-semibold text-fg">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
        </div>
      </section>

      {/* Comparison */}
      <section aria-labelledby="compare-title" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 sm:pb-32">
        <SectionHead id="compare-title" eyebrow="Clinics, not hospitals" title="Built for a practice like yours">
          Enterprise hospital systems are priced and designed for 200-bed facilities. ClinicFlow is built for 1–15 practitioner clinics.
        </SectionHead>
        <div className="glass mt-12 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="px-5 py-4"><span className="sr-only">Feature</span></th>
                <th scope="col" className="bg-accent/10 px-5 py-4"><span className="flex items-center gap-2 font-semibold text-fg"><LogoMark className="h-6 w-6 rounded-lg" />ClinicFlow</span></th>
                <th scope="col" className="px-5 py-4 font-semibold text-muted">Typical enterprise system</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {COMPARE.map(([k, us, them]) => (
                <tr key={k}>
                  <th scope="row" className="whitespace-nowrap px-5 py-4 font-medium text-fg">{k}</th>
                  <td className="bg-accent/10 px-5 py-4 text-fg"><span className="flex gap-2.5"><Check className="h-4 w-4 shrink-0 text-ok" aria-hidden />{us}</span></td>
                  <td className="px-5 py-4 text-muted"><span className="flex gap-2.5"><X className="h-4 w-4 shrink-0 text-subtle" aria-hidden />{them}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pricing teaser */}
      <section aria-labelledby="price-title" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 sm:pb-32">
        <SectionHead id="price-title" eyebrow="Pricing" title={<>Simple pricing from <span className="text-aurora"><Price of={{ plan: "solo" }} />/month</span></>}>
          {TRIAL_DAYS}-day free trial, no card. 30-day money-back guarantee. Reminders and backups always included.
          <span className="mt-4 block"><PriceCurrencySwitcher /></span>
        </SectionHead>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {(Object.entries(PLANS) as [PlanKey, (typeof PLANS)[PlanKey]][]).map(([key, p]) => (
            <Link key={key} href={`/pricing#${key}`} className={cx("glass group relative block p-6 transition duration-300 hover:-translate-y-1 hover:border-line-strong", key === "clinic" && "ring-aurora shadow-glow")}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-fg">{p.name}</h3>
                {key === "clinic" && <Badge tone="purple">Most popular</Badge>}
              </div>
              <p className="mt-4"><span className="text-4xl font-semibold tracking-[-0.03em] text-fg tabular-nums"><Price of={{ plan: key }} /></span><span className="text-muted">/month</span></p>
              <p className="mt-2 text-sm text-muted">Up to {p.practitioners} practitioner{p.practitioners === 1 ? "" : "s"} · {p.reminders.toLocaleString("en")} reminders/month</p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-accent">See what&apos;s included <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden /></span>
            </Link>
          ))}
        </div>
      </section>

      <CtaBand title={<>Open tomorrow&apos;s queue <span className="text-aurora">in ClinicFlow.</span></>} body={`Start free for ${TRIAL_DAYS} days — no card, every feature on. Cancel any time and take all your data with you.`} />
    </SitePage>
  );
}

function SectionHead({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: ReactNode; children: ReactNode }) {
  return (
    <div className="max-w-3xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id} className="mt-5 text-3xl font-semibold tracking-[-0.035em] text-fg sm:text-5xl">{title}</h2>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">{children}</p>
    </div>
  );
}

function Bento({ className, icon, tone = "purple", title, body, children }: {
  className?: string; icon: ReactNode; tone?: "purple" | "teal" | "green" | "blue"; title: string; body: string; children?: ReactNode;
}) {
  return (
    <article className={cx("glass group relative overflow-hidden p-6 transition duration-300 hover:-translate-y-0.5 hover:border-line-strong sm:p-7", className)}>
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-aurora opacity-[0.08] blur-3xl transition duration-500 group-hover:opacity-20" aria-hidden />
      <IconTile tone={tone}>{icon}</IconTile>
      <h3 className="mt-5 text-lg font-semibold tracking-tight text-fg">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
      {children}
    </article>
  );
}

/** Decorative glass mockup of the dashboard + queue board, built in JSX. */
function ProductMockup() {
  const lanes: { name: string; tone: "gray" | "purple" | "yellow"; cards: [string, string, string][] }[] = [
    { name: "Waiting", tone: "gray", cards: [["A-013", "Chinedu Okafor", "12 min"], ["A-015", "Kofi Boateng", "4 min"]] },
    { name: "With doctor", tone: "purple", cards: [["A-012", "Ama Owusu", "Dr. Mensah"]] },
    { name: "Billing", tone: "yellow", cards: [["A-011", "Wanjiru Kamau", "GH₵ 180"]] },
  ];
  return (
    <div className="relative mx-auto max-w-6xl px-4 pb-24 sm:px-6" aria-hidden>
      <div className="pointer-events-none absolute inset-x-10 top-10 h-3/4 rounded-full bg-aurora opacity-25 blur-[90px]" />
      <div className="relative animate-rise [animation-delay:380ms] [perspective:2000px]">
        <div className="glass ring-aurora overflow-hidden rounded-[1.75rem] bg-solid/60 shadow-glow transition duration-700 lg:[transform:rotateX(8deg)] lg:hover:[transform:rotateX(0deg)]">
          {/* window chrome */}
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <span className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-bad/70" /><span className="h-2.5 w-2.5 rounded-full bg-warn/70" /><span className="h-2.5 w-2.5 rounded-full bg-ok/70" /></span>
            <span className="mx-auto rounded-lg border border-line bg-surface px-3 py-1 text-[11px] text-subtle">Queue · Main branch</span>
            <span className="w-12" />
          </div>

          <div className="flex text-left">
            {/* sidebar */}
            <div className="hidden w-52 shrink-0 flex-col gap-1 border-r border-line p-3 md:flex">
              <div className="mb-3 flex items-center gap-2 px-2"><LogoMark className="h-7 w-7 rounded-lg" /><span className="text-sm font-semibold text-fg">ClinicFlow</span></div>
              {["Dashboard", "Queue", "Appointments", "Patients", "Billing", "Pharmacy", "Messages"].map((n) => (
                <div key={n} className={cx("rounded-lg px-3 py-2 text-xs", n === "Queue" ? "bg-surface-3 font-medium text-fg shadow-[inset_2px_0_0_var(--accent)]" : "text-subtle")}>{n}</div>
              ))}
            </div>

            {/* main */}
            <div className="min-w-0 flex-1 p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-[11px] text-subtle">Today · Main branch</p><p className="font-semibold text-fg">Good morning, Dr. Mensah</p></div>
                <Badge tone="green" pulse>Synced</Badge>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[["Revenue today", "GH₵ 4,820", true], ["Patients", "37", false], ["Waiting", "3", false], ["No-shows", "4.2%", false]].map(([k, v, spark], i) => (
                  <div key={k as string} className="animate-rise rounded-2xl border border-line bg-surface p-3" style={{ animationDelay: `${500 + i * 90}ms` }}>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">{k}</p>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <p className="text-lg font-semibold tracking-tight text-fg tabular-nums sm:text-xl">{v}</p>
                      {spark && <Sparkline values={[12, 18, 15, 24, 21, 30, 34]} className="h-6 w-14" />}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {lanes.map((l, li) => (
                  <div key={l.name} className="rounded-2xl border border-line bg-surface p-3">
                    <div className="mb-2 flex items-center justify-between text-xs"><span className="font-medium text-fg">{l.name}</span><span className="rounded-md bg-surface-3 px-1.5 text-subtle tabular-nums">{l.cards.length}</span></div>
                    <div className="space-y-2">
                      {l.cards.map(([no, name, meta], ci) => (
                        <div key={no} className="animate-rise rounded-xl border border-line bg-surface-2 p-2.5" style={{ animationDelay: `${800 + li * 140 + ci * 90}ms` }}>
                          <div className="flex items-center gap-2">
                            <Avatar name={name} size="sm" />
                            <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-fg">{name}</p><p className="font-mono text-[10px] text-subtle">{no}</p></div>
                          </div>
                          <div className="mt-2 flex items-center justify-between"><Badge tone={l.tone}>{l.name}</Badge><span className="text-[10px] text-muted tabular-nums">{meta}</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* floating toasts */}
        <div className="glass absolute -left-2 bottom-10 hidden animate-rise items-center gap-3 bg-solid/80 px-4 py-3 shadow-glow [animation-delay:1300ms] sm:flex lg:-left-10">
          <IconTile tone="teal" className="h-8 w-8"><MessageCircle /></IconTile>
          <div className="text-left"><p className="text-xs font-medium text-fg">WhatsApp reminder confirmed</p><p className="text-[11px] text-muted">Ama Owusu · tomorrow 10:30</p></div>
        </div>
        <div className="glass absolute -right-2 top-24 hidden animate-rise items-center gap-3 bg-solid/80 px-4 py-3 shadow-glow [animation-delay:1600ms] sm:flex lg:-right-10">
          <IconTile tone="green" className="h-8 w-8"><Wallet /></IconTile>
          <div className="text-left"><p className="text-xs font-medium text-fg">MoMo payment received</p><p className="text-[11px] text-muted tabular-nums">GH₵ 180 · RCT-000231</p></div>
        </div>
      </div>
    </div>
  );
}
