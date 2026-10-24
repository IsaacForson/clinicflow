import { BarChart3, CalendarClock, HeartPulse, MessageSquare, Stethoscope, Users, Wallet } from "lucide-react";
import type { ReactNode } from "react";

/** Icon + tone per report group (presentation only). */
export const GROUP_META: Record<string, { icon: ReactNode; tone: "purple" | "teal" | "blue" | "green" | "yellow" | "red" }> = {
  Revenue: { icon: <Wallet />, tone: "green" },
  Appointments: { icon: <CalendarClock />, tone: "blue" },
  Clinical: { icon: <Stethoscope />, tone: "purple" },
  Patients: { icon: <Users />, tone: "teal" },
  Messaging: { icon: <MessageSquare />, tone: "yellow" },
  "Public health": { icon: <HeartPulse />, tone: "red" },
};
export const groupMeta = (g: string) => GROUP_META[g] ?? { icon: <BarChart3 />, tone: "purple" as const };
