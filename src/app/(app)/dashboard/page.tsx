import { PageHeader } from "@/components/ui";
import { requireCtx } from "@/lib/auth";

export default async function DashboardPage() {
  const ctx = await requireCtx();
  return <PageHeader title={`Good day, ${ctx.user.name.split(" ")[0]}`} subtitle={ctx.tenant.name} />;
}
