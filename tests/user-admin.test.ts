import {describe,expect,it} from "vitest";
import {validateUserAdminEdit} from "@/lib/user-admin";
describe("admin editing user roles",()=>{
 it("requires a product when changing a user to sales rep",()=>{expect(validateUserAdminEdit({actorId:"a",targetId:"b",role:"sales_rep",assignedProductId:"",active:true})).toBe("المنتج مطلوب للمندوب")});
 it("prevents an admin from demoting their own account",()=>{expect(validateUserAdminEdit({actorId:"a",targetId:"a",role:"sales_rep",assignedProductId:"p",active:true})).toBe("لا يمكنك تغيير دور حسابك الحالي")});
 it("allows editing another user role",()=>{expect(validateUserAdminEdit({actorId:"a",targetId:"b",role:"admin",assignedProductId:"",active:true})).toBeNull()});
});
