export const METHOD_LABEL: Record<string, string> = {
  cash: "Cash", mobile_money: "Mobile money", card: "Card", bank: "Bank transfer", insurance: "Insurance", deposit: "Account credit", cash_expenses: "Cash expenses",
};

export const STATUS_TONE = { draft: "gray", issued: "blue", partially_paid: "yellow", paid: "green", void: "red" } as const;
export const CLAIM_TONE = { draft: "gray", submitted: "blue", partially_paid: "yellow", paid: "green", rejected: "red" } as const;
