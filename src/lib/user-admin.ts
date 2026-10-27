export function validateUserAdminEdit({actorId,targetId,role,assignedProductId,active}:{actorId:string;targetId:string;role?:string;assignedProductId?:string|null;active?:boolean}){
 if(actorId===targetId && role && role!=="admin") return "لا يمكنك تغيير دور حسابك الحالي";
 if(actorId===targetId && active===false) return "لا يمكنك إيقاف حسابك الحالي";
 if(role==="sales_rep" && !assignedProductId) return "المنتج مطلوب للمندوب";
 return null;
}
