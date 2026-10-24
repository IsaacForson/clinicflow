import { describe, expect, it } from "vitest";
import { suggestFlag } from "./flag";

describe("suggestFlag", () => {
  it("flags numeric values against an a-b range", () => {
    expect(suggestFlag("3.2", "3.5-5.0")).toBe("low");
    expect(suggestFlag("5.1", "3.5 - 5.0")).toBe("high");
    expect(suggestFlag("3.5", "3.5–5.0")).toBe("normal");
    expect(suggestFlag("5", "3.5-5.0")).toBe("normal");
    expect(suggestFlag("-1", "-2-2")).toBe("normal");
  });
  it("suggests nothing for text values or other range formats", () => {
    expect(suggestFlag("positive", "3.5-5.0")).toBeNull();
    expect(suggestFlag("4", "<5")).toBeNull();
    expect(suggestFlag("4", null)).toBeNull();
    expect(suggestFlag("", "1-2")).toBeNull();
    expect(suggestFlag("4 mmol", "1-5")).toBeNull();
  });
});
