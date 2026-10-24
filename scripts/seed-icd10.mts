// Seeds the global icd10_codes table (owner connection, DATABASE_URL).
//   npx tsx scripts/seed-icd10.mts                 curated primary-care list (data/icd10-common.json)
//   npx tsx scripts/seed-icd10.mts --file <path>   full CMS ICD-10-CM order file (icd10cm_order_*.txt), upserted
//   add --test to target the test database
// Codes are stored dotted (B50.9) so they read the way clinicians and HMIS reports write them.
import "dotenv/config";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const args = process.argv.slice(2);
const fileIdx = args.indexOf("--file");
const file = fileIdx >= 0 ? args[fileIdx + 1] : null;
if (fileIdx >= 0 && !file) throw new Error("--file needs a path");

const dotted = (c: string) => (c.length > 3 && !c.includes(".") ? `${c.slice(0, 3)}.${c.slice(3)}` : c);

/** CMS order file: fixed width, code in cols 7–13, short description in cols 17–76 (1-based). */
export function parseOrderFile(text: string) {
  return text.split(/\r?\n/).filter((l) => l.length > 16).map((l) => ({
    code: dotted(l.slice(6, 13).trim()),
    description: l.slice(16, 76).trim(),
  })).filter((r) => /^[A-Z]\d[0-9A-Z]/.test(r.code) && r.description);
}

const rows: { code: string; description: string }[] = file
  ? parseOrderFile(readFileSync(file, "latin1"))
  : (JSON.parse(readFileSync(new URL("../data/icd10-common.json", import.meta.url), "utf8")) as { code: string; description: string }[])
      .map((r) => ({ code: dotted(r.code), description: r.description }));

const base = process.env.DATABASE_URL;
if (!base) throw new Error("DATABASE_URL is not set");
const url = args.includes("--test") ? base.replace(/\/clinicflow$/, "/clinicflow_test") : base;
const sql = postgres(url, { max: 1, onnotice: () => {} });
for (let i = 0; i < rows.length; i += 1000) {
  const batch = rows.slice(i, i + 1000);
  await sql`insert into icd10_codes ${sql(batch, "code", "description")}
    on conflict (code) do update set description = excluded.description`;
}
console.log(`upserted ${rows.length} ICD-10 codes into`, url.replace(/:[^:@]+@/, ":***@"));
await sql.end();
