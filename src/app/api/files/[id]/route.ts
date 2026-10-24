import { eq } from "drizzle-orm";
import { documents } from "@/db/schema";
import { audit, getCtx, tx } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getFile } from "@/lib/storage";

export async function GET(_: Request, { params }: RouteContext<"/api/files/[id]">) {
  const ctx = await getCtx();
  if (!ctx || !can(ctx.user.role, "patients.read")) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const doc = await tx(ctx, async (t) => {
    const [d] = await t.select().from(documents).where(eq(documents.id, id));
    if (d) await audit(t, ctx, "view", "document", d.id, { patientId: d.patientId });
    return d;
  });
  if (!doc) return new Response("Not found", { status: 404 });
  const data = await getFile(ctx.tenant.id, doc.storageKey);
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": doc.mime, "Content-Disposition": `inline; filename="${doc.name.replace(/"/g, "")}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
