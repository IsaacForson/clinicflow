import { and, desc, eq } from "drizzle-orm";
import { ArrowRight, Hourglass } from "lucide-react";
import { StatusDot } from "@/components/ui";
import { queueTickets, users } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { dateTime, localDay, timeOnly } from "@/lib/format";
import { LogoMark } from "../../nav";
import { practitionerName } from "../../appointments/lib";
import { byNext } from "../lib";
import { Refresher } from "./refresher";

export const metadata = { title: "Queue display" };

/** Full-screen TV board: ticket numbers only (no patient names on a public screen). */
export default async function QueueDisplayPage() {
  const ctx = await requireCtx("queue.manage");
  const tz = ctx.tenant.timezone;
  const rows = await tx(ctx, (t) =>
    t.select({ q: queueTickets, doc: { name: users.name, title: users.title } }).from(queueTickets)
      .leftJoin(users, eq(users.id, queueTickets.practitionerId))
      .where(and(eq(queueTickets.branchId, ctx.branchId), eq(queueTickets.day, localDay(tz))))
      .orderBy(desc(queueTickets.calledAt)));
  const serving = rows.filter((r) => r.q.status === "with_doctor");
  const next = rows.filter((r) => r.q.status === "waiting").sort((a, b) => byNext(a.q, b.q)).slice(0, 10);
  const branch = ctx.branches.find((b) => b.id === ctx.branchId)?.name;
  const [hero, ...others] = serving;
  const waitingCount = rows.filter((r) => r.q.status === "waiting").length;
  return (
    // Always the dark theme: a cinematic board for the waiting room, whatever the staff theme is.
    <div data-theme="dark" className="backdrop-os fixed inset-0 z-50 flex flex-col overflow-hidden p-6 text-fg lg:p-10">
      <Refresher seconds={15} />
      <div className="pointer-events-none absolute -left-40 top-1/3 h-[40rem] w-[40rem] rounded-full bg-aurora opacity-10 blur-[120px]" aria-hidden />
      <header className="relative mb-8 flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <LogoMark className="h-14 w-14" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">{ctx.tenant.name}</h1>
            {branch && ctx.branches.length > 1 && <p className="text-lg text-muted">{branch}</p>}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-5xl font-semibold tracking-tight tabular-nums lg:text-6xl">{timeOnly(new Date(), tz)}</div>
          <div className="mt-1 flex items-center justify-end gap-2 text-sm uppercase tracking-[0.2em] text-muted">
            <StatusDot tone="green" label="Live" /> {dateTime(new Date(), tz, { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>
      </header>

      <div className="relative grid min-h-0 flex-1 gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col">
          <h2 className="mb-4 flex items-center gap-3 text-xl font-semibold uppercase tracking-[0.3em] text-accent-2">
            <span className="h-2.5 w-2.5 animate-pulse-ring rounded-full bg-accent-2 text-accent-2" aria-hidden /> Now serving
          </h2>
          {hero ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <div className="glass ring-aurora relative flex flex-1 flex-col justify-center overflow-hidden p-8 shadow-glow lg:p-12">
                <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-aurora opacity-25 blur-3xl" aria-hidden />
                <div className="relative text-sm font-semibold uppercase tracking-[0.3em] text-muted">Ticket</div>
                <div className="relative font-mono text-[8rem] font-bold leading-none tracking-tighter tabular-nums text-aurora lg:text-[13rem]">{hero.q.ticketNo}</div>
                <div className="relative mt-4 flex items-center gap-3 text-3xl font-medium lg:text-4xl">
                  <ArrowRight className="h-8 w-8 text-accent-2" aria-hidden />{hero.doc ? practitionerName(hero.doc) : "Please proceed"}
                </div>
              </div>
              {others.length > 0 && (
                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {others.map(({ q, doc }) => (
                    <li key={q.id} className="glass p-5">
                      <div className="font-mono text-6xl font-bold leading-none tabular-nums">{q.ticketNo}</div>
                      <div className="mt-2 truncate text-xl text-muted">{doc ? practitionerName(doc) : "Please proceed"}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="glass flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
              <Hourglass className="h-16 w-16 text-accent" aria-hidden />
              <p className="text-4xl font-semibold tracking-tight">Please wait to be called</p>
              <p className="text-xl text-muted">Your ticket number will appear here.</p>
            </div>
          )}
        </section>

        <section className="flex min-h-0 flex-col">
          <h2 className="mb-4 flex items-center justify-between text-xl font-semibold uppercase tracking-[0.3em] text-muted">
            Up next <span className="font-mono text-base tracking-normal text-subtle">{waitingCount} waiting</span>
          </h2>
          {next.length ? (
            <ol className="glass min-h-0 flex-1 divide-y divide-line overflow-hidden">
              {next.map(({ q }, i) => (
                <li key={q.id} className={i === 0 ? "flex items-center justify-between bg-accent/10 px-6 py-4" : "flex items-center justify-between px-6 py-3"}>
                  <span className={i === 0 ? "font-mono text-6xl font-bold tabular-nums" : "font-mono text-4xl font-semibold tabular-nums text-fg"}>{q.ticketNo}</span>
                  <span className="text-lg text-subtle">{i === 0 ? "Next" : `${i + 1}`}</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="glass flex flex-1 items-center justify-center p-8 text-2xl text-muted">No one waiting</div>
          )}
        </section>
      </div>

      <footer className="relative mt-6 flex items-center justify-between text-sm text-subtle">
        <span>Please keep your ticket ready. Urgent cases may be seen first.</span>
        <span className="font-mono">Updated {timeOnly(new Date(), tz)}</span>
      </footer>
    </div>
  );
}
