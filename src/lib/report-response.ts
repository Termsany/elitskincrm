// Fail closed on authentication redirects, API errors and incomplete report payloads.
export async function readReportResponse(response:Response):Promise<unknown>{
 if(!response.ok)throw new Error("تعذر تحميل التقرير. تحقق من الاتصال أو أعد تسجيل الدخول.");
 if(!response.headers.get("content-type")?.includes("application/json"))throw new Error("استجابة التقرير غير صالحة. أعد المحاولة.");
 const value:unknown=await response.json();
 if(!value||typeof value!=="object")throw new Error("بيانات التقرير غير مكتملة. أعد المحاولة.");
 const data=value as Record<string,unknown>;const totals=data.totals as Record<string,unknown>|undefined;
 if(!totals||typeof totals!=="object"||!["visits","active_reps","doctors","samples","orders"].every(key=>typeof totals[key]==="number")||!["repPerformance","visits","products","samples","sampleDoctors","coverage","sales","compliance"].every(key=>Array.isArray(data[key])))throw new Error("بيانات التقرير غير مكتملة. أعد المحاولة.");
 return value;
}
