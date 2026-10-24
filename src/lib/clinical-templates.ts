/** Specialty note templates: extra structured fields stored in visits.extra alongside the SOAP note. */
export type TemplateField = { key: string; label: string; multiline?: boolean; placeholder?: string };
export type ClinicalTemplate = { key: string; label: string; fields: TemplateField[] };

export const CLINICAL_TEMPLATES = {
  general: { key: "general", label: "General", fields: [] },
  dental: {
    key: "dental", label: "Dental", fields: [
      { key: "teeth", label: "Teeth involved (FDI)", placeholder: "e.g. 36, 46" },
      { key: "oral_exam", label: "Oral examination", multiline: true },
      { key: "periodontal", label: "Periodontal status" },
      { key: "procedure_done", label: "Procedure done", multiline: true },
    ],
  },
  physiotherapy: {
    key: "physiotherapy", label: "Physiotherapy", fields: [
      { key: "pain_score", label: "Pain score (0–10)" },
      { key: "rom", label: "Range of motion", multiline: true },
      { key: "strength", label: "Muscle strength (MRC)" },
      { key: "functional", label: "Functional assessment", multiline: true },
      { key: "exercises", label: "Exercises / modalities", multiline: true },
    ],
  },
  eye: {
    key: "eye", label: "Eye", fields: [
      { key: "va_right", label: "Visual acuity R", placeholder: "6/6" },
      { key: "va_left", label: "Visual acuity L", placeholder: "6/6" },
      { key: "iop_right", label: "IOP R (mmHg)" },
      { key: "iop_left", label: "IOP L (mmHg)" },
      { key: "anterior", label: "Anterior segment", multiline: true },
      { key: "fundus", label: "Fundus", multiline: true },
      { key: "refraction", label: "Refraction" },
    ],
  },
  paediatric: {
    key: "paediatric", label: "Paediatric", fields: [
      { key: "muac", label: "MUAC (cm)" },
      { key: "head_circ", label: "Head circumference (cm)" },
      { key: "milestones", label: "Developmental milestones", multiline: true },
      { key: "immunisation", label: "Immunisation status" },
      { key: "feeding", label: "Feeding / nutrition", multiline: true },
    ],
  },
  antenatal: {
    key: "antenatal", label: "Antenatal", fields: [
      { key: "lmp", label: "LMP", placeholder: "YYYY-MM-DD" },
      { key: "edd", label: "EDD", placeholder: "YYYY-MM-DD" },
      { key: "gest_age", label: "Gestational age (weeks)" },
      { key: "gravida_para", label: "Gravida / Para", placeholder: "G2 P1" },
      { key: "fundal_height", label: "Fundal height (cm)" },
      { key: "fetal_hr", label: "Fetal heart rate (bpm)" },
      { key: "presentation", label: "Presentation" },
      { key: "urinalysis", label: "Urinalysis" },
    ],
  },
} satisfies Record<string, ClinicalTemplate>;

export type TemplateKey = keyof typeof CLINICAL_TEMPLATES;
export const TEMPLATE_KEYS = Object.keys(CLINICAL_TEMPLATES) as TemplateKey[];

export const getTemplate = (key: string | null | undefined): ClinicalTemplate =>
  CLINICAL_TEMPLATES[(key ?? "general") as TemplateKey] ?? CLINICAL_TEMPLATES.general;

/** BMI rounded to one decimal, or null when either measurement is missing or implausible. */
export function bmi(weightKg: number | null | undefined, heightCm: number | null | undefined): number | null {
  if (!weightKg || !heightCm || weightKg <= 0 || heightCm < 30) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

/** How a stock item reads on a prescription and in the drug picker, e.g. "Amoxicillin 500mg capsule". */
export const drugLabel = (i: { name: string; strength?: string | null; form?: string | null }) => [i.name, i.strength, i.form].filter(Boolean).join(" ");
