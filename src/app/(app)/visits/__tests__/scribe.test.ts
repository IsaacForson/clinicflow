import { describe, expect, it } from "vitest";
import { CLINICAL_TEMPLATES, TEMPLATE_KEYS, bmi, getTemplate } from "@/lib/clinical-templates";
import { chooseModel, redact, restore, SCRIBE_MODELS, scribeBlockReason } from "@/lib/scribe";

describe("redact", () => {
  it("strips contact details, IDs and the patient's name, and restores them", () => {
    const src = "Ama Mensah, call 024 123 4567 or +233 20 111 2222, email ama.m@example.com. Ghana card GHA-123456789-0, NIN 12345678901. Mensah has fever.";
    const { text, map } = redact(src, ["Ama", "Mensah"]);
    expect(text).not.toMatch(/Ama|Mensah|4567|2222|example\.com|123456789|12345678901/);
    expect(text).toContain("[NAME_");
    expect(text).toContain("[PHONE_1]");
    expect(text).toContain("[PHONE_2]");
    expect(text).toContain("[EMAIL_1]");
    expect(text).toContain("[ID_1]");
    expect(text.match(/\[NAME_1\]/g)).toHaveLength(2); // same value -> same placeholder
    expect(restore(text, map)).toBe(src);
  });
  it("leaves vitals, doses and dates alone", () => {
    const src = "BP 120/80, temp 37.5 120 80 72 98, paracetamol 1000 mg tds for 5 days, seen 2026-10-24.";
    expect(redact(src, []).text).toBe(src);
  });
  it("matches names only as whole words", () => {
    expect(redact("Kofi has a cough; Kofiland is a place", ["Kofi"]).text).toBe("[NAME_1] has a cough; Kofiland is a place");
  });
});

describe("model choice", () => {
  it("uses Haiku for short transcripts and Sonnet for long ones", () => {
    expect(chooseModel("word ".repeat(200))).toBe(SCRIBE_MODELS.short);
    expect(chooseModel("word ".repeat(1499))).toBe(SCRIBE_MODELS.short);
    expect(chooseModel("word ".repeat(1500))).toBe(SCRIBE_MODELS.long);
  });
});

describe("scribe access", () => {
  const tenant = { scribeSeats: 1, planStatus: "active" as const };
  it("requires permission, an enabled user (or owner) and seats or a trial", () => {
    expect(scribeBlockReason({ role: "doctor", scribeEnabled: true }, tenant)).toBeNull();
    expect(scribeBlockReason({ role: "owner", scribeEnabled: false }, tenant)).toBeNull();
    expect(scribeBlockReason({ role: "doctor", scribeEnabled: false }, tenant)).toMatch(/enabled/);
    expect(scribeBlockReason({ role: "nurse", scribeEnabled: true }, tenant)).toMatch(/role/);
    expect(scribeBlockReason({ role: "doctor", scribeEnabled: true }, { scribeSeats: 0, planStatus: "active" })).toMatch(/add-on/);
    expect(scribeBlockReason({ role: "doctor", scribeEnabled: true }, { scribeSeats: 0, planStatus: "trialing" })).toBeNull();
  });
});

describe("clinical templates", () => {
  it("defines the six specialty templates with unique field keys", () => {
    expect(TEMPLATE_KEYS).toEqual(["general", "dental", "physiotherapy", "eye", "paediatric", "antenatal"]);
    for (const t of Object.values(CLINICAL_TEMPLATES)) {
      const keys = t.fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
    expect(getTemplate("nope").key).toBe("general");
    expect(getTemplate("eye").fields.length).toBeGreaterThan(0);
  });
  it("computes BMI", () => {
    expect(bmi(70, 175)).toBe(22.9);
    expect(bmi(null, 175)).toBeNull();
    expect(bmi(70, 0)).toBeNull();
  });
});
