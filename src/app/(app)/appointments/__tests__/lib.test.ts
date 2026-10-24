import { describe, expect, it } from "vitest";
import { assignLanes, canTransition, dayWindow, hhmm, localMinutes, timeSlots, weekStart } from "../lib";

describe("appointment scheduling helpers", () => {
  it("generates slots and labels", () => {
    expect(timeSlots(9 * 60, 10 * 60, 15).map(hhmm)).toEqual(["09:00", "09:15", "09:30", "09:45"]);
  });
  it("widens the day window to cover early/late appointments", () => {
    expect(dayWindow([])).toEqual({ start: 420, end: 1140 });
    expect(dayWindow([{ start: 6 * 60 + 30, end: 6 * 60 + 45 }, { start: 19 * 60 + 10, end: 19 * 60 + 40 }])).toEqual({ start: 360, end: 1200 });
  });
  it("reads local minutes in the clinic timezone", () => {
    expect(localMinutes(new Date("2026-10-24T08:30:00Z"), "Africa/Lagos")).toBe(9 * 60 + 30);
    expect(localMinutes(new Date("2026-10-24T08:30:00Z"), "Africa/Nairobi")).toBe(11 * 60 + 30);
  });
  it("puts overlapping appointments side by side, back-to-back ones in one lane", () => {
    const out = assignLanes([
      { id: "a", start: 540, end: 570 }, { id: "b", start: 550, end: 565 }, { id: "c", start: 570, end: 600 }, { id: "d", start: 600, end: 615 },
    ]);
    const by = Object.fromEntries(out.map((o) => [o.id, o]));
    expect([by.a.lane, by.a.lanes]).toEqual([0, 2]);
    expect([by.b.lane, by.b.lanes]).toEqual([1, 2]);
    expect([by.c.lane, by.c.lanes]).toEqual([0, 1]);
    expect([by.d.lane, by.d.lanes]).toEqual([0, 1]);
  });
  it("allows only sensible status changes", () => {
    expect(canTransition("scheduled", "arrived")).toBe(true);
    expect(canTransition("arrived", "completed")).toBe(true);
    expect(canTransition("cancelled", "arrived")).toBe(false);
    expect(canTransition("completed", "no_show")).toBe(false);
  });
  it("finds the Monday of a week", () => {
    expect(weekStart("2026-10-24")).toBe("2026-10-19"); // Saturday
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
    expect(weekStart("2026-10-25")).toBe("2026-10-19"); // Sunday
  });
});
