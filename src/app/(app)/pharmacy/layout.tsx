import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { hasFeature } from "@/lib/plans";

export default async function PharmacyLayout({ children }: LayoutProps<"/pharmacy">) {
  const ctx = await requireCtx();
  if (!hasFeature(ctx.tenant, "dispensary")) redirect("/settings/subscription");
  return children;
}
