import type { Tone } from "@/components/ui";
import type { Role } from "@/db/schema";

export const ROLE_TONE: Record<Role, Tone> = { owner: "purple", doctor: "blue", nurse: "teal", front_desk: "gray", cashier: "yellow", pharmacist: "green", lab: "red" };
