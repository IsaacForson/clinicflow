import { Banknote, CreditCard, Landmark, Receipt, ShieldCheck, Smartphone, Wallet, type LucideIcon } from "lucide-react";

export const METHOD_LABEL: Record<string, string> = {
  cash: "Cash", mobile_money: "Mobile money", card: "Card", bank: "Bank transfer", insurance: "Insurance", deposit: "Account credit", cash_expenses: "Cash expenses",
};
/** Icon + short tile label per payment method. */
export const METHOD_ICON: Record<string, { icon: LucideIcon; short: string }> = {
  cash: { icon: Banknote, short: "Cash" }, mobile_money: { icon: Smartphone, short: "MoMo" }, card: { icon: CreditCard, short: "Card" },
  bank: { icon: Landmark, short: "Bank" }, insurance: { icon: ShieldCheck, short: "Insurance" }, deposit: { icon: Wallet, short: "Credit" },
  cash_expenses: { icon: Receipt, short: "Expenses" },
};

export const STATUS_TONE = { draft: "gray", issued: "blue", partially_paid: "yellow", paid: "green", void: "red" } as const;
export const CLAIM_TONE = { draft: "gray", submitted: "blue", partially_paid: "yellow", paid: "green", rejected: "red" } as const;
