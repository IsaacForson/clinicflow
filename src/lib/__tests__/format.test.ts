import { describe, expect, it } from "vitest";
import { totp, verifyTotp } from "../crypto";
import { dayRange, e164, localDay, zonedToUtc } from "../format";

describe("format", () => {
  it("converts local wall time to UTC", () => {
    expect(zonedToUtc("2026-10-24", "09:30", "Africa/Lagos").toISOString()).toBe("2026-10-24T08:30:00.000Z");
    expect(zonedToUtc("2026-10-24", "09:30", "Africa/Accra").toISOString()).toBe("2026-10-24T09:30:00.000Z");
    expect(zonedToUtc("2026-01-15", "00:00", "Africa/Nairobi").toISOString()).toBe("2026-01-14T21:00:00.000Z");
  });
  it("computes local day ranges", () => {
    const r = dayRange("2026-10-24", "Africa/Nairobi");
    expect(r.start.toISOString()).toBe("2026-10-23T21:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-24T21:00:00.000Z");
    expect(localDay("Africa/Nairobi", new Date("2026-10-23T22:00:00Z"))).toBe("2026-10-24");
  });
  it("normalises phone numbers", () => {
    expect(e164("024 123 4567", "GH")).toBe("+233241234567");
    expect(e164("0803 123 4567", "NG")).toBe("+2348031234567");
    expect(e164("+254712345678", "GH")).toBe("+254712345678");
    expect(e164("", "GH")).toBeNull();
  });
});

describe("totp", () => {
  it("matches RFC 6238 test vector", () => {
    // secret "12345678901234567890" in base32
    expect(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000)).toBe("287082");
    expect(verifyTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287082", 59_000)).toBe(true);
  });
});
