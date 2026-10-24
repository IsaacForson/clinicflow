const page = (item: string) => ({
  type: "object", properties: { data: { type: "array", items: { $ref: `#/components/schemas/${item}` } }, nextCursor: { type: ["string", "null"] } },
});
const list = (scope: string, item: string, summary: string, extra: object[] = []) => ({
  summary, security: [{ bearer: [scope] }],
  parameters: [{ $ref: "#/components/parameters/limit" }, { $ref: "#/components/parameters/cursor" }, ...extra],
  responses: { 200: { description: "Page of results", content: { "application/json": { schema: page(item) } } }, ...errors },
});
const one = (scope: string, item: string, summary: string) => ({
  summary, security: [{ bearer: [scope] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
  responses: { 200: { description: "OK", content: { "application/json": { schema: { $ref: `#/components/schemas/${item}` } } } }, 404: { description: "Not found" }, ...errors },
});
const create = (scope: string, input: string, item: string, summary: string) => ({
  summary, security: [{ bearer: [scope] }],
  requestBody: { required: true, content: { "application/json": { schema: { $ref: `#/components/schemas/${input}` } } } },
  responses: { 201: { description: "Created", content: { "application/json": { schema: { $ref: `#/components/schemas/${item}` } } } }, 422: { description: "Validation error" }, ...errors },
});
const errors = { 401: { description: "Missing/invalid API key" }, 403: { description: "Plan lacks API access or key lacks scope" }, 429: { description: "More than 120 requests/minute" } };
const q = (name: string, format?: string) => ({ name, in: "query", schema: { type: "string", ...(format ? { format } : {}) } });
const s = { type: "string" }, ns = { type: ["string", "null"] }, int = { type: "integer" }, uuid = { type: "string", format: "uuid" }, dt = { type: "string", format: "date-time" };

const spec = {
  openapi: "3.1.0",
  info: { title: "ClinicFlow API", version: "1.0.0", description: "Read and write your clinic's data. Authenticate with `Authorization: Bearer cf_live_…` (Settings → API keys, Group plan). Money is integer minor units in the clinic's currency. Lists are ordered by id; pass `nextCursor` back as `cursor`." },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "Scopes: patients:read|write, appointments:read|write, invoices:read, visits:read, services:read" } },
    parameters: {
      limit: { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
      cursor: { name: "cursor", in: "query", schema: { type: "string" } },
    },
    schemas: {
      Patient: { type: "object", properties: { id: uuid, patientNo: s, firstName: s, lastName: s, otherNames: ns, sex: { enum: ["female", "male", "other", "unknown"] }, dob: { type: ["string", "null"], format: "date" }, phone: ns, altPhone: ns, email: ns, address: ns, preferredChannel: { enum: ["whatsapp", "sms", "email"] }, language: s, insurerId: ns, memberNo: ns, createdAt: dt, updatedAt: dt } },
      PatientInput: { type: "object", required: ["firstName", "lastName"], properties: { firstName: s, lastName: s, otherNames: s, sex: { enum: ["female", "male", "other", "unknown"] }, dob: { type: "string", format: "date" }, phone: s, email: s, address: s, preferredChannel: { enum: ["whatsapp", "sms", "email"] }, language: s } },
      Appointment: { type: "object", properties: { id: uuid, branchId: uuid, patientId: uuid, practitionerId: ns, serviceId: ns, startsAt: dt, endsAt: dt, status: { enum: ["scheduled", "confirmed", "arrived", "completed", "cancelled", "no_show"] }, source: s, reason: ns, telehealth: { type: "boolean" }, createdAt: dt } },
      AppointmentInput: { type: "object", required: ["patientId", "startsAt"], properties: { patientId: uuid, practitionerId: uuid, serviceId: uuid, branchId: { ...uuid, description: "Defaults to the main branch" }, startsAt: dt, endsAt: { ...dt, description: "Defaults to startsAt + service duration (or 15 min)" }, reason: s } },
      Invoice: { type: "object", properties: { id: uuid, invoiceNo: s, patientId: uuid, visitId: ns, branchId: uuid, status: { enum: ["draft", "issued", "partially_paid", "paid", "void"] }, insurerId: ns, subtotalMinor: int, discountMinor: int, totalMinor: int, insurerPortionMinor: int, patientPortionMinor: int, paidMinor: int, insurerPaidMinor: int, issuedAt: { type: ["string", "null"], format: "date-time" }, dueAt: { type: ["string", "null"], format: "date-time" }, createdAt: dt, lines: { type: "array", description: "Only on GET /invoices/{id}", items: { type: "object", properties: { id: uuid, serviceId: ns, description: s, quantity: int, unitPriceMinor: int, totalMinor: int, insurerCovered: { type: "boolean" } } } } } },
      Visit: { type: "object", properties: { id: uuid, patientId: uuid, practitionerId: ns, branchId: uuid, template: s, startedAt: dt, signedAt: dt, followUpDate: ns, diagnoses: { type: "array", items: { type: "object", properties: { code: ns, description: s, isPrimary: { type: "boolean" } } } } } },
      Service: { type: "object", properties: { id: uuid, name: s, code: ns, category: { enum: ["consultation", "lab", "imaging", "procedure", "drug", "other"] }, priceMinor: int, durationMin: int } },
    },
  },
  paths: {
    "/patients": { get: list("patients:read", "Patient", "List patients", [q("phone")]), post: create("patients:write", "PatientInput", "Patient", "Register a patient") },
    "/patients/{id}": { get: one("patients:read", "Patient", "Get a patient") },
    "/appointments": { get: list("appointments:read", "Appointment", "List appointments", [q("from", "date-time"), q("to", "date-time"), q("patientId", "uuid")]), post: create("appointments:write", "AppointmentInput", "Appointment", "Book an appointment (reminders are scheduled automatically)") },
    "/invoices": { get: list("invoices:read", "Invoice", "List invoices", [q("status"), q("patientId", "uuid")]) },
    "/invoices/{id}": { get: one("invoices:read", "Invoice", "Get an invoice with lines") },
    "/visits": { get: list("visits:read", "Visit", "Signed visits for a patient (summary only, no note text)", [{ ...q("patientId", "uuid"), required: true }]) },
    "/services": { get: list("services:read", "Service", "Active services and prices") },
  },
};

export function GET() {
  return Response.json(spec);
}
