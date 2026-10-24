import { describe, expect, it } from "vitest";
import { intakeSchema, parseAllergies, zSignature } from "../schema";

describe("intake form", () => {
  it("parses allergy lines", () => {
    expect(parseAllergies("Penicillin - rash\nPeanuts: swelling\nSulfa (hives)\nCo-trimoxazole\npenicillin\nNone\n")).toEqual([
      { substance: "Penicillin", reaction: "rash" },
      { substance: "Peanuts", reaction: "swelling" },
      { substance: "Sulfa", reaction: "hives" },
      { substance: "Co-trimoxazole", reaction: null },
    ]);
    expect(parseAllergies("NKDA")).toEqual([]);
    expect(parseAllergies(undefined)).toEqual([]);
  });
  it("reads checkbox consents and rejects bad signatures", () => {
    const d = intakeSchema.parse({ firstName: "Ama", lastName: "Mensah", consentTreatment: "on" });
    expect([d.consentTreatment, d.consentMessaging, d.sex]).toEqual([true, false, "unknown"]);
    expect(zSignature.safeParse("data:image/png;base64,iVBORw0KGgo=").success).toBe(true);
    expect(zSignature.safeParse("javascript:alert(1)").success).toBe(false);
    expect(zSignature.safeParse(undefined).success).toBe(false);
  });
});
