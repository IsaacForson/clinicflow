import { ArrowLeft, PackagePlus } from "lucide-react";
import { LinkButton, PageHeader, Panel } from "@/components/ui";
import { requireCtx } from "@/lib/auth";
import { ItemForm } from "../item-form";


export const metadata = { title: "New stock item" };
export default async function NewItemPage() {
  await requireCtx("inventory.manage");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader icon={<PackagePlus />} eyebrow="Inventory" title="Add inventory item" subtitle="Receive stock on the item page after saving."
        actions={<LinkButton variant="ghost" href="/pharmacy/inventory"><ArrowLeft className="h-4 w-4" />All items</LinkButton>} />
      <Panel eyebrow="Details" title="What are you stocking?" icon={<PackagePlus />}><ItemForm redirectTo="/pharmacy/inventory/{id}" /></Panel>
    </div>
  );
}
