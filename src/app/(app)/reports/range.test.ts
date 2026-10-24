import { describe, expect, it } from "vitest";
import { ageBand, agingBucket, daysBetween, denseSeries, isNotifiable, presetDays, resolveRange, toCsv } from "./range";

describe("report date ranges", () => {
  const now = new Date("2026-10-23T22:30:00Z"); // already the 24th in Nairobi (UTC+3), still the 23rd in Accra
  it("buckets 'today' by the clinic timezone", () => {
    expect(resolveRange({ preset: "today" }, "Africa/Nairobi", now)).toMatchObject({ from: "2026-10-24", to: "2026-10-24" });
    expect(resolveRange({ preset: "today" }, "Africa/Accra", now)).toMatchObject({ from: "2026-10-23", to: "2026-10-23" });
  });
  it("turns local days into UTC [start, end) instants", () => {
    const r = resolveRange({ from: "2026-10-01", to: "2026-10-02" }, "Africa/Lagos", now);
    expect(r.start.toISOString()).toBe("2026-09-30T23:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-02T23:00:00.000Z");
    expect(r.preset).toBe("custom");
  });
  it("swaps reversed custom ranges, ignores junk and defaults to last 30 days", () => {
    expect(resolveRange({ from: "2026-10-10", to: "2026-10-01" }, "UTC", now)).toMatchObject({ from: "2026-10-01", to: "2026-10-10" });
    expect(resolveRange({ from: "nope", to: "2026-10-01", preset: "bogus" }, "UTC", now)).toMatchObject({ preset: "last30", from: "2026-09-24", to: "2026-10-23" });
    expect(resolveRange({}, "UTC", now, "lastMonth")).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
  });
  it("computes presets across month and year edges", () => {
    expect(presetDays("lastMonth", "2026-01-15")).toEqual(["2025-12-01", "2025-12-31"]);
    expect(presetDays("lastMonth", "2026-03-31")).toEqual(["2026-02-01", "2026-02-28"]);
    expect(presetDays("last7", "2026-03-02")).toEqual(["2026-02-24", "2026-03-02"]);
    expect(presetDays("thisYear", "2026-10-24")).toEqual(["2026-01-01", "2026-10-24"]);
  });
  it("fills missing days with zero", () => {
    expect(daysBetween("2026-02-27", "2026-03-01")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
    expect(denseSeries("2026-10-01", "2026-10-03", new Map([["2026-10-02", 500]]))).toEqual([
      { day: "2026-10-01", value: 0 }, { day: "2026-10-02", value: 500 }, { day: "2026-10-03", value: 0 },
    ]);
  });
});

describe("aging buckets", () => {
  it.each([[0, "0–30 days"], [30, "0–30 days"], [31, "31–60 days"], [60, "31–60 days"], [61, "61–90 days"], [90, "61–90 days"], [91, "90+ days"], [400, "90+ days"]])("%i days -> %s", (d, b) => {
    expect(agingBucket(d)).toBe(b);
  });
});

describe("HMIS age bands", () => {
  it.each([[0, "<1"], [1, "1–4"], [4, "1–4"], [5, "5–14"], [14, "5–14"], [15, "15–49"], [49, "15–49"], [50, "50+"], [null, "Unknown"], [-1, "Unknown"]])("%s years -> %s", (y, b) => {
    expect(ageBand(y)).toBe(b);
  });
});

describe("notifiable codes and CSV", () => {
  it("matches exact codes and prefixes case-insensitively", () => {
    expect(isNotifiable("A00.1", ["A00"])).toBe(true);
    expect(isNotifiable("b50.9", ["B5"])).toBe(true);
    expect(isNotifiable("A01", ["A00", " "])).toBe(false);
    expect(isNotifiable(null, ["A00"])).toBe(false);
  });
  it("quotes CSV cells and neutralises formulas", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"'], ["=SUM(A1)", -5], [null, "ok"]])).toBe('a,b\r\n"x,y","say ""hi"""\r\n\'=SUM(A1),-5\r\n,ok\r\n');
  });
});
