import type { Role } from "@/db/schema";

export const PERMISSIONS = [
  "patients.read", "patients.write", "patients.merge",
  "appointments.manage", "queue.manage",
  "clinical.read", "clinical.write", "clinical.sign", "vitals.write",
  "lab.order", "lab.result",
  "billing.read", "billing.write", "billing.void", "payments.receive", "cashup",
  "insurance.manage", "inventory.manage", "dispense", "expenses.manage",
  "reports.view", "messaging.send", "scribe.use",
  "settings.manage", "users.manage", "export", "audit.view", "api.manage",
  "subscription.manage", "admin.console",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const all = [...PERMISSIONS];
const front: Permission[] = ["patients.read", "patients.write", "appointments.manage", "queue.manage", "billing.read", "billing.write", "payments.receive", "messaging.send"];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: all,
  // Clinic administrator / practice manager: runs the clinic. Plan & payment and account deletion stay with the owner;
  // writing/signing clinical notes stays with clinicians.
  admin: all.filter((p) => !(["subscription.manage", "clinical.write", "clinical.sign", "scribe.use"] as Permission[]).includes(p)),
  doctor: [...front, "clinical.read", "clinical.write", "clinical.sign", "vitals.write", "lab.order", "lab.result", "reports.view", "scribe.use", "patients.merge"],
  nurse: ["patients.read", "patients.write", "appointments.manage", "queue.manage", "clinical.read", "vitals.write", "lab.order", "lab.result", "messaging.send", "dispense"],
  front_desk: front,
  cashier: ["patients.read", "queue.manage", "billing.read", "billing.write", "payments.receive", "cashup", "expenses.manage", "insurance.manage"],
  pharmacist: ["patients.read", "queue.manage", "clinical.read", "dispense", "inventory.manage", "billing.read", "billing.write", "payments.receive"],
  lab: ["patients.read", "queue.manage", "lab.result", "messaging.send"],
};

export const can = (role: Role, p: Permission) => ROLE_PERMISSIONS[role].includes(p);

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Clinic admin", doctor: "Doctor", nurse: "Nurse", front_desk: "Front desk",
  cashier: "Cashier", pharmacist: "Pharmacist", lab: "Lab technician",
};
