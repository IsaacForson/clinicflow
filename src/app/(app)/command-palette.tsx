"use client";
import { ArrowRight, CornerDownLeft, Search, UserRound, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { ICONS, type NavItem } from "./nav";

type Patient = { id: string; name: string; patientNo: string; phone: string | null };
type Action = { href: string; label: string };
type Entry = { key: string; href: string; label: string; hint?: string; kind: "patient" | "page" | "action"; icon?: keyof typeof ICONS };

/** ⌘K / Ctrl+K palette: patient search, quick actions and page jumps. */
export function CommandPalette({ pages, actions, canSearch }: { pages: NavItem[]; actions: Action[]; canSearch: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => { setOpen(false); setQ(""); setPatients([]); setActive(0); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "/" && !open && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) { e.preventDefault(); setOpen(true); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("cf:command", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("cf:command", onOpen); };
  }, [open]);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 10); }, [open]);

  const term = q.trim();
  const searching = canSearch && term.length >= 2;
  useEffect(() => {
    if (!searching) return;
    const ctl = new AbortController();
    const id = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal }).then((r) => r.json()).then((d) => setPatients(d.patients ?? [])).catch(() => {});
    }, 150);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [term, searching]);

  const entries = useMemo<Entry[]>(() => {
    const match = (s: string) => !term || s.toLowerCase().includes(term.toLowerCase());
    return [
      ...(searching ? patients : []).map((p) => ({ key: `p-${p.id}`, href: `/patients/${p.id}`, label: p.name, hint: [p.patientNo, p.phone].filter(Boolean).join(" · "), kind: "patient" as const })),
      ...actions.filter((a) => match(a.label)).map((a) => ({ key: `a-${a.href}`, href: a.href, label: a.label, kind: "action" as const })),
      ...pages.filter((p) => match(p.label)).map((p) => ({ key: `n-${p.href}`, href: p.href, label: p.label, kind: "page" as const, icon: p.icon })),
    ];
  }, [term, searching, patients, actions, pages]);

  const go = (e?: Entry) => { if (!e) return; close(); router.push(e.href); };
  const sel = Math.min(active, Math.max(entries.length - 1, 0));

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-950/40 px-4 pt-[12vh] backdrop-blur-sm print:hidden" onMouseDown={close}>
      <div role="dialog" aria-modal="true" aria-label="Search and commands" onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-white/95 shadow-2xl ring-1 ring-slate-900/10 backdrop-blur-xl animate-fade-up">
        <div className="flex items-center gap-3 border-b border-slate-900/5 px-4">
          <Search className="h-5 w-5 text-brand-500" aria-hidden />
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, entries.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); go(entries[sel]); }
            }}
            placeholder={canSearch ? "Search patients by name, phone or number… or jump to a page" : "Jump to a page or action…"}
            className="h-14 flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400" aria-label="Search" />
          <kbd className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">esc</kbd>
        </div>
        <ul className="max-h-[60vh] overflow-y-auto p-2" role="listbox">
          {entries.map((e, idx) => {
            const Icon = e.kind === "patient" ? UserRound : e.kind === "action" ? Zap : e.icon ? ICONS[e.icon] : ArrowRight;
            const first = idx === 0 || entries[idx - 1].kind !== e.kind;
            return (
              <li key={e.key}>
                {first && <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{e.kind === "patient" ? "Patients" : e.kind === "action" ? "Quick actions" : "Go to"}</div>}
                <button type="button" role="option" aria-selected={idx === sel} onMouseEnter={() => setActive(idx)} onClick={() => go(e)}
                  className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition", idx === sel ? "bg-gradient-to-r from-brand-500/10 to-cyan-400/10 text-slate-950" : "text-slate-700")}>
                  <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-lg", e.kind === "patient" ? "bg-brand-500/10 text-brand-600" : e.kind === "action" ? "bg-amber-500/10 text-amber-600" : "bg-slate-500/10 text-slate-500")}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{e.label}</span>
                    {e.hint && <span className="block truncate text-xs text-slate-500">{e.hint}</span>}
                  </span>
                  {idx === sel && <CornerDownLeft className="h-4 w-4 text-slate-400" aria-hidden />}
                </button>
              </li>
            );
          })}
          {entries.length === 0 && <li className="px-3 py-10 text-center text-sm text-slate-500">{searching ? "No patients or pages match." : "Type to search."}</li>}
        </ul>
        <div className="flex items-center gap-4 border-t border-slate-900/5 bg-slate-50/70 px-4 py-2 text-[11px] text-slate-500">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span><span><kbd className="font-mono">↵</kbd> open</span><span><kbd className="font-mono">⌘K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}

/** Top-bar trigger that looks like a search field. */
export function CommandTrigger({ canSearch }: { canSearch: boolean }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event("cf:command"))}
      className="group flex h-10 w-full max-w-md items-center gap-2.5 rounded-xl bg-white/70 px-3.5 text-sm text-slate-400 shadow-[inset_0_1px_2px_rgb(15_23_42/0.04)] ring-1 ring-slate-900/10 transition hover:bg-white hover:ring-brand-300">
      <Search className="h-4 w-4 text-slate-400 group-hover:text-brand-500" aria-hidden />
      <span className="flex-1 truncate text-left">{canSearch ? "Search patients, pages, actions…" : "Jump to…"}</span>
      <kbd className="hidden rounded-md bg-slate-900/5 px-1.5 py-0.5 font-mono text-[11px] text-slate-500 sm:inline">⌘K</kbd>
    </button>
  );
}
