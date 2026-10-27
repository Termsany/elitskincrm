import {describe,expect,it} from "vitest";
import {buildSampleItems, collectSampleItems, validateVisitProducts} from "@/lib/visit-entry";
import {visitSchema} from "@/lib/validation";

const A="11111111-1111-4111-8111-111111111111";
const B="22222222-2222-4222-8222-222222222222";
const DOC="33333333-3333-4333-8333-333333333333";

describe("visit sample entry",()=>{
 it("requires the medical sample type when quantity is positive",()=>{expect(()=>buildSampleItems(2,"")).toThrow("حدد نوع العينة الطبية")});
 it("stores the selected product as the sample type",()=>{expect(buildSampleItems(2,"p1","personal_use")).toEqual([{productId:"p1",quantity:2,purpose:"personal_use"}])});
 it("creates no sample row when quantity is zero",()=>{expect(buildSampleItems(0,"")).toEqual([])});
});

describe("did the doctor take a sample",()=>{
 it("saves no samples when the answer is no, even with leftover rows",()=>{
  expect(collectSampleItems("no",[{productId:A,quantity:3,purpose:"workshop"}])).toEqual({items:[],error:null});
 });
 it("requires at least one sample with a quantity when the answer is yes",()=>{
  expect(collectSampleItems("yes",[]).error).toBeTruthy();
  expect(collectSampleItems("yes",[{productId:A,quantity:0,purpose:"workshop"}]).error).toBeTruthy();
 });
 it("requires a reason for every sample",()=>{
  expect(collectSampleItems("yes",[{productId:A,quantity:1,purpose:""}]).error).toBe("حدد سبب كل عينة قبل الحفظ");
  expect(collectSampleItems("yes",[{productId:A,quantity:2,purpose:"video_shooting"},{productId:B,quantity:0,purpose:""}])).toEqual({items:[{productId:A,quantity:2,purpose:"video_shooting"}],error:null});
 });
});

describe("presented products rules",()=>{
 it("allows samples only from presented products and rejects duplicates",()=>{
  expect(validateVisitProducts([A,B],[A])).toBeNull();
  expect(validateVisitProducts([A],[B])).toContain("شُرحت");
  expect(validateVisitProducts([A,A],[])).toContain("مكرر");
  expect(validateVisitProducts([A],[A,A])).toContain("مكرر");
 });
 it("keeps legacy payloads valid and validates new presented products",()=>{
  const base={doctorId:DOC,notes:"زيارة ناجحة جدا",status:"completed"};
  expect(visitSchema.safeParse(base).success).toBe(true);
  expect(visitSchema.parse(base).presentedProducts).toBeUndefined();
  expect(visitSchema.safeParse({...base,presentedProducts:[{productId:A,reaction:"interested"}]}).success).toBe(true);
  expect(visitSchema.safeParse({...base,presentedProducts:[{productId:A,reaction:"love"}]}).success).toBe(false);
  expect(visitSchema.safeParse({...base,presentedProducts:[{productId:"x",reaction:"neutral"}]}).success).toBe(false);
 });
});
