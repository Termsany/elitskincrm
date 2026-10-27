"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Label, Select, Badge } from "@/components/ui";
import Link from "next/link";

type User = { id:string; name:string; email:string; role:string; job_title:string; active:boolean; assigned_product_id:string|null; product_name:string|null };
type Product = { id:string; name:string; active:boolean };
type Target = { id:string; user_id:string; product_id:string; target_value:number; period_start:string; period_end:string; user_name:string; product_name:string };
type Doctor = { id:string; name:string; clinic_name:string; city:string; specialty:string; classification:string; phone:string; status:string };

export default function AdminClient({ users:initialUsers, products:initialProducts, targets:initialTargets, doctors }: { users:User[]; products:Product[]; targets:Target[]; doctors:Doctor[] }) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [products, setProducts] = useState(initialProducts);
  const [targets, setTargets] = useState(initialTargets);
  const [msg, setMsg] = useState<string|null>(null);
  const [tab, setTab] = useState<"reps"|"products"|"targets"|"doctors">("products");

  // New user form
  const [nuName,setNuName]=useState(""); const [nuEmail,setNuEmail]=useState(""); const [nuRole,setNuRole]=useState("sales_rep"); const [nuProd,setNuProd]=useState(""); const [nuPass,setNuPass]=useState("");
  // New product
  const [npName,setNpName]=useState("");
  // New target
  const [ntUser,setNtUser]=useState(""); const [ntProd,setNtProd]=useState(""); const [ntVal,setNtVal]=useState(100); const [ntStart,setNtStart]=useState(new Date().toISOString().slice(0,10)); const [ntEnd,setNtEnd]=useState(new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).toISOString().slice(0,10));
  // Edit user modal
  const [editingUser, setEditingUser]=useState<User|null>(null);
  const [editUser, setEditUser]=useState<Partial<User & {password:string}>>({});
  const [editJobTitle,setEditJobTitle]=useState("");
  // New doctor
  const [ndName,setNdName]=useState(""); const [ndClinic,setNdClinic]=useState(""); const [ndCity,setNdCity]=useState(""); const [ndPhone,setNdPhone]=useState(""); const [ndEmail,setNdEmail]=useState(""); const [ndSpec,setNdSpec]=useState(""); const [ndClass,setNdClass]=useState(""); const [doctorModal,setDoctorModal]=useState(false);

  async function api(path:string, opts:RequestInit){
    const r=await fetch(path,opts);
    const j=await r.json().catch(()=>null);
    if(!r.ok) throw new Error(j?.error ? (typeof j.error==="string"? j.error: JSON.stringify(j.error)): "خطأ");
    return j;
  }

  async function createUser(e:React.FormEvent){
    e.preventDefault();
    try{
      await api("/api/admin/users",{method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({name:nuName,email:nuEmail,role:nuRole,assigned_product_id: nuRole==="sales_rep"? nuProd: null, password:nuPass})});
      setMsg("تم إنشاء المستخدم"); setNuName(""); setNuEmail(""); setNuPass(""); router.refresh();
      const r=await fetch("/api/admin/users").then(x=>x.json()); setUsers(r.users);
    }catch(err:unknown){ setMsg(err instanceof Error? err.message: String(err)); }
  }
  async function toggleUserActive(u:User){
    await api(`/api/admin/users/${u.id}`,{method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify({active:!u.active})});
    setUsers(users.map(x=> x.id===u.id? {...x, active:!x.active}: x));
  }
  async function deleteUser(id:string){ if(!confirm("حذف المندوب؟")) return; await api(`/api/admin/users/${id}`,{method:"DELETE"}); setUsers(users.filter(x=>x.id!==id)); }
  async function updateUserProduct(id:string, prodId:string){
    await api(`/api/admin/users/${id}`,{method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify({assigned_product_id: prodId || null})});
    setUsers(users.map(x=> x.id===id? {...x, assigned_product_id: prodId || null, product_name: products.find(p=>p.id===prodId)?.name || null}: x));
  }
  async function resetPassword(id:string){
    const pw=prompt("كلمة المرور الجديدة (8+ أحرف)");
    if(!pw || pw.length<8) return;
    await api(`/api/admin/users/${id}`,{method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify({password:pw})});
    setMsg("تم تحديث كلمة المرور");
  }

  async function createProduct(e:React.FormEvent){
    e.preventDefault();
    await api("/api/admin/products",{method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({name:npName})});
    setNpName(""); const r=await fetch("/api/admin/products").then(x=>x.json()); setProducts(r.products); setMsg("تم إضافة المنتج");
  }
  async function deleteProduct(id:string){ if(!confirm("حذف المنتج؟")) return; await api(`/api/admin/products/${id}`,{method:"DELETE"}); setProducts(products.filter(x=>x.id!==id)); }

  async function createTarget(e:React.FormEvent){
    e.preventDefault();
    await api("/api/admin/targets",{method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({user_id:ntUser, product_id:ntProd, target_value:ntVal, period_start:ntStart, period_end:ntEnd})});
    const r=await fetch("/api/admin/targets").then(x=>x.json()); setTargets(r.targets); setMsg("تم حفظ الهدف");
  }

  async function deleteTarget(id:string){ await api(`/api/admin/targets/${id}`,{method:"DELETE"}); setTargets(targets.filter(x=>x.id!==id)); }
  async function createDoctor(e:React.FormEvent){
    e.preventDefault();
    try{
      await api("/api/admin/doctors",{method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({name:ndName, clinic_name:ndClinic, city:ndCity, phone:ndPhone, email:ndEmail, specialty:ndSpec, classification:ndClass})});
      setMsg("تم إضافة الطبيب"); setNdName(""); setNdClinic(""); setNdCity(""); setNdPhone(""); setNdEmail(""); setNdSpec(""); setNdClass(""); setDoctorModal(false); router.refresh();
    }catch(err:unknown){ setMsg(err instanceof Error? err.message: String(err)); }
  }
  async function bulkImportDoctors(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0]; if(!file) return;
    const text=await file.text();
    // Expect CSV with header: name,clinic_name,city,specialty,classification,phone
    const lines=text.split(/\r?\n/).filter(Boolean);
    const header=lines[0]?.toLowerCase()||"";
    const hasHeader = header.includes("name") || header.includes("الطبيب");
    const rows= (hasHeader? lines.slice(1): lines).map(l=>{
      const cols=l.split(",").map(c=>c.replace(/^"|"$/g,"").trim());
      return { name: cols[0]||"", clinic_name: cols[1]||"", city: cols[2]||"", specialty: cols[3]||"", classification: cols[4]||"", phone: cols[5]||"" };
    }).filter(r=> r.name);
    const r=await fetch("/api/admin/doctors/bulk",{method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({doctors: rows})});
    const j=await r.json();
    setMsg(`استيراد: ${j.inserted} تم، ${j.skipped} تخطي` + (j.errors?.length? " — "+j.errors[0]:""));
    if(j.inserted) router.refresh();
  }

  // Doctor inline edit
  const [editingDoctor, setEditingDoctor]=useState<string|null>(null);
  const [editDoc, setEditDoc]=useState<Partial<Doctor>>({});
  async function saveDoctor(id:string){
    await api(`/api/admin/doctors/${id}`,{method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify(editDoc)});
    setEditingDoctor(null); router.refresh();
  }
  async function deleteDoctor(id:string){ if(!confirm("حذف الطبيب؟")) return; await api(`/api/admin/doctors/${id}`,{method:"DELETE"}); router.refresh(); }

  return (
    <div className="mt-6 space-y-4">
      {msg && <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3 flex justify-between"><span>{msg}</span><button onClick={()=>setMsg(null)} className="font-bold">×</button></div>}
      <div className="flex gap-2 flex-wrap">
        {([
          ["products","المنتجات"],
          ["targets","الأهداف"],
          ["doctors","الأطباء"],
        ] as const).map(([k,label])=>(
          <button key={k} onClick={()=>setTab(k)} className={`rounded-xl px-4 py-2 text-sm font-bold border ${tab===k? "bg-[var(--navy)] text-white border-[var(--navy)]": "bg-white border-[var(--border)]"}`}>{label}</button>
        ))}
        <Link href="/admin/reports" className="rounded-xl px-4 py-2 text-sm font-bold border bg-[var(--gold)] border-[var(--gold)] text-[var(--navy)]">التقارير</Link>
      </div>

      {tab==="reps" && (
        <>
          <Card className="p-5">
            <div className="font-bold mb-1">إدخال مستخدم يدويًا</div>
            <div className="text-xs text-[var(--muted)] mb-3">أضف مندوبًا أو مديرًا وحدد الدور والمنتج وكلمة المرور يدويًا</div>
            <form onSubmit={createUser} className="grid md:grid-cols-3 gap-3">
              <div><Label>الاسم</Label><Input value={nuName} onChange={e=>setNuName(e.target.value)} required /></div>
              <div><Label>البريد</Label><Input value={nuEmail} onChange={e=>setNuEmail(e.target.value)} placeholder="name@eliteskinsa.com" required type="email" /></div>
              <div><Label>الدور</Label><Select value={nuRole} onChange={e=>setNuRole(e.target.value)}><option value="sales_rep">مندوب</option><option value="admin">مدير</option></Select></div>
              {nuRole==="sales_rep" && <div><Label>المنتج</Label><Select value={nuProd} onChange={e=>setNuProd(e.target.value)} required><option value="">اختر المنتج</option>{products.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>}
              <div><Label>كلمة المرور</Label><Input value={nuPass} onChange={e=>setNuPass(e.target.value)} required type="password" placeholder="8+ أحرف" /></div>
              <div className="flex items-end"><Button type="submit" className="w-full">إضافة</Button></div>
            </form>
          </Card>
          <Card className="overflow-hidden">
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--bg)] text-xs text-[var(--muted)]"><tr><th className="text-right p-3">الاسم</th><th className="text-right p-3">البريد</th><th className="text-right p-3">الدور</th><th className="text-right p-3">المنتج</th><th className="text-right p-3">الحالة</th><th className="text-right p-3">إجراءات</th></tr></thead>
                <tbody>
                  {users.map(u=>(
                    <tr key={u.id} className="border-t border-[var(--border)]">
                      <td className="p-3 font-semibold"><Link href={`/admin/rep/${u.id}`} className="text-[var(--navy)] hover:underline">{u.name}</Link></td>
                      <td className="p-3 text-xs" dir="ltr">{u.email}</td>
                      <td className="p-3"><Badge tone={u.role==="admin"?"info":"neutral"}>{u.role==="admin"?"مدير":"مندوب"}</Badge></td>
                      <td className="p-3">
                        {u.role==="sales_rep" ? (
                          <select value={u.assigned_product_id||""} onChange={e=>updateUserProduct(u.id, e.target.value)} className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs">
                            <option value="" disabled>اختر المنتج</option>
                            {products.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        ) : <span className="text-xs text-[var(--muted)]">—</span>}
                      </td>
                      <td className="p-3"><button onClick={()=>toggleUserActive(u)} className={`text-xs rounded-full px-2 py-1 border ${u.active? "bg-emerald-50 border-emerald-200 text-emerald-800":"bg-red-50 border-red-200 text-red-800"}`}>{u.active?"نشط":"موقف"}</button></td>
                      <td className="p-3 flex gap-1 flex-wrap">
                        <button onClick={()=>{setEditingUser(u); setEditUser({name:u.name, email:u.email, role:u.role as "admin"|"sales_rep", job_title:u.job_title||"", assigned_product_id:u.assigned_product_id||"", active:u.active, password:""}); setEditJobTitle(u.job_title||"");}} className="rounded-lg bg-[var(--navy)] text-white px-2 py-1 text-xs font-bold">تعديل الدور والبيانات</button>
                        <Link href={`/admin/rep/${u.id}`} className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs">التفاصيل</Link>
                        <button onClick={()=>resetPassword(u.id)} className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs">كلمة المرور</button>
                        <button onClick={()=>deleteUser(u.id)} className="rounded-lg border border-red-200 text-red-700 px-2 py-1 text-xs">حذف</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {editingUser && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl p-5 w-full max-w-[480px] space-y-3 max-h-[90vh] overflow-auto">
                <div className="font-bold text-lg">تعديل الدور وبيانات المستخدم</div>
                <div><Label>الاسم</Label><Input value={editUser.name||""} onChange={e=>setEditUser({...editUser, name:e.target.value})} /></div>
                <div><Label>البريد</Label><Input value={editUser.email||""} onChange={e=>setEditUser({...editUser, email:e.target.value})} dir="ltr" /></div>
                <div><Label>المسمى الوظيفي</Label><Select value={["MED REP","KEY ACCOUNT EXECUTIVE","KEY ACCOUNT MANAGER"].includes(editJobTitle)?editJobTitle:"manual"} onChange={e=>{const v=e.target.value;setEditJobTitle(v==="manual"?"":v);}}><option value="MED REP">MED REP</option><option value="KEY ACCOUNT EXECUTIVE">KEY ACCOUNT EXECUTIVE</option><option value="KEY ACCOUNT MANAGER">KEY ACCOUNT MANAGER</option><option value="manual">إدخال يدوي</option></Select>{(!["MED REP","KEY ACCOUNT EXECUTIVE","KEY ACCOUNT MANAGER"].includes(editJobTitle))&&<Input value={editJobTitle} onChange={e=>setEditJobTitle(e.target.value)} placeholder="اكتب المسمى الوظيفي" className="mt-2"/>}</div>
                <div><Label>الدور الداخلي</Label><Select value={editUser.role as string} onChange={e=>setEditUser({...editUser, role:e.target.value as "admin"|"sales_rep"})}><option value="sales_rep">مستخدم ميداني</option><option value="admin">مدير النظام</option></Select></div>
                {(editUser.role==="sales_rep") && <div><Label>المنتج</Label><Select value={editUser.assigned_product_id||""} onChange={e=>setEditUser({...editUser, assigned_product_id:e.target.value})}><option value="">— اختر —</option>{products.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>}
                <div className="flex items-center gap-2"><input type="checkbox" checked={!!editUser.active} onChange={e=>setEditUser({...editUser, active:e.target.checked})} id="editActive" /><label htmlFor="editActive" className="text-sm">نشط</label></div>
                <div><Label>كلمة مرور جديدة (اختياري)</Label><Input type="password" value={editUser.password||""} onChange={e=>setEditUser({...editUser, password:e.target.value})} placeholder="اتركه فارغ إذا لا تريد التغيير" /></div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={()=>setEditingUser(null)}>إلغاء</Button>
                  <Button onClick={async ()=>{
                    if(editUser.role==="sales_rep"&&!editUser.assigned_product_id){setMsg("اختر المنتج قبل تحويل المستخدم إلى مندوب");return;}
                    const payload:Record<string,unknown>={};
                    if(editUser.name) payload.name=editUser.name;
                    payload.job_title=editJobTitle.trim();
                    if(editUser.email) payload.email=editUser.email;
                    if(editUser.role) payload.role=editUser.role;
                    if(editUser.role==="sales_rep") payload.assigned_product_id=editUser.assigned_product_id||null;
                    if(editUser.active!==undefined) payload.active=editUser.active;
                    if(editUser.password && String(editUser.password).length>=8) payload.password=editUser.password;
                    try{
                      await api(`/api/admin/users/${editingUser.id}`,{method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify(payload)});
                      setMsg("تم تحديث الدور والبيانات"); setEditingUser(null);
                      const r=await fetch("/api/admin/users").then(x=>x.json()); setUsers(r.users);
                    }catch(err:unknown){setMsg(err instanceof Error?err.message:String(err));}
                  }}>حفظ</Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab==="products" && (
        <>
          <Card className="p-5">
            <form onSubmit={createProduct} className="flex gap-2">
              <Input value={npName} onChange={e=>setNpName(e.target.value)} placeholder="اسم المنتج" required className="flex-1" />
              <Button type="submit">إضافة منتج</Button>
            </form>
          </Card>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg)] text-xs text-[var(--muted)]"><tr><th className="text-right p-3">المنتج</th><th className="text-right p-3">الحالة</th><th className="text-right p-3">إجراء</th></tr></thead>
              <tbody>
                {products.map(p=>(
                  <tr key={p.id} className="border-t border-[var(--border)]">
                    <td className="p-3 font-semibold">{p.name}</td>
                    <td className="p-3 text-xs">{p.active?"نشط":"موقف"}</td>
                    <td className="p-3"><button onClick={()=>deleteProduct(p.id)} className="rounded-lg border border-red-200 text-red-700 px-2 py-1 text-xs">حذف</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tab==="targets" && (
        <>
          <Card className="p-5">
            <div className="font-bold mb-3">تحديد هدف</div>
            <form onSubmit={createTarget} className="grid md:grid-cols-5 gap-3">
              <div><Label>المندوب</Label><Select value={ntUser} onChange={e=>{setNtUser(e.target.value); const u=users.find(x=>x.id===e.target.value); if(u?.assigned_product_id) setNtProd(u.assigned_product_id);}} required><option value="">اختر</option>{users.filter(u=>u.role==="sales_rep").map(u=> <option key={u.id} value={u.id}>{u.name}</option>)}</Select></div>
              <div><Label>المنتج</Label><Select value={ntProd} onChange={e=>setNtProd(e.target.value)} required><option value="">اختر</option>{products.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
              <div><Label>الهدف</Label><Input type="number" value={ntVal} onChange={e=>setNtVal(parseInt(e.target.value||"0",10))} required /></div>
              <div><Label>من</Label><Input type="date" value={ntStart} onChange={e=>setNtStart(e.target.value)} required /></div>
              <div><Label>إلى</Label><Input type="date" value={ntEnd} onChange={e=>setNtEnd(e.target.value)} required /></div>
              <div className="md:col-span-5"><Button type="submit" className="w-full">حفظ الهدف</Button></div>
            </form>
          </Card>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg)] text-xs text-[var(--muted)]"><tr><th className="text-right p-3">المندوب</th><th className="text-right p-3">المنتج</th><th className="text-right p-3">الهدف</th><th className="text-right p-3">الفترة</th><th className="text-right p-3">إجراء</th></tr></thead>
              <tbody>
                {targets.map(t=>(
                  <tr key={t.id} className="border-t border-[var(--border)]">
                    <td className="p-3">{t.user_name}</td>
                    <td className="p-3">{t.product_name}</td>
                    <td className="p-3 font-bold">{t.target_value}</td>
                    <td className="p-3 text-xs">{String(t.period_start).slice(0,10)} → {String(t.period_end).slice(0,10)}</td>
                    <td className="p-3"><button onClick={()=>deleteTarget(t.id)} className="rounded-lg border border-red-200 text-red-700 px-2 py-1 text-xs">حذف</button></td>
                  </tr>
                ))}
                {targets.length===0 && <tr><td colSpan={5} className="p-6 text-center text-[var(--muted)]">لا أهداف بعد</td></tr>}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tab==="doctors" && (
        <>
          <div className="flex items-center justify-between rounded-2xl bg-white border border-[var(--border)] p-4">
            <div><div className="font-extrabold">إدارة الأطباء والعيادات</div><div className="text-xs text-[var(--muted)] mt-1">إضافة طبيب جديد مباشرة إلى قاعدة الأطباء</div></div>
            <Button onClick={()=>setDoctorModal(true)} className="min-h-11">+ إضافة طبيب</Button>
          </div>
          {doctorModal&&<div className="fixed inset-0 z-50 bg-black/45 grid place-items-center p-4" onClick={()=>setDoctorModal(false)}><div className="w-full max-w-2xl" onClick={e=>e.stopPropagation()}><div className="rounded-2xl bg-white p-5 max-h-[90vh] overflow-auto"><div className="flex items-center justify-between mb-4"><div><div className="text-xl font-extrabold">إضافة طبيب جديد</div><div className="text-xs text-[var(--muted)] mt-1">سيتم حفظ الطبيب مباشرة في قاعدة البيانات</div></div><button type="button" onClick={()=>setDoctorModal(false)} className="h-9 w-9 rounded-full border">×</button></div><form onSubmit={createDoctor} className="grid md:grid-cols-2 gap-3"><div><label className="text-xs font-semibold text-[var(--muted)]">اسم الطبيب *</label><Input name="name" value={ndName} onChange={e=>setNdName(e.target.value)} required /></div><div><label className="text-xs font-semibold text-[var(--muted)]">اسم العيادة</label><Input name="clinic_name" value={ndClinic} onChange={e=>setNdClinic(e.target.value)} /></div><div><label className="text-xs font-semibold text-[var(--muted)]">المنطقة</label><Input name="city" value={ndCity} onChange={e=>setNdCity(e.target.value)} /></div><div><label className="text-xs font-semibold text-[var(--muted)]">رقم الجوال</label><Input name="phone" value={ndPhone} onChange={e=>setNdPhone(e.target.value)} dir="ltr" /></div><div><label className="text-xs font-semibold text-[var(--muted)]">الإيميل</label><Input name="email" value={ndEmail} onChange={e=>setNdEmail(e.target.value)} type="email" dir="ltr" /></div><div><label className="text-xs font-semibold text-[var(--muted)]">Class</label><Select name="classification" value={ndClass} onChange={e=>setNdClass(e.target.value)}><option value="">بدون تصنيف</option><option value="A">A</option><option value="B">B</option><option value="C">C</option></Select></div><div className="md:col-span-2 flex gap-2 mt-2"><Button type="submit" className="flex-1">إضافة مباشرة</Button><Button type="button" variant="outline" onClick={()=>setDoctorModal(false)}>إلغاء</Button></div></form></div></div></div>}
          <div className="hidden rounded-2xl bg-white border border-[var(--border)] p-5">
            <div className="font-bold mb-3">إضافة طبيب جديد</div>
            <form onSubmit={async (e:React.FormEvent)=>{e.preventDefault(); const fd=new FormData(e.target as HTMLFormElement); const body={name:String(fd.get("name")||""), clinic_name:String(fd.get("clinic_name")||""), city:String(fd.get("city")||""), phone:String(fd.get("phone")||""), specialty:String(fd.get("specialty")||""), classification:String(fd.get("classification")||"")}; try{await api("/api/admin/doctors",{method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body)}); setMsg("تم إضافة الطبيب"); (e.target as HTMLFormElement).reset(); router.refresh(); }catch(err:unknown){ setMsg(err instanceof Error? err.message:String(err));}}} className="grid md:grid-cols-3 gap-3">
              <div><label className="text-xs font-semibold text-[var(--muted)]">اسم الطبيب *</label><input name="name" required className="w-full rounded-xl border border-[var(--border)] px-3.5 py-2.5 text-sm" /></div>
              <div><label className="text-xs font-semibold text-[var(--muted)]">العيادة</label><input name="clinic_name" className="w-full rounded-xl border border-[var(--border)] px-3.5 py-2.5 text-sm" /></div>
              <div><label className="text-xs font-semibold text-[var(--muted)]">المدينة</label><input name="city" className="w-full rounded-xl border border-[var(--border)] px-3.5 py-2.5 text-sm" /></div>
              <div><label className="text-xs font-semibold text-[var(--muted)]">التخصص</label><input name="specialty" placeholder="Derma" className="w-full rounded-xl border border-[var(--border)] px-3.5 py-2.5 text-sm" /></div>
              <div><label className="text-xs font-semibold text-[var(--muted)]">التصنيف</label><select name="classification" className="w-full rounded-xl border border-[var(--border)] px-3.5 py-2.5 text-sm"><option value="">—</option><option value="A">A</option><option value="B">B</option><option value="C">C</option></select></div>
              <div><label className="text-xs font-semibold text-[var(--muted)]">الهاتف</label><input name="phone" dir="ltr" className="w-full rounded-xl border border-[var(--border)] px-3.5 py-2.5 text-sm" /></div>
              <div className="md:col-span-3"><button type="submit" className="w-full rounded-xl bg-[var(--navy)] text-white py-2.5 text-sm font-bold">إضافة طبيب</button></div>
            </form>
            <div className="flex gap-2 mt-3 flex-wrap">
              <a href="/api/exports/doctors" className="rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-bold">تصدير CSV</a>
              <label className="rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-bold cursor-pointer">استيراد CSV
                <input type="file" accept=".csv" className="hidden" onChange={async (e:React.ChangeEvent<HTMLInputElement>)=>{
                  const file=e.target.files?.[0]; if(!file) return;
                  const text=await file.text();
                  const lines=text.split(/\r?\n/).filter(Boolean);
                  const header=(lines[0]||"").toLowerCase();
                  const hasHeader=header.includes("name")||header.includes("الطبيب");
                  const rows=(hasHeader? lines.slice(1): lines).map(l=>{
                    const cols=l.split(",").map(c=>c.replace(/^"|"$/g,"").trim());
                    return {name:cols[0]||"", clinic_name:cols[1]||"", city:cols[2]||"", specialty:cols[3]||"", classification:cols[4]||"", phone:cols[5]||""};
                  }).filter(r=> r.name);
                  const r=await fetch("/api/admin/doctors/bulk",{method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({doctors: rows})});
                  const j=await r.json();
                  setMsg(`استيراد: ${j.inserted} تم، ${j.skipped} تخطي` + (j.errors?.length? " — "+j.errors[0]:""));
                  if(j.inserted) router.refresh();
                }} />
              </label>
              <a href="/admin/doctor-stats" className="rounded-xl bg-[var(--gold)] text-[var(--navy)] px-4 py-2 text-sm font-bold">أداء الأطباء</a>
              <span className="text-xs text-[var(--muted)] py-2">CSV: name, clinic_name, city, specialty, classification, phone</span>
            </div>
          </div>
          <div className="rounded-2xl bg-white border border-[var(--border)] overflow-hidden">
          <div className="p-4 flex items-center justify-between border-b border-[var(--border)]">
            <div className="font-bold">الأطباء والعيادات</div>
            <div className="text-xs text-[var(--muted)]">{doctors.length} طبيب</div>
          </div>
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg)] text-xs text-[var(--muted)] sticky top-0"><tr><th className="text-right p-3">الطبيب</th><th className="text-right p-3">العيادة</th><th className="text-right p-3">المدينة</th><th className="text-right p-3">الهاتف</th><th className="text-right p-3">إجراء</th></tr></thead>
              <tbody>
                {doctors.map(d=>(
                  <tr key={d.id} className="border-t border-[var(--border)]">
                    <td className="p-3">
                      {editingDoctor===d.id ? <Input value={editDoc.name ?? d.name} onChange={e=>setEditDoc({...editDoc, name:e.target.value})} className="text-xs" /> : d.name}
                    </td>
                    <td className="p-3">{editingDoctor===d.id ? <Input value={editDoc.clinic_name ?? d.clinic_name} onChange={e=>setEditDoc({...editDoc, clinic_name:e.target.value})} className="text-xs" /> : d.clinic_name}</td>
                    <td className="p-3">{editingDoctor===d.id ? <Input value={editDoc.city ?? d.city} onChange={e=>setEditDoc({...editDoc, city:e.target.value})} className="text-xs" /> : d.city}</td>
                    <td className="p-3 text-xs" dir="ltr">{editingDoctor===d.id ? <Input value={editDoc.phone ?? d.phone} onChange={e=>setEditDoc({...editDoc, phone:e.target.value})} className="text-xs" /> : d.phone || "—"}</td>
                    <td className="p-3 flex gap-1">
                      {editingDoctor===d.id ? (
                        <>
                          <button onClick={()=>saveDoctor(d.id)} className="rounded-lg bg-emerald-600 text-white px-2 py-1 text-xs">حفظ</button>
                          <button onClick={()=>setEditingDoctor(null)} className="rounded-lg border px-2 py-1 text-xs">إلغاء</button>
                        </>
                      ) : (
                        <>
                          <button onClick={()=>{setEditingDoctor(d.id); setEditDoc({});}} className="rounded-lg border px-2 py-1 text-xs">تعديل</button>
                          <button onClick={()=>deleteDoctor(d.id)} className="rounded-lg border border-red-200 text-red-700 px-2 py-1 text-xs">حذف</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
