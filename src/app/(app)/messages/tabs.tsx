import { Tabs } from "@/components/ui";

export const MessageTabs = ({ current }: { current: "log" | "inbox" | "send" | "templates" }) => (
  <Tabs current={current} tabs={[
    { key: "log", href: "/messages", label: "Message log" },
    { key: "inbox", href: "/messages/inbox", label: "Inbox" },
    { key: "send", href: "/messages/send", label: "Send message" },
    { key: "templates", href: "/messages/templates", label: "Templates" },
  ]} />
);

export const PURPOSE_LABELS: Record<string, string> = {
  reminder: "Appointment reminder", results: "Results", follow_up: "Follow-up", billing: "Billing", portal: "Portal link", care: "Chronic care", marketing: "Announcement",
};
