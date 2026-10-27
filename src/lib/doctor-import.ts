export type DoctorImportRow={id:string;name:string;clinic_name:string;city:string;specialty:string;classification:string;phone:string;status:string};
const aliases:Record<keyof DoctorImportRow,string[]>={
 id:["id","معرف الطبيب","المعرف"],name:["name","اسم الطبيب","الطبيب"],clinic_name:["clinic_name","clinic","العيادة","اسم العيادة"],city:["city","المدينة"],specialty:["specialty","التخصص"],classification:["classification","class","التصنيف"],phone:["phone","mobile","الهاتف","الجوال"],status:["status","الحالة"]
};
export function matchesDoctorSearch(doctor:{name:string;clinic_name?:string;city?:string;specialty?:string;phone?:string},query:string){
 const q=query.trim().toLocaleLowerCase("ar");if(!q)return true;
 return [doctor.name,doctor.clinic_name,doctor.city,doctor.specialty,doctor.phone].some(value=>String(value||"").toLocaleLowerCase("ar").includes(q));
}

export function normalizeDoctorImportRow(input:Record<string,unknown>):DoctorImportRow{
 const normalized:Record<string,unknown>={};for(const [k,v] of Object.entries(input))normalized[k.trim().toLowerCase()]=v;
 const pick=(key:keyof DoctorImportRow)=>{for(const alias of aliases[key]){const value=normalized[alias.toLowerCase()];if(value!==undefined&&value!==null)return String(value).trim()}return ""};
 return {id:pick("id"),name:pick("name"),clinic_name:pick("clinic_name"),city:pick("city"),specialty:pick("specialty"),classification:pick("classification").toUpperCase(),phone:pick("phone"),status:pick("status")||"active"};
}
