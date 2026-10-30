"use client";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Textarea, Label } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import DetailingPresenter from "@/components/detailing/DetailingPresenter";
import type { DetailProduct, PresenterResult } from "@/components/detailing/types";
import { BrochureCover } from "@/components/detailing/BrochureViewer";
import { brochureUrl } from "@/components/detailing/pdf";

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

export default function NewVisitClient({ doctors, products, assignedProductId, role, initialDoctorId="", initialProductId="", initialPresented=[] }: { doctors: Doctor[]; products: Product[]; assignedProductId: string|null; role: string; initialDoctorId?:string; initialProductId?:string; initialPresented?: Presented[] }) {const toast=useToast();
  const router = useRouter();
  const initialDoctor=doctors.find(d=>d.id===initialDoctorId);
  const [doctorId, setDoctorId] = useState(initialDoctor?.id||"");
  const [q, setQ] = useState(initialDoctor?`${initialDoctor.name} · ${initialDoctor.clinic_name}`:"");
  const [showList,setShowList]=useState(false);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("completed");
  const [presented, setPresented] = useState<Presented[]>(() => initialPresented.length ? initialPresented : initialProductId ? [{productId:initialProductId,reaction:"neutral"}] : []);
  const [catalog, setCatalog] = useState<DetailProduct[] | null>(null);
  const [presenting, setPresenting] = useState<string | null>(null);
  async function openPresenter() {
    let list = catalog;
    if (!list) {
      try { const r = await fetch("/api/products/catalog"); if (!r.ok) throw 0; list = (await r.json()).products as DetailProduct[]; setCatalog(list); }
      catch { toast("تعذر فتح البروشورات — تأكد من الاتصال", "error"); return; }
    }
    if (!list.length) { toast("لا توجد منتجات للعرض", "info"); return; }
    const start = presented.find(x => list!.some(p => p.id === x.productId))?.productId || (assignedProductId && list.some(p => p.id === assignedProductId) ? assignedProductId : list[0].id);
    setPresenting(start);
  }
  function presenterClosed(r: PresenterResult) {
    setPresenting(null);
    setPresented(prev => {
      const next = [...prev];
      for (const id of r.shown) {
        const i = next.findIndex(x => x.productId === id);
        const reaction = r.reactions[id];
        if (i >= 0) { if (reaction) next[i] = { ...next[i], reaction }; }
        else if (products.some(p => p.id === id)) next.push({ productId: id, reaction: reaction || "neutral" });
      }
      return next;
    });
  }
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
  const [done, setDone] = useState(false);
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
    if(ok)toast(`تمت مزامنة ${ok} زيارة`,"success");
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
    if (failed === 0) { setDone(true); return; }
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
      else { setDone(true); }
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

  // ───────────── smart context, today's plan, catalog ─────────────
  const [mode, setMode] = useState<"phone" | "tablet" | "desktop">("desktop");
  useEffect(() => { const f = () => setMode(window.innerWidth < 768 ? "phone" : window.innerWidth < 1200 ? "tablet" : "desktop"); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  const [wiz, setWiz] = useState(initialDoctorId ? 1 : 0);
  const [ctx, setCtx] = useState<VisitContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [todayPlan, setTodayPlan] = useState<TodayItem[]>([]);
  useEffect(() => {
    const t = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
    fetch(`/api/agenda?from=${t}&to=${t}`).then(r => r.ok ? r.json() : null).then(j => j && setTodayPlan((j.plan || []).map((p: Record<string, unknown>) => ({ id: String(p.id), doctor_id: String(p.doctor_id), doctor_name: String(p.doctor_name), clinic_name: String(p.clinic_name || ""), product_id: p.product_id ? String(p.product_id) : null, product_name: p.product_name ? String(p.product_name) : null, done: !!p.visit_id })))).catch(() => {});
    fetch("/api/products/catalog").then(r => r.ok ? r.json() : null).then(j => j && setCatalog(j.products)).catch(() => {});
  }, [setCatalog]);
  useEffect(() => {
    if (!doctorId) { setCtx(null); return; }
    let alive = true; setCtxLoading(true);
    fetch(`/api/visits/context?doctorId=${doctorId}`).then(r => r.ok ? r.json() : null).then(j => { if (alive) setCtx(j); }).catch(() => {}).finally(() => alive && setCtxLoading(false));
    return () => { alive = false; };
  }, [doctorId]);
  useEffect(() => { setSampleMode(sampleRows.some(r => r.quantity > 0) ? "yes" : "no"); }, [sampleRows, setSampleMode]);

  function pickDoctor(id: string, productId?: string | null) {
    const d = doctors.find(x => x.id === id); if (!d) return;
    setDoctorId(id); setQ(`${d.name} · ${d.clinic_name}`); setShowList(false);
    if (productId && !presented.some(x => x.productId === productId) && products.some(p => p.id === productId)) setPresented(p => [...p, { productId, reaction: "neutral" }]);
    if (mode === "phone") setWiz(1);
  }
  async function presentFrom(productId?: string) {
    let list = catalog;
    if (!list) { try { const r = await fetch("/api/products/catalog"); if (!r.ok) throw 0; list = (await r.json()).products as DetailProduct[]; setCatalog(list); } catch { toast("تعذر فتح البروشورات — تأكد من الاتصال", "error"); return; } }
    if (!list.length) { toast("لا توجد منتجات للعرض", "info"); return; }
    const first = productId || ctx?.suggested?.find(id => list!.some(p => p.id === id)) || presented[0]?.productId || list[0].id;
    // suggested products first in the presenter strip
    const pri = [...new Set([first, ...(ctx?.suggested || []), ...presented.map(x => x.productId)])];
    setCatalog([...list].sort((a, b) => (pri.indexOf(a.id) + 1 || 99) - (pri.indexOf(b.id) + 1 || 99)));
    setPresenting(first);
  }
  const addNote = (t: string) => setNotes(n => (n.trim() ? `${n.trim()}${/[.!؟?،,]$/.test(n.trim()) ? "" : "."} ` : "") + t);
  const fuDate = (days: number) => { const d = new Date(Date.now() + days * 864e5); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(d); };

  const selectedDoctor = doctors.find(d => d.id === doctorId);
  const notesLen = notes.trim().length;
  const notesOk = notesLen >= 10;
  const sampleState = collectSampleItems(sampleRows.some(r => r.quantity > 0) ? "yes" : "no", sampleRows);
  const sampleInvalid = !!sampleState.error;
  const locked = !!savedVisitId;
  const productsView = useMemo(() => {
    const cat = new Map((catalog || []).map(p => [p.id, p]));
    const sug = ctx?.suggested || [];
    return [...products].sort((a, b) => (sug.indexOf(a.id) + 1 || 99) - (sug.indexOf(b.id) + 1 || 99) || Number(b.id === assignedProductId) - Number(a.id === assignedProductId) || a.name.localeCompare(b.name))
      .map(p => ({ ...p, cat: cat.get(p.id), suggested: sug.includes(p.id) }));
  }, [products, catalog, ctx, assignedProductId]);
  const checks = [
    { ok: !!doctorId, label: "الطبيب" },
    { ok: presented.length > 0, label: "المنتجات المشروحة", optional: true },
    { ok: !sampleInvalid, label: "العينات" },
    { ok: notesOk, label: "الملاحظات" },
    { ok: !!gps, label: "الموقع", optional: true },
  ];
  const canSave = !loading && (locked || (!!doctorId && notesOk && !sampleInvalid));

  if (done) return <SuccessScreen doctor={selectedDoctor?.name || ""} presented={presented.length} samples={sampleState.items.reduce((a, x) => a + x.quantity, 0)} followUp={followUpAt} onNew={() => { window.location.href = "/visits/new"; }} />;

  // ───────────── sections ─────────────
  const doctorSection = (
    <Section n={1} title="الطبيب" done={!!doctorId}>
      {!doctorId && todayPlan.length > 0 && <div className="mb-3">
        <div className="text-xs font-bold text-[var(--muted)] mb-1.5">من خطة النهارده</div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {todayPlan.map(t => <button key={t.id} type="button" onClick={() => pickDoctor(t.doctor_id, t.product_id)} disabled={t.done}
            className={`shrink-0 rounded-2xl border px-3 py-2 text-right transition ${t.done ? "border-emerald-200 bg-emerald-50 opacity-60" : "border-[var(--border)] bg-white hover:border-[var(--navy)] hover:shadow"}`}>
            <div className="text-sm font-bold whitespace-nowrap">{t.done ? "✓ " : ""}{t.doctor_name}</div>
            <div className="text-[11px] text-[var(--muted)] whitespace-nowrap">{[t.product_name, t.clinic_name].filter(Boolean).join(" · ")}</div>
          </button>)}
        </div>
      </div>}
      {selectedDoctor ? (
        <div className="rounded-2xl border border-[var(--navy)]/20 bg-[var(--sky-light)] p-3 flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-[var(--navy)] text-white grid place-items-center text-lg font-extrabold shrink-0">{ctx?.doctor.classification || selectedDoctor.name.slice(0, 1)}</div>
          <div className="min-w-0 flex-1"><div className="font-extrabold text-[var(--navy)] truncate">{selectedDoctor.name}</div><div className="text-xs text-[var(--muted)] truncate">{[ctx?.doctor.specialty, selectedDoctor.clinic_name, selectedDoctor.city].filter(Boolean).join(" · ")}</div></div>
          {ctx?.doctor.phone && <a href={`tel:${String(ctx.doctor.phone).replace(/\s/g, "")}`} className="h-10 w-10 rounded-xl bg-white border border-[var(--border)] grid place-items-center" title="اتصال">📞</a>}
          {!locked && <button type="button" onClick={() => { setDoctorId(""); setQ(""); }} className="text-xs font-bold text-[var(--muted)] hover:text-red-600 px-2">تغيير</button>}
        </div>
      ) : (
        <div className="relative">
          <input value={q} onChange={e => { setQ(e.target.value); setShowList(true); }} onFocus={() => setShowList(true)} onBlur={() => setTimeout(() => setShowList(false), 200)}
            placeholder="🔍 ابحث باسم الطبيب أو العيادة أو المدينة" className="w-full rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-base outline-none focus:border-[var(--navy)]" />
          {showList && <div className="absolute z-30 mt-1 w-full rounded-2xl border border-[var(--border)] bg-white shadow-xl max-h-72 overflow-auto divide-y divide-[var(--border)]">
            {filtered.map(d => <button key={d.id} type="button" onMouseDown={() => pickDoctor(d.id)} className="w-full text-right px-3 py-2.5 hover:bg-[var(--bg)] flex items-center gap-3">
              <span className="h-9 w-9 rounded-xl bg-[var(--sky-soft)] text-[var(--navy)] grid place-items-center text-xs font-bold shrink-0">{d.name.slice(0, 2).toUpperCase()}</span>
              <span className="min-w-0"><span className="block text-sm font-bold truncate">{d.name}</span><span className="block text-xs text-[var(--muted)] truncate">{d.clinic_name} — {d.city}</span></span>
            </button>)}
            {!filtered.length && <div className="p-3 text-sm text-[var(--muted)] text-center">لا نتائج</div>}
          </div>}
        </div>
      )}
    </Section>
  );

  const contextCard = doctorId ? <ContextCard ctx={ctx} loading={ctxLoading} products={products} onPresent={presentFrom} /> : null;

  const productsSection = (
    <Section n={2} title="المنتجات والعرض" done={presented.length > 0} hint="اضغط على المنتج اللي شرحته، وحدد رد فعل الطبيب والعينة">
      <button type="button" onClick={() => void presentFrom()} disabled={locked} className="w-full mb-3 rounded-2xl bg-gradient-to-l from-[var(--navy)] to-[var(--navy-3)] text-white p-4 flex items-center gap-3 shadow-md hover:shadow-lg transition">
        <span className="h-12 w-12 rounded-2xl bg-white/15 grid place-items-center text-2xl">▶</span>
        <span className="text-right flex-1"><span className="block font-extrabold text-lg">ابدأ العرض للطبيب</span><span className="block text-xs text-white/75">بروشور ملء الشاشة — ردود الفعل بتتسجل هنا تلقائياً</span></span>
      </button>
      <div className={`grid gap-3 ${mode === "phone" ? "grid-cols-1" : "grid-cols-2"}`}>
        {productsView.map(p => {
          const sel = presented.find(x => x.productId === p.id); const row = sampleRows.find(x => x.productId === p.id); const qty = row?.quantity || 0;
          const b = p.cat?.brochures?.[0];
          return (
            <div key={p.id} className={`rounded-2xl border-2 overflow-hidden transition ${sel ? "border-[var(--navy)] shadow-md" : "border-[var(--border)] bg-white"}`}>
              <div className="flex">
                <button type="button" onClick={() => togglePresented(p.id)} aria-pressed={!!sel} className="flex-1 flex items-center gap-3 p-2.5 text-right">
                  <div className="relative h-16 w-16 shrink-0 rounded-xl overflow-hidden bg-slate-100" style={{ background: p.cat?.color || "var(--navy)" }}>
                    {b ? <BrochureCover url={brochureUrl(b.id)} mime={b.mime} className="h-full w-full bg-white" /> : p.cat && !p.cat.image_available ? <div className="h-full w-full grid place-items-center text-white font-extrabold text-sm">{p.name.slice(0, 2).toUpperCase()}</div> : <ProductThumb id={p.id} name={p.name} />}
                    {sel && <span className="absolute inset-0 bg-[var(--navy)]/60 grid place-items-center text-white text-xl">✓</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap"><span className="font-extrabold">{p.name}</span>{p.suggested && <span className="rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5">⭐ مقترح</span>}{p.id === assignedProductId && <span className="rounded-full bg-[var(--sky-soft)] text-[var(--navy)] text-[10px] font-bold px-1.5">منتجي</span>}</div>
                    <div className="text-[11px] text-[var(--muted)] line-clamp-1">{p.cat?.tagline || PRODUCT_DESC[p.name] || ""}</div>
                  </div>
                </button>
                {p.cat && <button type="button" onClick={() => void presentFrom(p.id)} className="px-3 border-r border-[var(--border)] text-[var(--navy)] font-bold text-xs hover:bg-[var(--bg)]" title="عرض البروشور">▶<br />عرض</button>}
              </div>
              {sel && <div className="border-t border-[var(--border)] bg-[var(--sky-light)] p-2.5 space-y-2.5">
                <div className="grid grid-cols-3 gap-1.5">{(Object.keys(REACTION_LABELS) as Reaction[]).map(v => <button key={v} type="button" onClick={() => setReaction(p.id, v)} aria-pressed={sel.reaction === v}
                  className={`min-h-10 rounded-xl text-xs font-bold border transition ${sel.reaction === v ? v === "interested" ? "bg-emerald-600 border-emerald-600 text-white" : v === "not_interested" ? "bg-red-600 border-red-600 text-white" : "bg-slate-600 border-slate-600 text-white" : "bg-white border-[var(--border)]"}`}>{REACTION_ICONS[v]} {REACTION_LABELS[v]}</button>)}</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--muted)] flex-1">عينة</span>
                  <button type="button" onClick={() => updateSample(p.id, { quantity: Math.max(0, qty - 1) })} disabled={!qty} className="h-9 w-9 rounded-lg border bg-white font-bold disabled:opacity-30">−</button>
                  <span className="w-8 text-center font-extrabold">{qty}</span>
                  <button type="button" onClick={() => updateSample(p.id, { quantity: Math.min(10000, qty + 1) })} className="h-9 w-9 rounded-lg bg-[var(--navy)] text-white font-bold">+</button>
                </div>
                {qty > 0 && <div className="grid grid-cols-3 gap-1.5">{(Object.keys(PURPOSE_LABELS) as SamplePurpose[]).map(v => <button key={v} type="button" onClick={() => updateSample(p.id, { purpose: v })} aria-pressed={row?.purpose === v}
                  className={`min-h-9 rounded-lg text-[11px] font-bold border ${row?.purpose === v ? "bg-[var(--navy)] border-[var(--navy)] text-white" : row?.purpose ? "bg-white border-[var(--border)]" : "bg-white border-amber-300"}`}>{PURPOSE_LABELS[v]}</button>)}</div>}
              </div>}
            </div>
          );
        })}
      </div>
      {sampleInvalid && <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 p-2 text-xs font-bold text-amber-800">{sampleState.error}</div>}
      {presenting && catalog && <DetailingPresenter products={catalog} startId={presenting} doctor={selectedDoctor ? { id: selectedDoctor.id, name: selectedDoctor.name } : null} initialReactions={Object.fromEntries(presented.map(x => [x.productId, x.reaction]))} onClose={presenterClosed} />}
    </Section>
  );

  const quick = status === "cancelled" ? ["الطبيب مش موجود", "العيادة مقفولة", "مشغول جداً — اتأجلت", "لا يستقبل مناديب"] : ["الطبيب مهتم وطلب تفاصيل أكتر", "طلب عينات إضافية", "هيبدأ يجرب المنتج مع المرضى", "عنده تحفظ على السعر", "طلب متابعة قريبة", "أكّد حضور الدعوة"];
  const resultSection = (
    <Section n={3} title="نتيجة الزيارة" done={notesOk}>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {([["completed", "✓ مكتملة", "bg-emerald-600 border-emerald-600"], ["planned", "🕑 مجدولة", "bg-sky-600 border-sky-600"], ["cancelled", "✕ ملغاة", "bg-red-600 border-red-600"]] as const).map(([v, l, c]) =>
          <button key={v} type="button" onClick={() => setStatus(v)} className={`min-h-12 rounded-2xl border-2 font-bold text-sm transition ${status === v ? `${c} text-white` : "bg-white border-[var(--border)] text-[var(--muted)]"}`}>{l}</button>)}
      </div>
      <div className="flex items-center justify-between mb-1.5"><span className="text-sm font-bold">الملاحظات <span className="text-red-600">*</span></span><span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${notesOk ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{notesOk ? "✓" : `${Math.max(0, 10 - notesLen)} حرف كمان`}</span></div>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={mode === "phone" ? 4 : 5} placeholder="اكتب اللي حصل في الزيارة…" className="w-full rounded-2xl border border-[var(--border)] px-3 py-3 text-base outline-none focus:border-[var(--navy)]" />
      <div className="flex flex-wrap gap-1.5 mt-2">{quick.map(t => <button key={t} type="button" onClick={() => addNote(t)} className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-bold hover:border-[var(--navy)]">+ {t}</button>)}</div>
      <div className="mt-4">
        <div className="text-sm font-bold mb-1.5">متابعة قادمة <span className="text-xs font-normal text-[var(--muted)]">(اختياري — بتظهر في مخطط العمل)</span></div>
        <div className="flex flex-wrap gap-1.5">
          {([["بكرة", 1], ["بعد أسبوع", 7], ["بعد أسبوعين", 14], ["بعد شهر", 30]] as const).map(([l, d]) => { const v = fuDate(d); return <button key={l} type="button" onClick={() => setFollowUpAt(followUpAt === v ? "" : v)} className={`rounded-xl px-3 py-2 text-xs font-bold border ${followUpAt === v ? "bg-[var(--navy)] text-white border-[var(--navy)]" : "bg-white border-[var(--border)]"}`}>{l}</button>; })}
          <input type="date" value={followUpAt} onChange={e => setFollowUpAt(e.target.value)} className="rounded-xl border border-[var(--border)] px-2 py-1.5 text-xs" />
        </div>
        {followUpAt && <input value={followUpNote} onChange={e => setFollowUpNote(e.target.value)} placeholder="المطلوب في المتابعة (مثال: توصيل عينات)" className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />}
      </div>
    </Section>
  );

  const extrasSection = (
    <Section n={4} title="المرفقات والموقع" done={files.length > 0 || !!gps} hint="اختياري">
      <div className={`rounded-2xl border p-3 flex items-center gap-3 mb-3 ${gps ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
        <span className={`h-9 w-9 rounded-xl grid place-items-center text-white ${gps ? "bg-emerald-600" : "bg-amber-500"}`}>{gps ? "✓" : "📍"}</span>
        <span className="flex-1 text-xs font-medium">{gpsLoading ? "جاري تحديد الموقع…" : gps ? `الموقع اتسجل (±${Math.round(gps.accuracy_m)}م)` : gpsStatus}</span>
        <button type="button" onClick={captureGps} disabled={gpsLoading} className="rounded-xl border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-bold">تحديث</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[var(--navy)] px-3 text-sm font-bold text-white">📷 صورة<input type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => { void addFiles(e.target.files); e.target.value = ""; }} /></label>
        <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-[var(--navy)] bg-white px-3 text-sm font-bold text-[var(--navy)]">📎 ملف<input type="file" accept="image/*,application/pdf" multiple className="sr-only" onChange={e => { void addFiles(e.target.files); e.target.value = ""; }} /></label>
      </div>
      {files.length > 0 && <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">{files.map(item => (
        <div key={item.id} className="relative rounded-xl border border-[var(--border)] bg-white overflow-hidden">
          <div className="aspect-square bg-slate-100">{item.preview ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={item.preview} alt="" className="h-full w-full object-cover" /> : <div className="h-full grid place-items-center text-xs font-bold">PDF</div>}</div>
          {item.state === "uploading" && <div className="absolute inset-x-0 bottom-0 h-1.5 bg-slate-200"><div className="h-full bg-[var(--navy)]" style={{ width: `${item.progress}%` }} /></div>}
          {item.state === "done" && <span className="absolute top-1 left-1 h-6 w-6 rounded-full bg-emerald-600 text-white grid place-items-center text-xs">✓</span>}
          {item.state === "error" && <div className="absolute inset-x-0 bottom-0 bg-red-600 text-white text-[10px] p-0.5 text-center truncate">{item.error || "تعذر"}</div>}
          {item.state !== "uploading" && item.state !== "done" && <button type="button" onClick={() => removeFile(item.id)} className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white text-sm" aria-label="حذف">×</button>}
        </div>))}</div>}
    </Section>
  );

  const saveButton = <>
      {err && <div role="alert" className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm p-3">{err}</div>}
      <button type="submit" disabled={!canSave} className="w-full rounded-2xl bg-[var(--navy)] text-white py-3.5 text-base font-extrabold disabled:opacity-40 shadow-md">{loading ? "جاري الحفظ…" : locked ? "إعادة رفع الملفات" : "✓ حفظ الزيارة"}</button>
      {locked && <button type="button" onClick={() => setDone(true)} className="w-full rounded-2xl border border-[var(--border)] py-2.5 text-sm font-bold">متابعة من غير الملفات</button>}
    </>;
  const summary = (
    <div className="rounded-3xl border border-[var(--border)] bg-white p-4 space-y-3">
      <div className="font-extrabold text-[var(--navy)]">ملخص الزيارة</div>
      <div className="space-y-1.5">{checks.map(c => <div key={c.label} className="flex items-center gap-2 text-sm"><span className={`h-5 w-5 rounded-full grid place-items-center text-[11px] text-white ${c.ok ? "bg-emerald-600" : c.optional ? "bg-slate-300" : "bg-amber-500"}`}>{c.ok ? "✓" : c.optional ? "–" : "!"}</span><span className={c.ok ? "" : "text-[var(--muted)]"}>{c.label}{c.optional && !c.ok ? " (اختياري)" : ""}</span></div>)}</div>
      {presented.length > 0 && <div className="flex flex-wrap gap-1">{presented.map(x => { const p = products.find(y => y.id === x.productId); const s = sampleRows.find(r => r.productId === x.productId)?.quantity || 0; return p && <span key={x.productId} className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[11px] font-bold">{REACTION_ICONS[x.reaction]} {p.name}{s ? ` · ${s} عينة` : ""}</span>; })}</div>}
      {saveButton}
    </div>
  );
  const banners = <>
    {offlineQueued > 0 && <div className="rounded-2xl bg-amber-50 border border-amber-300 p-3 flex items-center justify-between"><span className="text-sm font-bold text-amber-900">📴 {offlineQueued} زيارة محفوظة على الجهاز من غير نت</span><button type="button" onClick={() => void flushQueue()} className="rounded-xl border border-amber-400 bg-white px-3 py-1.5 text-xs font-bold">مزامنة الآن</button></div>}
    {locked && <div role="status" className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">✓ الزيارة اتحفظت — فاضل رفع الملفات بس</div>}
  </>;

  // ───────────── layouts ─────────────
  if (mode === "phone") {
    const steps = ["الطبيب", "المنتجات", "النتيجة", "الحفظ"];
    const canNext = wiz === 0 ? !!doctorId : wiz === 1 ? !sampleInvalid : wiz === 2 ? notesOk && !sampleInvalid : true;
    return (
      <form onSubmit={submit} className="mt-3 pb-40 space-y-3">
        <div className="flex gap-1">{steps.map((s, i) => <button key={s} type="button" onClick={() => (i <= wiz || (i === 1 && doctorId)) && setWiz(i)} className="flex-1 text-center"><div className={`h-1.5 rounded-full ${i <= wiz ? "bg-[var(--navy)]" : "bg-slate-200"}`} /><div className={`text-[11px] mt-1 font-bold ${i === wiz ? "text-[var(--navy)]" : "text-[var(--muted)]"}`}>{s}</div></button>)}</div>
        {banners}
        <fieldset disabled={locked} className="space-y-3 border-0 p-0 m-0 min-w-0">
          {wiz === 0 && <>{doctorSection}{contextCard}</>}
          {wiz === 1 && productsSection}
          {wiz === 2 && resultSection}
        </fieldset>
        {wiz === 3 && <>{extrasSection}{summary}</>}
        {wiz < 3 && <div className="fixed inset-x-0 bottom-[4.75rem] z-30 px-3">
          <div className="rounded-2xl bg-white/95 backdrop-blur border border-[var(--border)] shadow-xl p-2 flex gap-2">
            {wiz > 0 && <button type="button" onClick={() => setWiz(wiz - 1)} className="rounded-xl border border-[var(--border)] px-4 font-bold">›</button>}
            <button type="button" disabled={!canNext} onClick={() => setWiz(wiz + 1)} className="flex-1 rounded-xl bg-[var(--navy)] text-white py-3 font-extrabold disabled:opacity-40">{wiz === 0 ? (doctorId ? "التالي: المنتجات ‹" : "اختار الطبيب الأول") : wiz === 1 ? "التالي: النتيجة ‹" : notesOk ? "التالي: الحفظ ‹" : "اكتب الملاحظات"}</button>
          </div>
        </div>}
      </form>
    );
  }

  return (
    <form onSubmit={submit} className={`mt-4 ${mode === "desktop" ? "grid grid-cols-[1fr_360px] gap-4 items-start" : "space-y-3 pb-28"}`}>
      <div className="space-y-3 min-w-0">
        {banners}
        <fieldset disabled={locked} className="space-y-3 border-0 p-0 m-0 min-w-0">
          {doctorSection}
          {mode === "tablet" && contextCard}
          {productsSection}
          {resultSection}
        </fieldset>
        {extrasSection}
      </div>
      {mode === "desktop" ? <div className="space-y-3 sticky top-4">{contextCard}{summary}</div>
        : <div className="fixed left-0 right-0 lg:right-[272px] bottom-0 z-30 p-3 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/95 to-transparent">
          <div className="max-w-3xl mx-auto rounded-2xl bg-white border border-[var(--border)] shadow-xl p-2.5 flex items-center gap-3">
            <div className="flex gap-1">{checks.filter(c => !c.optional).map(c => <span key={c.label} title={c.label} className={`h-2.5 w-2.5 rounded-full ${c.ok ? "bg-emerald-500" : "bg-amber-400"}`} />)}</div>
            <div className="text-xs text-[var(--muted)] flex-1 truncate">{!doctorId ? "اختار الطبيب" : !notesOk ? "اكتب ملاحظات الزيارة" : sampleInvalid ? sampleState.error : "جاهزة للحفظ"}</div>
            {err && <div className="text-xs text-red-700 max-w-[40%] truncate" title={err}>{err}</div>}
            <button type="submit" disabled={!canSave} className="rounded-xl bg-[var(--navy)] text-white px-6 py-3 font-extrabold disabled:opacity-40">{loading ? "…" : locked ? "إعادة الرفع" : "✓ حفظ الزيارة"}</button>
          </div>
        </div>}
    </form>
  );
}

// ───────────── helpers ─────────────
type TodayItem = { id: string; doctor_id: string; doctor_name: string; clinic_name: string; product_id: string | null; product_name: string | null; done: boolean };
type VisitContext = {
  doctor: { classification: string | null; specialty: string | null; phone: string | null; visits_per_month: number | null };
  history: Array<{ id: string; visited_at: string; status: string; notes: string; rep_name: string; mine: boolean; presented: Array<{ product_id: string; name: string; reaction: string }>; samples: number }>;
  followups: Array<{ due: string; note: string }>; plan: { note: string; product_name: string | null; priority: string } | null; suggested: string[]; daysSince: number | null;
};

function Section({ n, title, done, hint, children }: { n: number; title: string; done: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-[var(--border)] bg-white p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className={`h-7 w-7 rounded-full grid place-items-center text-xs font-extrabold text-white ${done ? "bg-emerald-600" : "bg-[var(--navy)]"}`}>{done ? "✓" : n}</span>
        <span className="font-extrabold">{title}</span>
        {hint && <span className="text-[11px] text-[var(--muted)] mr-1 hidden sm:inline">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

const RX: Record<string, string> = { interested: "👍", neutral: "😐", not_interested: "👎" };
function ContextCard({ ctx, loading, products, onPresent }: { ctx: VisitContext | null; loading: boolean; products: Array<{ id: string; name: string }>; onPresent: (id: string) => void }) {
  if (loading && !ctx) return <div className="rounded-3xl border border-[var(--border)] bg-white p-4 space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-5 rounded bg-[var(--bg)] animate-pulse" />)}</div>;
  if (!ctx) return null;
  const last = ctx.history[0];
  const gap = ctx.doctor.visits_per_month ? Math.ceil(30 / ctx.doctor.visits_per_month) : null;
  const late = gap !== null && ctx.daysSince !== null && ctx.daysSince > gap;
  const name = (id: string) => products.find(p => p.id === id)?.name || "";
  return (
    <div className="rounded-3xl border border-[var(--navy)]/15 bg-gradient-to-b from-[var(--sky-light)] to-white p-4 space-y-3">
      <div className="flex items-center gap-2"><span className="text-lg">✨</span><span className="font-extrabold text-[var(--navy)]">قبل ما تدخل</span></div>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-2xl bg-white border border-[var(--border)] p-2"><div className="text-[11px] text-[var(--muted)]">آخر زيارة</div><div className={`font-extrabold ${late ? "text-red-700" : "text-[var(--navy)]"}`}>{ctx.daysSince === null ? "أول زيارة" : ctx.daysSince === 0 ? "النهارده" : `من ${ctx.daysSince} يوم`}</div></div>
        <div className="rounded-2xl bg-white border border-[var(--border)] p-2"><div className="text-[11px] text-[var(--muted)]">الفئة</div><div className="font-extrabold text-[var(--navy)]">{ctx.doctor.classification || "—"}{gap ? <span className="text-[11px] font-normal text-[var(--muted)]"> · كل {gap} يوم</span> : null}</div></div>
      </div>
      {ctx.plan && <div className="rounded-2xl bg-white border border-[var(--border)] p-3 text-sm">🗓️ <b>في خطة النهارده</b>{ctx.plan.product_name ? ` — ${ctx.plan.product_name}` : ""}{ctx.plan.note ? <div className="text-xs text-[var(--muted)] mt-1">{ctx.plan.note}</div> : null}</div>}
      {ctx.followups.length > 0 && <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-sm space-y-1">{ctx.followups.map((f, i) => <div key={i}>↻ <b>متابعة {f.due}</b>{f.note ? ` — ${f.note}` : ""}</div>)}</div>}
      {last && <div className="rounded-2xl bg-white border border-[var(--border)] p-3 text-sm">
        <div className="text-xs text-[var(--muted)] mb-1">آخر مرة ({last.mine ? "إنت" : last.rep_name})</div>
        {last.presented.length > 0 && <div className="flex flex-wrap gap-1 mb-1">{last.presented.map(p => <span key={p.product_id} className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[11px] font-bold">{RX[p.reaction] || ""} {p.name}</span>)}</div>}
        {last.notes && <div className="text-xs leading-5 line-clamp-3">«{last.notes}»</div>}
      </div>}
      {ctx.suggested.length > 0 && <div>
        <div className="text-xs font-bold text-[var(--muted)] mb-1.5">اقتراح العرض</div>
        <div className="flex flex-wrap gap-1.5">{ctx.suggested.map((id, i) => <button key={id} type="button" onClick={() => onPresent(id)} className={`rounded-xl px-3 py-2 text-xs font-bold ${i === 0 ? "bg-[var(--navy)] text-white" : "bg-white border border-[var(--border)]"}`}>▶ {name(id)}</button>)}</div>
      </div>}
      {ctx.history.length > 1 && <details className="text-xs"><summary className="cursor-pointer font-bold text-[var(--navy)]">سجل الزيارات ({ctx.history.length})</summary>
        <div className="mt-2 space-y-1.5">{ctx.history.slice(1).map(h => <div key={h.id} className="rounded-xl bg-white border border-[var(--border)] p-2"><div className="text-[11px] text-[var(--muted)]">{new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "short", timeZone: "Asia/Riyadh" }).format(new Date(h.visited_at))} · {h.rep_name}</div><div className="line-clamp-2">{h.notes}</div></div>)}</div>
      </details>}
    </div>
  );
}

function SuccessScreen({ doctor, presented, samples, followUp, onNew }: { doctor: string; presented: number; samples: number; followUp: string; onNew: () => void }) {
  return (
    <div className="mt-6 max-w-md mx-auto text-center rounded-3xl border border-[var(--border)] bg-white p-8 space-y-4">
      <div className="mx-auto h-20 w-20 rounded-full bg-emerald-600 text-white grid place-items-center text-4xl animate-[pop_.35s_ease-out]">✓</div>
      <div className="text-2xl font-extrabold text-[var(--navy)]">اتسجلت الزيارة</div>
      <div className="text-sm text-[var(--muted)]">{doctor}{presented ? ` · ${presented} منتج` : ""}{samples ? ` · ${samples} عينة` : ""}{followUp ? ` · متابعة ${followUp}` : ""}</div>
      <div className="grid gap-2 pt-2">
        <a href="/calendar" className="rounded-2xl bg-[var(--navy)] text-white py-3 font-bold">🗓️ الزيارة الجاية في المخطط</a>
        <button onClick={onNew} className="rounded-2xl border border-[var(--border)] py-3 font-bold">+ زيارة جديدة</button>
        <a href="/visits" className="text-sm font-bold text-[var(--navy)]">زياراتي</a>
      </div>
      <style>{`@keyframes pop{0%{transform:scale(.4);opacity:0}70%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}
