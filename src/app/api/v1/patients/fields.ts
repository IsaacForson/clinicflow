import { patients } from "@/db/schema";

/** Patient fields exposed by the public API (no encrypted notes or national ID). */
export const patientFields = {
  id: patients.id, patientNo: patients.patientNo, firstName: patients.firstName, lastName: patients.lastName, otherNames: patients.otherNames,
  sex: patients.sex, dob: patients.dob, phone: patients.phone, altPhone: patients.altPhone, email: patients.email, address: patients.address,
  preferredChannel: patients.preferredChannel, language: patients.language, insurerId: patients.insurerId, memberNo: patients.memberNo,
  createdAt: patients.createdAt, updatedAt: patients.updatedAt,
};
