import { describe, expect, it } from "vitest";
import { syncBody } from "./ops";

const user = "11111111-1111-4111-8111-111111111111";
const uuid = "22222222-2222-4222-8222-222222222222";
const note = { id: 1, userId: user, type: "visit.note", visitId: uuid, baseVersion: 3, note: { subjective: "cough 3 days", extra: { pain: "4/10" } } };
const payment = { id: 2, userId: user, type: "payment", clientId: "c-1234567890", invoiceId: uuid, patientId: uuid, amountMinor: 2500, method: "mobile_money", reference: "MOMO123" };

describe("offline sync op validation", () => {
  it("accepts valid note and payment ops in order", () => {
    const r = syncBody.safeParse({ ops: [note, payment, { ...payment, id: 3, invoiceId: null, method: "cash", reference: undefined }] });
    expect(r.success).toBe(true);
    expect(r.data?.ops.map((o) => o.type)).toEqual(["visit.note", "payment", "payment"]);
  });
  it("rejects unknown op types and note fields", () => {
    expect(syncBody.safeParse({ ops: [{ ...note, type: "visit.sign" }] }).success).toBe(false);
    expect(syncBody.safeParse({ ops: [{ ...note, note: { status: "signed" } }] }).success).toBe(false);
  });
  it("rejects bad money and identifiers", () => {
    for (const bad of [{ amountMinor: 0 }, { amountMinor: -100 }, { amountMinor: 12.5 }, { method: "bitcoin" }, { patientId: "not-a-uuid" }, { clientId: "short" }, { userId: undefined }]) {
      expect(syncBody.safeParse({ ops: [{ ...payment, ...bad }] }).success, JSON.stringify(bad)).toBe(false);
    }
  });
  it("requires a positive base version and bounds the batch", () => {
    expect(syncBody.safeParse({ ops: [{ ...note, baseVersion: 0 }] }).success).toBe(false);
    expect(syncBody.safeParse({ ops: [] }).success).toBe(false);
    expect(syncBody.safeParse({ ops: Array.from({ length: 101 }, (_, i) => ({ ...note, id: i })) }).success).toBe(false);
  });
});
