import { ilike, or, sql } from "drizzle-orm";
import { icd10Codes } from "@/db/schema";
import { getCtx, tx } from "@/lib/auth";
import { can } from "@/lib/permissions";

/** ICD-10 typeahead: code prefix (e.g. "B5") or description substring. */
export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!ctx || !can(ctx.user.role, "clinical.read")) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return Response.json([]);
  const esc = q.replace(/[\\%_]/g, (c) => "\\" + c);
  const code = esc.toUpperCase().replace(".", "") + "%";
  const bare = sql`replace(${icd10Codes.code}, '.', '')`; // codes are stored dotted (B50.9)
  const rows = await tx(ctx, (t) => t.select().from(icd10Codes)
    .where(or(ilike(bare, code), ilike(icd10Codes.description, `%${esc}%`)))
    .orderBy(sql`case when ${bare} ilike ${code} then 0 else 1 end`, icd10Codes.code)
    .limit(20));
  return Response.json(rows, { headers: { "Cache-Control": "private, max-age=300" } });
}
