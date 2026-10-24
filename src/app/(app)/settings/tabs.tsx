"use client";
import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui";

const TABS = [
  ["", "Clinic"], ["branches", "Branches"], ["users", "Staff"], ["services", "Services"], ["reminders", "Reminders"],
  ["integrations", "Integrations"], ["subscription", "Subscription"], ["api", "API keys"], ["webhooks", "Webhooks"],
  ["export", "Export"], ["audit", "Audit log"], ["data", "Your data"],
] as const;

export function SettingsTabs() {
  const seg = usePathname().split("/")[2] ?? "";
  return <Tabs current={seg} tabs={TABS.map(([key, label]) => ({ key, label, href: `/settings${key ? `/${key}` : ""}` }))} />;
}
