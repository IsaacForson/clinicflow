import { Card, PageHeader } from "@/components/ui";
import { requireCtx } from "@/lib/auth";
import { ItemForm } from "../item-form";

export default async function NewItemPage() {
  await requireCtx("inventory.manage");
  return (
    <>
      <PageHeader title="Add inventory item" subtitle="Receive stock on the item page after saving." />
      <Card><ItemForm redirectTo="/pharmacy/inventory/{id}" /></Card>
    </>
  );
}
