"use server";
import { revalidatePath } from "next/cache";
import { getCtx, setBranch } from "@/lib/auth";

export async function switchBranchAction(fd: FormData) {
  const ctx = await getCtx();
  const id = String(fd.get("branchId"));
  if (ctx?.branches.some((b) => b.id === id)) await setBranch(id);
  revalidatePath("/", "layout");
}
