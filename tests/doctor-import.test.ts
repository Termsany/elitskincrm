import { describe,expect,it } from "vitest";
import { matchesDoctorSearch, normalizeDoctorImportRow } from "@/lib/doctor-import";

describe("doctor Excel import",()=>{
 it("maps Arabic spreadsheet headers",()=>{
  expect(normalizeDoctorImportRow({"معرف الطبيب":"abc","اسم الطبيب":"د. أحمد","العيادة":"Elite Clinic","المدينة":"الدمام","التخصص":"جلدية","التصنيف":"A","الهاتف":"0500000000","الحالة":"active"})).toEqual({id:"abc",name:"د. أحمد",clinic_name:"Elite Clinic",city:"الدمام",specialty:"جلدية",classification:"A",phone:"0500000000",status:"active"});
 });
 it("maps English spreadsheet headers and trims values",()=>{
  const row=normalizeDoctorImportRow({id:" ",name:" Dr Sara ",clinic_name:" Clinic ",city:" Dammam ",specialty:" Hair ",classification:" b ",phone:50123,status:" active "});
  expect(row.name).toBe("Dr Sara");expect(row.classification).toBe("B");expect(row.phone).toBe("50123");expect(row.id).toBe("");
 });
 it("filters instantly across doctor, clinic, city, specialty, and phone",()=>{
  const doctor={name:"د. أحمد",clinic_name:"Elite Clinic",city:"الدمام",specialty:"جلدية",phone:"050123"};
  expect(matchesDoctorSearch(doctor,"أحم")).toBe(true);
  expect(matchesDoctorSearch(doctor,"elite")).toBe(true);
  expect(matchesDoctorSearch(doctor,"050")).toBe(true);
  expect(matchesDoctorSearch(doctor,"الرياض")).toBe(false);
 });
});
