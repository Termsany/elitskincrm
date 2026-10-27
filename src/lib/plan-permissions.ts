export function resolvePlanCreation({actorId,role,requestedUserId}:{actorId:string;role:string;requestedUserId?:string}){
 if(role==="admin"){
  if(!requestedUserId)throw new Error("اختر المندوب");
  return {ownerId:requestedUserId,status:"approved" as const};
 }
 return {ownerId:actorId,status:"pending" as const};
}
