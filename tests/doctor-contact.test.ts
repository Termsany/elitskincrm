import {describe,expect,it} from "vitest";
import {doctorContactPatchSchema} from "@/lib/validation";
describe("sales rep doctor contact edits",()=>{
 it("accepts mobile and email",()=>{expect(doctorContactPatchSchema.safeParse({phone:"0500000000",email:"doctor@example.com"}).success).toBe(true)});
 it("allows clearing email",()=>{expect(doctorContactPatchSchema.safeParse({email:""}).success).toBe(true)});
 it("rejects edits to medical master data",()=>{expect(doctorContactPatchSchema.safeParse({name:"Changed"}).success).toBe(false)});
 it("rejects malformed email",()=>{expect(doctorContactPatchSchema.safeParse({email:"bad"}).success).toBe(false)});
});
