"use client";
import {
  BellRing, Building2, Gem, HardDriveDownload, KeyRound, MapPin, Plug, ScrollText, ShieldCheck, Tag, UsersRound, Webhook, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx, PageHeader } from "@/components/ui";

type Item = { key: string; label: string; desc: string; icon: LucideIcon };
const GROUPS: { label: string; items: Item[] }[] = [
  { label: "Clinic", items: [
    { key: "", label: "Clinic profile", desc: "Name, logo, letterhead, locale", icon: Building2 },
    { key: "branches", label: "Branches", desc: "Locations and opening hours", icon: MapPin },
    { key: "users", label: "Staff & roles", desc: "Accounts, roles, branch access", icon: UsersRound },
    { key: "services", label: "Services", desc: "Price list and durations", icon: Tag },
    { key: "reminders", label: "Reminders", desc: "Timing and notifiable codes", icon: BellRing },
  ] },
  { label: "Connections", items: [
    { key: "integrations", label: "Integrations", desc: "WhatsApp, SMS, payments, scribe", icon: Plug },
    { key: "api", label: "API keys", desc: "REST access for other software", icon: KeyRound },
    { key: "webhooks", label: "Webhooks", desc: "Push events to your systems", icon: Webhook },
  ] },
  { label: "Account & data", items: [
    { key: "subscription", label: "Subscription", desc: "Plan, seats and billing", icon: Gem },
    { key: "export", label: "Data export", desc: "Download everything, free", icon: HardDriveDownload },
    { key: "audit", label: "Audit log", desc: "Who did what, and when", icon: ScrollText },
    { key: "data", label: "Your data", desc: "Ownership and deletion", icon: ShieldCheck },
  ] },
];
const ALL = GROUPS.flatMap((g) => g.items);
const href = (key: string) => `/settings${key ? `/${key}` : ""}`;
const useCurrent = () => {
  const seg = usePathname().split("/")[2] ?? "";
  return ALL.find((i) => i.key === seg) ?? ALL[0];
};

/** Section-aware page header: the active settings area becomes the title. */
export function SettingsHeader() {
  const cur = useCurrent();
  const Icon = cur.icon;
  return <PageHeader icon={<Icon />} eyebrow="Settings · control panel" title={cur.label} subtitle={cur.desc} />;
}

export function SettingsTabs() {
  const cur = useCurrent();
  return (
    <>
      {/* Mobile: horizontally scrolling segmented strip */}
      <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 lg:hidden">
        <div className="inline-flex gap-1 rounded-2xl border border-line bg-surface p-1">
          {ALL.map((i) => {
            const Icon = i.icon, on = i.key === cur.key;
            return (
              <Link key={i.key} href={href(i.key)} aria-current={on ? "page" : undefined}
                className={cx("inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-sm font-medium transition", on ? "bg-surface-3 text-fg shadow-[inset_0_0_0_1px_var(--line-strong)]" : "text-muted hover:text-fg")}>
                <Icon className={cx("h-4 w-4", on && "text-accent")} aria-hidden /> {i.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Desktop: vertical sub-navigation with descriptions */}
      <nav aria-label="Settings sections" className="glass hidden space-y-4 self-start p-2 lg:sticky lg:top-24 lg:block">
        {GROUPS.map((g) => (
          <div key={g.label}>
            <div className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-subtle">{g.label}</div>
            <ul className="space-y-0.5">
              {g.items.map((i) => {
                const Icon = i.icon, on = i.key === cur.key;
                return (
                  <li key={i.key}>
                    <Link href={href(i.key)} aria-current={on ? "page" : undefined}
                      className={cx("group relative flex items-center gap-3 rounded-xl px-2.5 py-2 transition", on ? "bg-surface-3" : "hover:bg-surface-2")}>
                      {on && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-aurora" aria-hidden />}
                      <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition", on ? "border-accent/30 bg-accent/15 text-accent" : "border-line bg-surface text-muted group-hover:text-fg")} aria-hidden>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className={cx("block truncate text-sm font-medium", on ? "text-fg" : "text-muted group-hover:text-fg")}>{i.label}</span>
                        <span className="block truncate text-[11px] text-subtle">{i.desc}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
