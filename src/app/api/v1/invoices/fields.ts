import { invoices } from "@/db/schema";

export const invoiceFields = {
  id: invoices.id, invoiceNo: invoices.invoiceNo, patientId: invoices.patientId, visitId: invoices.visitId, branchId: invoices.branchId,
  status: invoices.status, insurerId: invoices.insurerId, subtotalMinor: invoices.subtotalMinor, discountMinor: invoices.discountMinor,
  totalMinor: invoices.totalMinor, insurerPortionMinor: invoices.insurerPortionMinor, patientPortionMinor: invoices.patientPortionMinor,
  paidMinor: invoices.paidMinor, insurerPaidMinor: invoices.insurerPaidMinor, issuedAt: invoices.issuedAt, dueAt: invoices.dueAt, createdAt: invoices.createdAt,
};
