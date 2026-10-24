import "server-only";
import { redirect } from "next/navigation";
import { AuthError, requireCtx, requireWrite } from "@/lib/auth";
import { hasFeature } from "@/lib/plans";

/** Page guard: insurance.manage + the plan's insurance feature. */
export async function requireInsurance() {
  const ctx = await requireCtx("insurance.manage");
  if (!hasFeature(ctx.tenant, "insurance")) redirect("/settings/subscription");
  return ctx;
}

export async function requireInsuranceWrite() {
  const ctx = await requireWrite("insurance.manage");
  if (!hasFeature(ctx.tenant, "insurance")) throw new AuthError("Insurance billing is not on your plan.");
  return ctx;
}
