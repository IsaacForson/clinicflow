import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { hasFeature } from "@/lib/plans";

export default async function LabLayout({ children }: LayoutProps<"/lab">) {
  const ctx = await requireCtx();
  if (!hasFeature(ctx.tenant, "lab")) redirect("/settings/subscription");
  return children;
}
