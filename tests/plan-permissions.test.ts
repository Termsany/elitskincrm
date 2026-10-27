import {describe,expect,it} from "vitest";
import {resolvePlanCreation} from "@/lib/plan-permissions";
describe("admin plan ownership",()=>{
 it("creates an approved plan for the selected rep",()=>{expect(resolvePlanCreation({actorId:"admin",role:"admin",requestedUserId:"rep-1"})).toEqual({ownerId:"rep-1",status:"approved"})});
 it("requires the admin to select a rep",()=>{expect(()=>resolvePlanCreation({actorId:"admin",role:"admin",requestedUserId:""})).toThrow("اختر المندوب")});
 it("always assigns a rep plan to the rep account",()=>{expect(resolvePlanCreation({actorId:"rep-1",role:"sales_rep",requestedUserId:"rep-2"})).toEqual({ownerId:"rep-1",status:"pending"})});
});
