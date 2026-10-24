import { and, desc, eq } from "drizzle-orm";
import { queueTickets, users } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { localDay, timeOnly } from "@/lib/format";
import { practitionerName } from "../../appointments/lib";
import { byNext } from "../lib";
import { Refresher } from "./refresher";

export const metadata = { title: "Queue display · ClinicFlow" };

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
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-slate-900 p-6 text-white lg:p-10">
      <Refresher seconds={15} />
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold lg:text-4xl">{ctx.tenant.name}{branch && ctx.branches.length > 1 ? ` · ${branch}` : ""}</h1>
        <span className="text-2xl tabular-nums text-slate-300">{timeOnly(new Date(), tz)}</span>
      </header>
      <div className="grid flex-1 gap-8 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="mb-4 text-2xl font-medium uppercase tracking-widest text-teal-300">Now serving</h2>
          {serving.length ? (
            <ul className="grid gap-4 sm:grid-cols-2">
              {serving.map(({ q, doc }, i) => (
                <li key={q.id} className={i === 0 ? "rounded-2xl bg-teal-600 p-6 sm:col-span-2" : "rounded-2xl bg-slate-800 p-6"}>
                  <div className={i === 0 ? "text-[9rem] font-bold leading-none tabular-nums" : "text-7xl font-bold leading-none tabular-nums"}>{q.ticketNo}</div>
                  <div className="mt-3 text-3xl text-slate-100">{doc ? practitionerName(doc) : "Please proceed"}</div>
                </li>
              ))}
            </ul>
          ) : <p className="text-3xl text-slate-400">Please wait to be called.</p>}
        </section>
        <section>
          <h2 className="mb-4 text-2xl font-medium uppercase tracking-widest text-slate-300">Next</h2>
          <ul className="grid grid-cols-3 gap-3 lg:grid-cols-2">
            {next.map(({ q }) => (
              <li key={q.id} className="rounded-xl bg-slate-800 py-4 text-center text-5xl font-semibold tabular-nums">{q.ticketNo}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
