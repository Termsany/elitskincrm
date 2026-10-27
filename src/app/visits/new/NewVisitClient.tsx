"use client";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Textarea, Label } from "@/components/ui";
import { Icon } from "@/components/Icon";

import { getVisitStatusMeta } from "@/lib/visit-workflow";
import { PURPOSE_LABELS, REACTION_LABELS, collectSampleItems, type Reaction, type SamplePurpose, type SampleRow } from "@/lib/visit-entry";
import { classifyOfflineResponse, ensureIdempotencyKey } from "@/lib/idempotency-queue";

type Doctor = { id:string; name:string; clinic_name:string; city:string };
type Product = { id:string; name:string };
type Presented = { productId:string; reaction:Reaction };
type AttachItem = { id:number; file:File; preview:string|null; progress:number; state:"ready"|"uploading"|"done"|"error"; error?:string };

const PRODUCT_DESC: Record<string, string> = {
  "ARCHE": "مقوي نمو الشعر — شيتوزان طبي",
  "DERMOMINE": "طقم الزراعة الدقيقة — t-lab",
  "GRO": "GRO — نمو الشعر",
  "SPECTRA LAB": "SPECTRA LAB",
};
const REACTION_ICONS: Record<Reaction, string> = { interested: "👍", neutral: "😐", not_interested: "👎" };
const MAX_FILES = 10;
const MAX_BYTES = 10 * 1024 * 1024;

function ProductThumb({ id, name }: { id: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="flex h-full w-full items-center justify-center bg-slate-100 text-lg font-extrabold text-[var(--navy)]">{name.slice(0, 2).toUpperCase()}</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/products/${id}/image`} alt={name} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />;
}

async function prepareFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!blob || (file.type === "image/jpeg" && blob.size >= file.size)) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function uploadWithProgress(visitId: string, file: File, onProgress: (percent: number) => void): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/visits/${visitId}/attachments`);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve({ ok: true });
      let message = "تعذر رفع الملف";
      try { const body = JSON.parse(xhr.responseText); if (typeof body?.error === "string") message = body.error; } catch {}
      resolve({ ok: false, error: message });
    };
    xhr.onerror = () => resolve({ ok: false, error: "انقطع الاتصال أثناء الرفع" });
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

export default function NewVisitClient({ doctors, products, assignedProductId, role, initialDoctorId="", initialProductId="" }: { doctors: Doctor[]; products: Product[]; assignedProductId: string|null; role: string; initialDoctorId?:string; initialProductId?:string }) {
  const router = useRouter();
  const initialDoctor=doctors.find(d=>d.id===initialDoctorId);
  const [doctorId, setDoctorId] = useState(initialDoctor?.id||"");
  const [q, setQ] = useState(initialDoctor?`${initialDoctor.name} · ${initialDoctor.clinic_name}`:"");
  const [showList,setShowList]=useState(false);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("completed");
  const [presented, setPresented] = useState<Presented[]>(() => initialProductId ? [{productId:initialProductId,reaction:"neutral"}] : []);
  const [sampleMode, setSampleMode] = useState<"yes"|"no">("no");
  const [sampleRows, setSampleRows] = useState<SampleRow[]>([]);
  const [err, setErr] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  const [gps, setGps]=useState<{lat:number; lng:number; accuracy_m:number}|null>(null);
  const [gpsStatus,setGpsStatus]=useState("لم يتم التقاط الموقع بعد");
  const [gpsLoading,setGpsLoading]=useState(false);
  const [followUpAt,setFollowUpAt]=useState(""); const [followUpNote,setFollowUpNote]=useState("");
  const [offlineQueued,setOfflineQueued]=useState(0);
  const [files, setFiles] = useState<AttachItem[]>([]);
  const [savedVisitId, setSavedVisitId] = useState<string|null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const fileCounter = useRef(0);
  const filesRef = useRef<AttachItem[]>([]);
  const syncingQueue=useRef(false);
  const QUEUE_KEY="elite_offline_visits";

  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => () => { filesRef.current.forEach((item) => { if (item.preview) URL.revokeObjectURL(item.preview); }); }, []);

  // Auto GPS on mount (with permission)
  useEffect(()=>{
    if(!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition((pos)=>{
      setGps({lat:pos.coords.latitude, lng:pos.coords.longitude, accuracy_m: pos.coords.accuracy});
      setGpsStatus(`تم تلقائيا: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)} (±${Math.round(pos.coords.accuracy)}م)`);
      setGpsLoading(false);
    }, ()=>{ setGpsStatus("اضغط تحديد موقعي لتسجيل الموقع"); setGpsLoading(false); }, { enableHighAccuracy:true, timeout:8000, maximumAge:60000 });
  },[]);

  const filtered = useMemo(()=>{
    const s = q.trim().toLowerCase();
    if (!s) return doctors.slice(0, 8);
    return doctors.filter(d => `${d.name} ${d.clinic_name} ${d.city}`.toLowerCase().includes(s)).slice(0, 8);
  }, [q, doctors]);

  const orderedProducts = useMemo(() => [...products].sort((a, b) => Number(b.id === assignedProductId) - Number(a.id === assignedProductId) || a.name.localeCompare(b.name)), [products, assignedProductId]);

  function captureGps(){
    if(!navigator.geolocation){ setGpsStatus("المتصفح لا يدعم GPS"); return; }
    setGpsLoading(true); setGpsStatus("جاري تحديد الموقع...");
    navigator.geolocation.getCurrentPosition((pos)=>{
      setGps({lat:pos.coords.latitude, lng:pos.coords.longitude, accuracy_m: pos.coords.accuracy});
      setGpsStatus(`تم: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)} (±${Math.round(pos.coords.accuracy)}م)`);
      setGpsLoading(false);
    }, (err)=> {setGpsStatus("فشل: " + err.message); setGpsLoading(false);}, { enableHighAccuracy:true, timeout:10000 });
  }

  function queueOffline(payload:unknown){
    const arr=JSON.parse(localStorage.getItem(QUEUE_KEY)||"[]");
    arr.push({ payload, at: new Date().toISOString() });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(arr));
    setOfflineQueued(arr.length);
  }
  const flushQueue=useCallback(async()=>{
    if(syncingQueue.current)return;
    let arr:Array<{payload:unknown}>;
    try{arr=JSON.parse(localStorage.getItem(QUEUE_KEY)||"[]");}catch{setErr("تعذر قراءة الزيارات المحفوظة");return;}
    if(!arr.length){setOfflineQueued(0);return;}
    syncingQueue.current=true;
    let ok=0;
    try{
      for(const item of arr){
        let response:Response;
        try{response=await fetch("/api/visits",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(item.payload)});}catch{break;}
        const classification = classifyOfflineResponse(response.status);
        if (classification === "success") { ok++; continue; }
        if (classification === "quarantine") {
          const failed = JSON.parse(localStorage.getItem("elite_offline_failed_visits") || "[]");
          failed.push({ payload: item.payload, at: new Date().toISOString(), status: response.status });
          localStorage.setItem("elite_offline_failed_visits", JSON.stringify(failed.slice(-50)));
          ok++;
          continue;
        }
        break;
      }
    }finally{syncingQueue.current=false;}
    const remaining=arr.slice(ok);
    localStorage.setItem(QUEUE_KEY,JSON.stringify(remaining));
    setOfflineQueued(remaining.length);
    if(ok)alert(`تمت مزامنة ${ok} زيارة`);
    if(ok>0&&remaining.length===0){router.push("/visits");router.refresh();}
    },[router]);
  useEffect(()=>{ try{ const arr=JSON.parse(localStorage.getItem(QUEUE_KEY)||"[]"); setOfflineQueued(arr.length);}catch{} },[]);
  useEffect(()=>{const onOnline=()=>{void flushQueue()};window.addEventListener("online",onOnline);return()=>window.removeEventListener("online",onOnline)},[flushQueue]);

  function togglePresented(productId: string) {
    setPresented((prev) => prev.some((x) => x.productId === productId) ? prev.filter((x) => x.productId !== productId) : [...prev, { productId, reaction: "neutral" }]);
    setSampleRows((prev) => prev.filter((x) => x.productId !== productId));
  }
  function setReaction(productId: string, reaction: Reaction) {
    setPresented((prev) => prev.map((x) => x.productId === productId ? { ...x, reaction } : x));
  }
  function updateSample(productId: string, patch: Partial<SampleRow>) {
    setSampleRows((prev) => prev.some((x) => x.productId === productId)
      ? prev.map((x) => x.productId === productId ? { ...x, ...patch } : x)
      : [...prev, { productId, quantity: 1, purpose: "", ...patch }]);
  }

  async function addFiles(list: FileList | null) {
    if (!list || !list.length) return;
    const room = MAX_FILES - filesRef.current.length;
    if (room <= 0) { setErr(`الحد الأقصى ${MAX_FILES} ملفات`); return; }
    const picked = Array.from(list).slice(0, room);
    const prepared = await Promise.all(picked.map(prepareFile));
    const items: AttachItem[] = prepared.map((file) => {
      const tooBig = file.size > MAX_BYTES;
      return { id: ++fileCounter.current, file, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null, progress: 0, state: tooBig ? "error" : "ready", error: tooBig ? "الملف أكبر من 10MB" : undefined };
    });
    setFiles((prev) => [...prev, ...items]);
  }
  function removeFile(id: number) {
    setFiles((prev) => { const hit = prev.find((x) => x.id === id); if (hit?.preview) URL.revokeObjectURL(hit.preview); return prev.filter((x) => x.id !== id); });
  }
  function patchFile(id: number, patch: Partial<AttachItem>) {
    setFiles((prev) => prev.map((x) => x.id === id ? { ...x, ...patch } : x));
  }

  async function uploadPending(visitId: string) {
    const pending = filesRef.current.filter((x) => x.state !== "done" && !(x.state === "error" && x.error === "الملف أكبر من 10MB"));
    let failed = filesRef.current.filter((x) => x.state === "error" && x.error === "الملف أكبر من 10MB").length;
    for (const item of pending) {
      patchFile(item.id, { state: "uploading", progress: 0, error: undefined });
      const result = await uploadWithProgress(visitId, item.file, (percent) => patchFile(item.id, { progress: percent }));
      if (result.ok) patchFile(item.id, { state: "done", progress: 100 });
      else { failed++; patchFile(item.id, { state: "error", error: result.error }); }
    }
    if (failed === 0) { router.push("/visits"); router.refresh(); return; }
    setErr(`تم حفظ الزيارة، لكن تعذر رفع ${failed} ملف. أعد المحاولة أو تابع دون الملفات.`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setErr(null);
    if (savedVisitId) { setLoading(true); try { await uploadPending(savedVisitId); } finally { setLoading(false); } return; }
    if (!doctorId) { setErr("اختر الطبيب والعيادة أولا"); return; }
    if (notes.trim().length < 10) { setErr("الملاحظات مطلوبة (10 أحرف على الأقل) — اكتب نتيجة الزيارة"); return; }
    const collected = collectSampleItems(sampleMode, sampleRows);
    if (collected.error) { setErr(collected.error); return; }
    setLoading(true);
    let payload: Record<string,unknown> = {
      doctorId, notes, status,
      idempotencyKey,
      presentedProducts: presented,
      sampleItems: collected.items,
      orderItems: [],
    };
    if(gps){ payload.lat=gps.lat; payload.lng=gps.lng; payload.accuracy_m=gps.accuracy_m; }
    if(followUpAt) payload.follow_up_at=followUpAt;
    if(followUpNote) payload.follow_up_note=followUpNote;
    payload = ensureIdempotencyKey(payload, () => crypto.randomUUID());
    let responseReceived = false;
    let serverRejected = false;
    try{
      const res = await fetch("/api/visits", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify(payload) });
      responseReceived = true;
      let j: { id?: unknown; error?: unknown } | null = null;
      try { j = await res.json(); } catch { if (res.ok) throw new Error("تعذر قراءة استجابة الحفظ"); }
      const responseId = (j as { id?: unknown } | null)?.id;
      if (res.ok && (typeof responseId !== "string" || !responseId.trim())) throw new Error("invalid save response");
      if (!res.ok) { serverRejected = true; throw new Error(j?.error ? (typeof j.error==="string"? j.error : JSON.stringify(j.error)) : "فشل الحفظ"); }
      const visitId = String((j as { id?: unknown }).id);
      setSavedVisitId(visitId);
      if (filesRef.current.length) await uploadPending(visitId);
      else { router.push("/visits"); router.refresh(); }
    }catch(err: unknown){
      if(!serverRejected && (!navigator.onLine || !responseReceived || String(err).includes("Failed to fetch") || String(err).includes("تعذر قراءة استجابة الحفظ") || String(err).includes("invalid save response"))){
        queueOffline(payload);
        setErr(filesRef.current.length
          ? "لا يوجد اتصال — حُفظت الزيارة محليا وستُرفع تلقائيا عند عودة النت. الملفات المرفقة لن تُرفع تلقائيا، أضفها لاحقا من صفحة الزيارات."
          : "لا يوجد اتصال — تم حفظ الزيارة محليا وسيتم رفعها تلقائيا عند عودة النت");
      } else {
        setErr(err instanceof Error? err.message: String(err));
      }
    } finally { setLoading(false); }
  }

  const selectedDoctor = doctors.find(d=> d.id===doctorId);
  const notesLen = notes.trim().length;
  const notesOk = notesLen >= 10;
  const sampleState = collectSampleItems(sampleMode, sampleRows);
  const sampleInvalid = !!sampleState.error;
  const step = !doctorId ? 1 : presented.length === 0 ? 2 : sampleInvalid ? 3 : 4;
  const presentedProducts = presented.map((x) => ({ ...x, product: products.find((p) => p.id === x.productId) })).filter((x) => x.product);
  const locked = !!savedVisitId;

  return (
    <div className="max-w-[640px] mx-auto">
      {/* Header */}
      <div className="rounded-2xl bg-[var(--navy)] text-white p-5 flex items-center justify-between">
        <div>
          <div className="text-[11px] tracking-widest text-[var(--gold)] font-bold">ELITE SKIN CRM</div>
          <div className="text-lg font-extrabold mt-0.5">تسجيل زيارة جديدة</div>
          <div className="text-xs text-white/70 mt-1">التاريخ والوقت يتسجلان تلقائيا — {new Date().toLocaleDateString("ar-EG",{weekday:"long", year:"numeric", month:"long", day:"numeric"})} — {new Date().toLocaleTimeString("ar-EG",{hour:"2-digit", minute:"2-digit"})}</div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="flex gap-1.5">
            {[1,2,3,4].map(n=> <span key={n} className={`h-2 w-6 rounded-full sm:w-8 ${n<=step? "bg-[var(--gold)]":"bg-white/20"}`} />)}
          </div>
          <span className="text-[11px] text-white/60">خطوة {step} من 4</span>
        </div>
      </div>

      {offlineQueued>0 && (
        <div className="mt-3 rounded-xl bg-amber-50 border border-amber-300 p-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-amber-900">{offlineQueued} زيارة محفوظة بدون نت</span>
          <Button type="button" variant="outline" onClick={flushQueue}>مزامنة الآن</Button>
        </div>
      )}

      {locked && <div role="status" className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-900 inline-flex items-center gap-1.5"><Icon name="check" size={15} /> تم حفظ الزيارة. جارٍ التعامل مع الملفات المرفقة فقط.</div>}

      <form onSubmit={submit} className="mt-4 space-y-4">
        <fieldset disabled={locked} className="m-0 min-w-0 space-y-4 border-0 p-0">
        {/* 1 — Doctor */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-extrabold ${doctorId? "bg-emerald-600 text-white":"bg-[var(--navy)] text-white"}`}>{doctorId? <Icon name="check" size={14} /> : "1"}</span>
            <span className="font-bold">الطبيب والعيادة</span>
            <span className="text-xs text-red-600 font-bold">*</span>
            {selectedDoctor && <span className="mr-auto text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full px-2.5 py-1 font-semibold">{selectedDoctor.city}</span>}
          </div>

          <div className="relative">
            <Input
              value={q}
              onChange={e=> {setQ(e.target.value); setShowList(true);}}
              onFocus={()=> setShowList(true)}
              onBlur={()=> setTimeout(()=> setShowList(false), 200)}
              placeholder="ابحث باسم الطبيب أو العيادة أو المدينة..."
              className="pr-10"
            />
            <span className="absolute right-3 top-2.5 text-[var(--muted)]">⌕</span>
            {showList && (
              <div className="absolute z-20 mt-1 w-full rounded-xl border border-[var(--border)] bg-white shadow-lg max-h-[260px] overflow-auto divide-y divide-[var(--border)]">
                {filtered.map(d=>(
                  <button key={d.id} type="button" onMouseDown={()=> { setDoctorId(d.id); setQ(`${d.name} · ${d.clinic_name}`); setShowList(false); }}
                    className={`w-full text-right px-3 py-2.5 hover:bg-[var(--gold-soft)] flex items-center gap-3 ${doctorId===d.id ? "bg-[var(--gold-soft)]" : ""}`}>
                    <span className="h-8 w-8 rounded-full bg-[var(--navy)] text-white flex items-center justify-center text-[11px] font-bold shrink-0">{d.name.slice(0,2).toUpperCase()}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold truncate">{d.name}</span>
                      <span className="block text-xs text-[var(--muted)] truncate">{d.clinic_name} — {d.city}</span>
                    </span>
                    {doctorId===d.id && <span className="text-emerald-600"><Icon name="check" size={16} /></span>}
                  </button>
                ))}
                {filtered.length===0 && <div className="p-3 text-sm text-[var(--muted)] text-center">لا نتائج — جرّب كتابة جزء من الاسم</div>}
              </div>
            )}
          </div>
          {selectedDoctor ? (
            <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-center gap-3">
              <span className="h-9 w-9 rounded-full bg-emerald-600 text-white flex items-center justify-center"><Icon name="check" size={18} /></span>
              <div>
                <div className="text-sm font-bold text-emerald-900">{selectedDoctor.name}</div>
                <div className="text-xs text-emerald-800">{selectedDoctor.clinic_name} — {selectedDoctor.city}</div>
              </div>
              <button type="button" onClick={()=>{setDoctorId(""); setQ("");}} className="mr-auto min-h-11 px-2 text-xs text-[var(--muted)] hover:text-red-600">تغيير</button>
            </div>
          ) : (
            <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">اختر الطبيب أولا للمتابعة</div>
          )}
        </Card>

        {/* 2 — Presented products */}
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div><div className="font-bold">ماذا شرحتَ للدكتور؟</div><div className="text-xs text-[var(--muted)]">اضغط على المنتجات التي عرضتها، ثم حدد رد فعل الدكتور.</div></div>
            <span className="text-xs bg-sky-50 border border-sky-200 rounded-full px-3 py-1 font-bold">{presented.length} منتج</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {orderedProducts.map((p) => {
              const on = presented.some((x) => x.productId === p.id);
              return <button key={p.id} type="button" onClick={() => togglePresented(p.id)} aria-pressed={on}
                className={`overflow-hidden rounded-2xl border-2 text-right transition ${on ? "border-[var(--navy)] bg-sky-50 ring-2 ring-[var(--gold)]/40" : "border-[var(--border)] bg-white"}`}>
                <div className="relative h-24 w-full bg-slate-100"><ProductThumb id={p.id} name={p.name} />
                  {on && <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--navy)] text-white"><Icon name="check" size={15} /></span>}
                  {p.id === assignedProductId && <span className="absolute right-2 top-2 rounded-full bg-[var(--gold)] px-2 py-0.5 text-[10px] font-bold text-white">منتجي</span>}
                </div>
                <div className="p-2.5"><div className="font-extrabold">{p.name}</div><div className="text-[11px] text-[var(--muted)]">{PRODUCT_DESC[p.name] || ""}</div></div>
              </button>;
            })}
          </div>
          {presentedProducts.length > 0 && <div className="mt-4 space-y-2">
            <div className="text-xs font-bold text-[var(--muted)]">رد فعل الدكتور</div>
            {presentedProducts.map(({ productId, reaction, product }) => <div key={productId} className="rounded-xl border border-[var(--border)] bg-white p-3">
              <div className="mb-2 text-sm font-extrabold">{product!.name}</div>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(REACTION_LABELS) as Reaction[]).map((value) => <button key={value} type="button" onClick={() => setReaction(productId, value)} aria-pressed={reaction === value}
                  className={`min-h-11 rounded-lg border px-2 text-xs font-bold ${reaction === value ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-[var(--border)] bg-white"}`}>{REACTION_ICONS[value]} {REACTION_LABELS[value]}</button>)}
              </div>
            </div>)}
          </div>}
          {presented.length === 0 && <div className="mt-3 text-xs text-[var(--muted)]">لم تحدد منتجات بعد — يمكنك المتابعة وتسجيل الزيارة دونها.</div>}
        </Card>

        {/* 3 — Samples */}
        <Card className="p-5">
          <div className="font-bold">هل أخذ الدكتور عينة؟</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {([["no", "لا"], ["yes", "نعم"]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setSampleMode(value)} aria-pressed={sampleMode === value}
              className={`min-h-12 rounded-xl border-2 text-base font-extrabold ${sampleMode === value ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-[var(--border)] bg-white"}`}>{label}</button>)}
          </div>
          {sampleMode === "yes" && <div className="mt-4 space-y-3">
            {presentedProducts.length === 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">اختر أولا المنتجات التي شرحتها في الخطوة السابقة، ثم حدد منها العينة.</div>}
            {presentedProducts.map(({ productId, product }) => {
              const row = sampleRows.find((x) => x.productId === productId);
              const active = !!row && row.quantity > 0;
              return <div key={productId} className={`rounded-xl border-2 p-3 ${active ? "border-[var(--navy)] bg-sky-50" : "border-[var(--border)] bg-white"}`}>
                <div className="flex items-center gap-2">
                  <div className="flex-1 font-extrabold">{product!.name}</div>
                  {!active ? <button type="button" onClick={() => updateSample(productId, { quantity: 1 })} className="min-h-11 rounded-lg bg-[var(--navy)] px-4 text-xs font-bold text-white">＋ عينة</button>
                    : <div className="flex items-center gap-1">
                      <button type="button" aria-label="إنقاص" onClick={() => updateSample(productId, { quantity: Math.max(0, (row?.quantity || 0) - 1) })} className="h-11 w-11 rounded-lg border bg-white text-lg font-bold">−</button>
                      <span className="w-9 text-center text-lg font-extrabold">{row?.quantity}</span>
                      <button type="button" aria-label="زيادة" onClick={() => updateSample(productId, { quantity: Math.min(10000, (row?.quantity || 0) + 1) })} className="h-11 w-11 rounded-lg bg-[var(--navy)] text-lg font-bold text-white">+</button>
                    </div>}
                </div>
                {active && <div className="mt-3"><div className="mb-1 text-xs font-bold">سبب العينة <span className="text-red-600">*</span></div>
                  <div className="grid grid-cols-3 gap-2">{(Object.keys(PURPOSE_LABELS) as SamplePurpose[]).map((value) => <button type="button" key={value} onClick={() => updateSample(productId, { purpose: value })} aria-pressed={row?.purpose === value}
                    className={`min-h-11 rounded-lg border px-2 text-xs font-bold ${row?.purpose === value ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-[var(--border)] bg-white"}`}>{PURPOSE_LABELS[value]}</button>)}</div></div>}
              </div>;
            })}
            {sampleState.error && presentedProducts.length > 0 && <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-xs font-bold text-red-700">{sampleState.error}</div>}
          </div>}
          {sampleMode === "no" && <div className="mt-3 text-xs text-[var(--muted)]">لن تُسجَّل عينات لهذه الزيارة.</div>}
        </Card>

        {/* Status — segmented */}
        <Card className="p-5">
          <div className="font-bold mb-3">حالة الزيارة</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              {v:"completed", label:"مكتملة", icon:"check", color:"bg-emerald-600 text-white border-emerald-600"},
              {v:"planned", label:"مجدولة", icon:"clock", color:"bg-sky-600 text-white border-sky-600"},
              {v:"cancelled", label:"ملغاة", icon:"x", color:"bg-red-600 text-white border-red-600"},
            ].map(o=>{
              const active=status===o.v;
              return (
                <button key={o.v} type="button" onClick={()=> setStatus(o.v)}
                  className={`min-h-14 rounded-xl border-2 py-3 flex flex-col items-center gap-1 font-bold text-sm transition ${active? o.color: "bg-white border-[var(--border)] text-[var(--muted)] hover:border-[var(--navy)]/30"}`}>
                  <Icon name={getVisitStatusMeta(o.v).icon} size={18} />{getVisitStatusMeta(o.v).label}
                </button>
              );
            })}
          </div>
        </Card>

        {/* GPS */}
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <span className="font-bold">الموقع</span>
            <span className="text-xs bg-sky-50 border border-sky-200 text-sky-800 rounded-full px-2 py-0.5">GPS</span>
            <span className="mr-auto text-[11px] text-[var(--muted)]">يُلتقط تلقائيا</span>
          </div>
          <div className={`mt-3 rounded-xl border p-3 flex items-center gap-3 ${gps? "bg-emerald-50 border-emerald-200":"bg-amber-50 border-amber-200"}`}>
            <span className={`h-8 w-8 rounded-full flex items-center justify-center ${gps? "bg-emerald-600 text-white":"bg-amber-500 text-white"}`}>{gps? <Icon name="check" size={16} /> : <Icon name="map" size={16} />}</span>
            <span className="flex-1 text-xs font-medium">{gpsLoading? "جاري تحديد الموقع...": gpsStatus}</span>
            <Button type="button" variant="outline" onClick={captureGps} disabled={gpsLoading} className="shrink-0 text-xs py-1.5">تحديث</Button>
          </div>
          {gps && <a href={`https://maps.google.com/?q=${gps.lat},${gps.lng}`} target="_blank" className="mt-2 inline-flex text-xs font-bold text-[var(--gold)] hover:underline">فتح في خرائط Google →</a>}
        </Card>

        {/* Follow-up — collapsible */}
        <details className="rounded-2xl bg-white border border-[var(--border)] shadow-sm">
          <summary className="p-4 flex items-center gap-2 cursor-pointer list-none">
            <span className="font-bold text-sm">متابعة (اختياري)</span>
            <span className="text-xs text-[var(--muted)]">حدد موعد متابعة</span>
            <span className="mr-auto text-xs text-[var(--muted)]">▾</span>
          </summary>
          <div className="px-4 pb-4 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-3">
            <div className="space-y-1.5"><Label>متابعة بتاريخ</Label><Input type="date" value={followUpAt} onChange={e=>setFollowUpAt(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>ملاحظة المتابعة</Label><Input value={followUpNote} onChange={e=>setFollowUpNote(e.target.value)} placeholder="مثال: اتصال بعد أسبوع" /></div>
          </div>
        </details>

        {/* Notes */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-bold">ملاحظات الزيارة</span><span className="text-xs text-red-600 font-bold">*</span>
            <span className={`mr-auto text-xs rounded-full px-2 py-0.5 border font-bold ${notesOk? "bg-emerald-50 border-emerald-200 text-emerald-800":"bg-amber-50 border-amber-200 text-amber-800"}`}>{notesLen}/10 {notesOk? <Icon name="check" size={13} className="inline align-[-2px]" />:"مطلوب"}</span>
          </div>
          <Textarea value={notes} onChange={e=> setNotes(e.target.value)} rows={4} placeholder="مثال: تم عرض المنتج، الطبيب مهتم، طلب عينات إضافية، متابعة بعد 10 أيام..." required className="min-h-[96px]" />
          {!notesOk && notes.length>0 && <div className="mt-1 text-xs text-amber-700">اكتب {10-notesLen} أحرف إضافية على الأقل</div>}
        </Card>
        </fieldset>

        {/* Attachments */}
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3"><div><div className="font-bold">مرفقات الزيارة (اختياري)</div><div className="text-xs text-[var(--muted)]">صور أو PDF. حتى {MAX_FILES} ملفات، وتُضغط الصور تلقائيا قبل الرفع.</div></div><span className="text-xs bg-sky-50 border border-sky-200 rounded-full px-3 py-1 font-bold">{files.length}</span></div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--navy)] px-3 text-sm font-extrabold text-white">
              <span aria-hidden>📷</span> التقاط صورة
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
            </label>
            <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-[var(--navy)] bg-white px-3 text-sm font-extrabold text-[var(--navy)]">
              <span aria-hidden>📎</span> من الجوال
              <input type="file" accept="image/*,application/pdf" multiple className="sr-only" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
            </label>
          </div>
          {files.length > 0 && <ul className="mt-3 space-y-2">
            {files.map((item) => <li key={item.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-white p-2">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                {item.preview ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={item.preview} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs font-bold">PDF</div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold">{item.file.name}</div>
                <div className="text-[11px] text-[var(--muted)]">{(item.file.size / 1024).toFixed(0)} KB</div>
                {item.state === "uploading" && <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={item.progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-[var(--gold)]" style={{ width: `${item.progress}%` }} /></div>}
                {item.state === "done" && <div className="text-[11px] font-bold text-emerald-700 inline-flex items-center gap-1"><Icon name="check" size={12} /> تم الرفع</div>}
                {item.state === "error" && <div className="text-[11px] font-bold text-red-700">{item.error || "تعذر الرفع"}</div>}
              </div>
              {item.state !== "uploading" && item.state !== "done" && <button type="button" onClick={() => removeFile(item.id)} aria-label="حذف الملف" className="h-11 w-11 shrink-0 rounded-lg border text-lg font-bold">×</button>}
            </li>)}
          </ul>}
        </Card>

        {err && <div role="alert" className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm p-3 flex items-center gap-2"><Icon name="warn" size={16} className="shrink-0" /><span>{err}</span></div>}

        <div className="flex gap-2">
          {locked
            ? <Button type="button" variant="outline" onClick={()=> { router.push("/visits"); router.refresh(); }} className="flex-1">متابعة دون الملفات</Button>
            : <Button type="button" variant="outline" onClick={()=> router.back()} className="flex-1">إلغاء</Button>}
          <Button type="submit" disabled={loading || (!locked && (!doctorId || !notesOk || sampleInvalid))} className="flex-[2] min-h-12 text-base py-3 inline-flex items-center justify-center gap-1.5">{loading ? "جاري الحفظ..." : locked ? "إعادة محاولة رفع الملفات" : <>حفظ الزيارة <Icon name="check" size={16} /></>}</Button>
        </div>
        <div className="text-center text-[11px] text-[var(--muted)]">الحقول بعلامة * إجبارية — الزيارة تُحفظ بتاريخ اليوم تلقائيا</div>
      </form>
    </div>
  );
}
