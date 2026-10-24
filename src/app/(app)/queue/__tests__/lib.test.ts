import { describe, expect, it } from "vitest";
import { averageWaitMinutes, byNext, isUniqueViolation } from "../lib";

const at = (m: number) => new Date(Date.UTC(2026, 9, 24, 8, m));

describe("queue helpers", () => {
  it("averages wait over called tickets only", () => {
    expect(averageWaitMinutes([])).toBeNull();
    expect(averageWaitMinutes([{ createdAt: at(0), calledAt: at(10) }, { createdAt: at(5), calledAt: at(25) }, { createdAt: at(6), calledAt: null }])).toBe(15);
  });
  it("orders urgent first, then first come first served", () => {
    const list = [{ id: 1, priority: 0, createdAt: at(1) }, { id: 2, priority: 1, createdAt: at(9) }, { id: 3, priority: 0, createdAt: at(0) }];
    expect(list.sort(byNext).map((x) => x.id)).toEqual([2, 3, 1]);
  });
  it("detects unique violations, including wrapped driver errors", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
    expect(isUniqueViolation(new Error("x"))).toBe(false);
  });
});
