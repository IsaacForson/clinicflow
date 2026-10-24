import { describe, expect, it } from "vitest";
import { freeSlots } from "@/app/portal/slots";
import { extractParams } from "../handlers";
import { parseCommand, senderE164 } from "../inbound";
import { backoffMs } from "../runner";

describe("parseCommand", () => {
  it("recognises confirm / reschedule / opt-out", () => {
    for (const s of ["1", "yes", " Confirm ", "YES!"]) expect(parseCommand(s)).toEqual({ kind: "confirm" });
    expect(parseCommand("2")).toEqual({ kind: "reschedule" });
    expect(parseCommand("reschedule")).toEqual({ kind: "reschedule" });
    expect(parseCommand("stop")).toEqual({ kind: "stop" });
    expect(parseCommand("START")).toEqual({ kind: "start" });
    expect(parseCommand("taken")).toEqual({ kind: "taken" });
    expect(parseCommand("book")).toEqual({ kind: "portal" });
    expect(parseCommand("Portal")).toEqual({ kind: "portal" });
  });
  it("parses readings and rejects implausible ones", () => {
    expect(parseCommand("BP 130/85")).toEqual({ kind: "bp", sys: 130, dia: 85 });
    expect(parseCommand("bp130/85")).toEqual({ kind: "bp", sys: 130, dia: 85 });
    expect(parseCommand("BP 130 85")).toEqual({ kind: "bp", sys: 130, dia: 85 });
    expect(parseCommand("SUGAR 6.2")).toEqual({ kind: "sugar", value: 6.2 });
    expect(parseCommand("glucose 7,5")).toEqual({ kind: "sugar", value: 7.5 });
    expect(parseCommand("BP 85/130")).toEqual({ kind: "unknown" });
    expect(parseCommand("BP 999/85")).toEqual({ kind: "unknown" });
    expect(parseCommand("SUGAR 99")).toEqual({ kind: "unknown" });
    expect(parseCommand("hello, can I come tomorrow?")).toEqual({ kind: "unknown" });
  });
  it("normalises sender ids", () => {
    expect(senderE164("233241234567")).toBe("+233241234567");
    expect(senderE164("+254712345678")).toBe("+254712345678");
  });
});

describe("freeSlots", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  it("generates 15-minute slots inside clinic hours (local time)", () => {
    const s = freeSlots({ day: "2026-10-24", tz: "Africa/Lagos", durationMin: 15, busy: [], now });
    expect(s).toHaveLength(36); // 08:00–16:45
    expect(s[0].toISOString()).toBe("2026-10-24T07:00:00.000Z"); // 08:00 Lagos
    expect(s.at(-1)!.toISOString()).toBe("2026-10-24T15:45:00.000Z"); // 16:45 Lagos
  });
  it("excludes overlaps and slots that would run past closing", () => {
    const busy = [{ start: new Date("2026-10-24T09:00:00Z"), end: new Date("2026-10-24T09:30:00Z") }];
    const s = freeSlots({ day: "2026-10-24", tz: "Africa/Accra", durationMin: 30, busy, now }).map((d) => d.toISOString().slice(11, 16));
    expect(s).toContain("08:30");
    expect(s).not.toContain("08:45"); // would overlap 09:00
    expect(s).not.toContain("09:00");
    expect(s).not.toContain("09:15");
    expect(s).toContain("09:30");
    expect(s.at(-1)).toBe("16:30");
  });
  it("drops past slots", () => {
    const s = freeSlots({ day: "2026-10-24", tz: "Africa/Accra", durationMin: 15, busy: [], now: new Date("2026-10-24T16:20:00Z") });
    expect(s.map((d) => d.toISOString().slice(11, 16))).toEqual(["16:30", "16:45"]);
  });
});

describe("backoff", () => {
  it("doubles and caps at an hour", () => {
    expect([1, 2, 3, 4].map(backoffMs)).toEqual([60_000, 120_000, 240_000, 480_000]);
    expect(backoffMs(20)).toBe(3600_000);
  });
});

describe("extractParams", () => {
  it("recovers WhatsApp template parameters from the rendered body", () => {
    const tpl = "Hello {{name}}, your appointment at {{clinic}} on {{date}} at {{time}}{{with}}.";
    expect(extractParams(tpl, "Hello Ama, your appointment at Ridge Clinic on 24 Oct 2026 at 09:30 with Dr. Mensah."))
      .toEqual(["Ama", "Ridge Clinic", "24 Oct 2026", "09:30", "with Dr. Mensah"]);
    expect(extractParams(tpl, "Hello Ama, your appointment at Ridge Clinic on 24 Oct 2026 at 09:30.")).toEqual(["Ama", "Ridge Clinic", "24 Oct 2026", "09:30", "-"]);
  });
});

describe("extractParams trailing placeholder", () => {
  it("captures a final placeholder with spaces", () => {
    expect(extractParams("Hi {{name}}: {{link}}", "Hi Ama Owusu: https://x.y/z q")).toEqual(["Ama Owusu", "https://x.y/z q"]);
  });
});
