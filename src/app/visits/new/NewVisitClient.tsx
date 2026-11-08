"use client";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import DetailingPresenter from "@/components/detailing/DetailingPresenter";
import type { DetailProduct, PresenterResult } from "@/components/detailing/types";
import { BrochureCover } from "@/components/detailing/BrochureViewer";
import { brochureUrl } from "@/components/detailing/pdf";
import ClinicHint from "./ClinicHint";
import VoiceNote from "./VoiceNote";
import { OBJECTIONS, POSITIVES, ruleInsights } from "@/lib/visit-insights-rules";

import { PURPOSE_LABELS, REACTION_LABELS, collectSampleItems, type Reaction, type SamplePurpose, type SampleRow } from "@/lib/visit-entry";
import { classifyOfflineResponse, ensureIdempotencyKey } from "@/lib/idempotency-queue";
import { riyadhToday } from "@/lib/fmt";

type Doctor = { id:string; name:string; clinic_name:string; city:string; classification?: string|null };
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

const fuDate = (days: number) => { const d = new Date(Date.now() + days * 864e5); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(d); };

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
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("completed");
  const [presented, setPresented] = useState<Presented[]>(() => initialPresented.length ? initialPresented : initialProductId ? [{productId:initialProductId,reaction:"neutral"}] : []);
  const [catalog, setCatalog] = useState<DetailProduct[] | null>(null);
  const [presenting, setPresenting] = useState<string | null>(null);
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
  const [wiz, setWiz] = useState(0);
  const [ctx, setCtx] = useState<VisitContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [todayPlan, setTodayPlan] = useState<TodayItem[]>([]);
  useEffect(() => {
    const t = riyadhToday();
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
    setDoctorId(id); setQ(`${d.name} · ${d.clinic_name}`);
    if (productId && !presented.some(x => x.productId === productId) && products.some(p => p.id === productId)) setPresented(p => [...p, { productId, reaction: "neutral" }]);
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

  const riyadhDay = riyadhToday();
  const planDone = todayPlan.filter(t => t.done).length;
  const nextPlan = todayPlan.find(t => !t.done && t.doctor_id !== doctorId) || null;
  const planIds = useMemo(() => new Set(todayPlan.filter(t => !t.done).map(t => t.doctor_id)), [todayPlan]);
  const listDoctors = useMemo(() => q.trim() ? filtered : [...doctors].sort((a, b) => Number(planIds.has(b.id)) - Number(planIds.has(a.id))).slice(0, 8), [q, filtered, doctors, planIds]);
  const [online, setOnline] = useState(true);
  useEffect(() => { const f = () => setOnline(navigator.onLine); f(); window.addEventListener("online", f); window.addEventListener("offline", f); return () => { window.removeEventListener("online", f); window.removeEventListener("offline", f); }; }, []);
  const detect = useMemo(() => notesLen >= 6 ? ruleInsights(notes, riyadhDay) : null, [notes, notesLen, riyadhDay]);
  const [detectOff, setDetectOff] = useState("");
  const sampleTotal = sampleState.items.reduce((a, x) => a + x.quantity, 0);

  if (done) return <SuccessScreen doctor={selectedDoctor?.name || ""} presented={presented.length} samples={sampleTotal} followUp={followUpAt} next={nextPlan} onNew={() => { window.location.href = "/visits/new"; }} />;

  const phone = mode === "phone";
  const eyebrow = (n: number) => phone ? `الخطوة ${n} من 4` : undefined;

  // ───────────── 1 · doctor ─────────────
  const doctorSection = selectedDoctor ? (
    <Card>
      <div className="flex items-center gap-3">
        <Avatar text={ctx?.doctor.classification || selectedDoctor.classification || selectedDoctor.name.slice(0, 1)} />
        <div className="min-w-0 flex-1"><div className="text-[11px] font-bold text-teal-600">{eyebrow(1) || "الطبيب"}</div><div className="truncate text-lg font-extrabold text-[var(--navy)]" dir="auto">{selectedDoctor.name}</div><div className="truncate text-xs text-[var(--muted)]" dir="auto">{[ctx?.doctor.specialty, selectedDoctor.clinic_name, selectedDoctor.city].filter(Boolean).join(" · ")}</div></div>
        {ctx?.doctor.phone && <a href={`tel:${String(ctx.doctor.phone).replace(/\s/g, "")}`} className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--border)] bg-white" title="اتصال">📞</a>}
        {!locked && <button type="button" onClick={() => { setDoctorId(""); setQ(""); }} className="rounded-xl px-2 py-2 text-xs font-bold text-teal-700 hover:text-red-600">تغيير</button>}
      </div>
    </Card>
  ) : (<>
    <Card>
      <Title eyebrow={eyebrow(1)} title="مين هنزور النهارده؟" icon="🔍" />
      <label className="relative block"><span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)]">🔍</span>
        <input value={q} onChange={e => { setQ(e.target.value); }} placeholder="ابحث باسم الطبيب أو العيادة أو المدينة"
          className="min-h-14 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] pl-4 pr-11 text-base outline-none transition focus:border-teal-500 focus:bg-white" /></label>
      {todayPlan.length > 0 && <div className="mt-4">
        <div className="mb-2 text-sm font-extrabold">خطة النهارده <span className="text-xs font-bold text-[var(--muted)]">· {planDone} من {todayPlan.length}</span></div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">{todayPlan.map(t => { const isNext = nextPlan?.id === t.id; return (
          <button key={t.id} type="button" onClick={() => pickDoctor(t.doctor_id, t.product_id)} disabled={t.done}
            className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold transition ${t.done ? "bg-[var(--bg)] text-[var(--muted)]" : isNext ? "bg-teal-50 text-[var(--navy)] ring-1 ring-teal-500" : "border border-[var(--border)] bg-white text-[var(--navy)] hover:border-teal-500"}`}>
            <span dir="auto">{t.done ? "✓ " : isNext ? "الجاية · " : ""}{t.doctor_name}</span>{t.product_name && !t.done ? <span className="font-normal text-[var(--muted)]"> · {t.product_name}</span> : null}</button>); })}</div>
      </div>}
    </Card>
    <Card>
      <div className="mb-2 flex items-center justify-between"><h2 className="font-extrabold">{q.trim() ? "نتايج البحث" : "دكاترتك"}</h2>{!q.trim() && planIds.size > 0 && <span className="text-[11px] text-[var(--muted)]">اللي في خطتك الأول</span>}</div>
      <div className="flex flex-col gap-1">{listDoctors.map(d => (
        <button key={d.id} type="button" onClick={() => pickDoctor(d.id)} className="flex min-h-16 items-center gap-3 rounded-2xl p-2 text-right transition hover:bg-[var(--bg)]">
          <Avatar soft text={d.name.replace(/^(د|dr)\.?\s*/i, "").slice(0, 2).toUpperCase()} />
          <span className="min-w-0 flex-1"><span className="block truncate font-extrabold" dir="auto">{d.name}</span><span className="block truncate text-xs text-[var(--muted)]" dir="auto">{[d.clinic_name, d.city].filter(Boolean).join(" · ")}</span></span>
          {planIds.has(d.id) && <span className="rounded-lg bg-teal-50 px-2 py-1 text-[10.5px] font-bold text-teal-700">في الخطة</span>}
          {d.classification && <span className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-extrabold text-amber-700">{String(d.classification).toUpperCase()}</span>}
          <span className="text-[var(--muted)]">‹</span>
        </button>))}
        {!listDoctors.length && <div className="p-4 text-center text-sm text-[var(--muted)]">مفيش نتايج — جرّب اسم العيادة أو المدينة</div>}
      </div>
    </Card>
  </>);

  const samePresented = (ids: string[]) => { const ok = ids.filter(id => products.some(p => p.id === id)); setPresented(prev => [...prev, ...ok.filter(id => !prev.some(x => x.productId === id)).map(productId => ({ productId, reaction: "neutral" as Reaction }))]); if (ok.length) toast(`اتضاف ${ok.length} منتج زي المرة اللي فاتت`, "success"); };
  const contextCard = doctorId ? <ContextCard ctx={ctx} loading={ctxLoading} products={products} onPresent={presentFrom} doctorId={doctorId} onSame={samePresented} already={presented.map(x => x.productId)} /> : null;

  // ───────────── 2 · offer ─────────────
  const productsSection = (<>
    <section className="es-card-in overflow-hidden rounded-[26px] bg-gradient-to-br from-[var(--navy)] to-[#0b2a2f] p-5 text-white shadow-sm">
      {phone && <p className="text-xs font-bold text-teal-200">{eyebrow(2)}</p>}
      <h2 className="mt-1 text-2xl font-extrabold">خلّينا نبدأ العرض</h2>
      <p className="mt-1 text-sm text-white/75">بروشور ملء الشاشة — ردود فعل الطبيب بتتسجل هنا لوحدها</p>
      <button type="button" onClick={() => void presentFrom()} disabled={locked} className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-teal-500 text-base font-extrabold text-white shadow-lg transition hover:bg-teal-400 active:scale-[.99] disabled:opacity-50">ابدأ العرض للطبيب ▶</button>
    </section>
    <Card>
      <Title title="المنتجات" icon="⭐" sub="دوس على اللي شرحته" />
      <div className={`grid gap-3 ${phone ? "grid-cols-2" : "grid-cols-2 xl:grid-cols-3"}`}>
        {productsView.map(p => {
          const sel = presented.find(x => x.productId === p.id); const row = sampleRows.find(x => x.productId === p.id); const qty = row?.quantity || 0;
          const b = p.cat?.brochures?.[0];
          return (
            <div key={p.id} className={`flex flex-col overflow-hidden rounded-2xl border transition-all ${sel ? "border-teal-500 bg-teal-50/60 shadow-sm" : "border-[var(--border)] bg-white"}`}>
              <button type="button" onClick={() => togglePresented(p.id)} aria-pressed={!!sel} className="flex-1 p-3 text-right">
                <div className="flex items-start justify-between gap-1">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100" style={{ background: p.cat?.color || "var(--navy)" }}>
                    {b ? <BrochureCover url={brochureUrl(b.id)} mime={b.mime} className="h-full w-full bg-white" /> : !p.cat?.image_available ? <div className="grid h-full w-full place-items-center text-sm font-extrabold text-white">{p.name.slice(0, 2).toUpperCase()}</div> : <ProductThumb id={p.id} name={p.name} />}
                    {sel && <span className="absolute inset-0 grid place-items-center bg-[var(--navy)]/60 text-lg text-white">✓</span>}
                  </div>
                  <div className="flex flex-col items-end gap-1">{p.suggested && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">مقترح ⭐</span>}{p.id === assignedProductId && <span className="rounded-full bg-[var(--sky-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--navy)]">منتجي</span>}</div>
                </div>
                <div className="mt-3 truncate text-base font-extrabold" dir="auto">{p.name}</div>
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[var(--muted)]">{p.cat?.tagline || PRODUCT_DESC[p.name] || ""}</div>
              </button>
              {p.cat && !sel && <button type="button" onClick={() => void presentFrom(p.id)} className="border-t border-[var(--border)] py-2 text-xs font-bold text-[var(--navy)] hover:bg-[var(--bg)]">▶ عرض البروشور</button>}
              {sel && <div className="space-y-2 border-t border-teal-200 p-2.5">
                <div className="grid grid-cols-3 gap-1">{(Object.keys(REACTION_LABELS) as Reaction[]).map(v => <button key={v} type="button" onClick={() => setReaction(p.id, v)} aria-pressed={sel.reaction === v} title={REACTION_LABELS[v]}
                  className={`min-h-10 rounded-xl border text-base transition ${sel.reaction === v ? v === "interested" ? "border-emerald-600 bg-emerald-600" : v === "not_interested" ? "border-red-600 bg-red-600" : "border-slate-500 bg-slate-500" : "border-[var(--border)] bg-white"}`}>{REACTION_ICONS[v]}</button>)}</div>
                <div className="text-center text-[10.5px] font-bold text-[var(--muted)]">{REACTION_LABELS[sel.reaction]}</div>
                <div className="flex items-center justify-between gap-1 text-xs font-bold"><span>العينات</span><span className="flex items-center gap-1.5">
                  <button type="button" aria-label="تقليل" onClick={() => updateSample(p.id, { quantity: Math.max(0, qty - 1) })} disabled={!qty} className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] bg-white disabled:opacity-30">−</button>
                  <b className="w-6 text-center text-sm">{qty}</b>
                  <button type="button" aria-label="زيادة" onClick={() => updateSample(p.id, { quantity: Math.min(10000, qty + 1) })} className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--navy)] text-white">+</button></span></div>
                {qty > 0 && <select value={row?.purpose || ""} onChange={e => updateSample(p.id, { purpose: e.target.value as SamplePurpose })} aria-label="غرض العينة"
                  className={`min-h-9 w-full rounded-lg border px-2 text-[11.5px] font-bold ${row?.purpose ? "border-[var(--border)] bg-white" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
                  <option value="">الغرض؟</option>{(Object.keys(PURPOSE_LABELS) as SamplePurpose[]).map(v => <option key={v} value={v}>{PURPOSE_LABELS[v]}</option>)}</select>}
              </div>}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-center text-sm font-bold text-[var(--muted)]">{presented.length ? `اتعرض ${presented.length} منتج${sampleTotal ? ` · ${sampleTotal} عينة` : ""}` : "لسه ما اخترتش منتجات — اختياري"}</p>
      {sampleInvalid && <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs font-bold text-amber-800">{sampleState.error}</div>}
      {presenting && catalog && <DetailingPresenter products={catalog} startId={presenting} doctor={selectedDoctor ? { id: selectedDoctor.id, name: selectedDoctor.name } : null} initialReactions={Object.fromEntries(presented.map(x => [x.productId, x.reaction]))} onClose={presenterClosed} />}
    </Card>
  </>);

  // ───────────── 3 · result ─────────────
  const quick = status === "cancelled" ? ["الطبيب مش موجود", "العيادة مقفولة", "مشغول جداً — اتأجلت", "لا يستقبل مناديب"] : ["الطبيب مهتم وطلب تفاصيل أكتر", "طلب عينات إضافية", "هيبدأ يجرب المنتج مع المرضى", "عنده تحفظ على السعر", "طلب متابعة قريبة", "أكّد حضور الدعوة"];
  const found = detect ? [...detect.objections.map(k => `اعتراض: ${OBJECTIONS[k]}`), ...detect.positives.map(k => POSITIVES[k])] : [];
  const fuSuggest = detect?.follow_up && detect.follow_up.date !== followUpAt && detectOff !== detect.follow_up.date ? detect.follow_up : null;
  const resultSection = (<>
    <Card>
      <Title eyebrow={eyebrow(3)} title="إيه اللي حصل؟" icon="✓" />
      <div className="grid grid-cols-3 gap-2">
        {([["completed", "✓ تمت", "border-emerald-500 bg-emerald-50 text-emerald-700"], ["planned", "🕑 اتأجلت", "border-sky-500 bg-sky-50 text-sky-700"], ["cancelled", "✕ اتلغت", "border-red-500 bg-red-50 text-red-700"]] as const).map(([v, l, c]) =>
          <button key={v} type="button" onClick={() => setStatus(v)} aria-pressed={status === v} className={`min-h-14 rounded-2xl border-2 text-sm font-extrabold transition ${status === v ? c : "border-[var(--border)] bg-white text-[var(--muted)]"}`}>{l}</button>)}
      </div>
    </Card>
    <Card>
      <div className="mb-2 flex items-center justify-between"><label htmlFor="visit-notes" className="font-extrabold">ملاحظات الزيارة <span className="text-red-600">*</span></label>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${notesOk ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{notesOk ? "✓" : `${Math.max(0, 10 - notesLen)} حرف كمان`}</span></div>
      <div className="relative">
        <textarea id="visit-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={phone ? 5 : 5} placeholder="اكتب اللي حصل بسرعة… أو دوس المايك واتكلم"
          className="min-h-32 w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-3 pl-16 text-base leading-7 outline-none transition focus:border-teal-500 focus:bg-white" />
        <div className="absolute bottom-3 left-3"><VoiceNote compact onText={t => setNotes(n => (n.trim() ? `${n.trim()} ` : "") + t)} /></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">{quick.map(t => <button key={t} type="button" onClick={() => addNote(t)} className="min-h-10 rounded-full border border-[var(--border)] bg-white px-3 text-xs font-bold text-[var(--ink-soft)] transition hover:border-teal-500 active:scale-95">+ {t}</button>)}</div>
      {(found.length > 0 || fuSuggest || detect?.next) && <div className="es-pop mt-4 rounded-2xl bg-[var(--bg)] p-3 text-xs font-bold text-[var(--ink-soft)]">
        {found.length > 0 && <div>🧠 اكتشفنا: {found.join(" · ")}</div>}
        {detect?.next && <div className="mt-1 text-teal-700">الخطوة الجاية: {detect.next}</div>}
        {fuSuggest && <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-white p-2"><span>↻ متابعة {fuSuggest.reason} ({fuSuggest.date.slice(5).split("-").reverse().join("/")})</span>
          <span className="flex shrink-0 gap-1"><button type="button" onClick={() => setFollowUpAt(fuSuggest.date)} className="rounded-lg bg-teal-500 px-3 py-1.5 text-white">تمام</button><button type="button" onClick={() => setDetectOff(fuSuggest.date)} className="rounded-lg border border-[var(--border)] px-3 py-1.5">لأ</button></span></div>}
      </div>}
    </Card>
    <Card>
      <Title title="المتابعة" icon="↻" sub="اختياري — بتظهر في مخطط العمل" />
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {([["بكرة", 1], ["بعد أسبوع", 7], ["بعد أسبوعين", 14], ["بعد شهر", 30]] as const).map(([l, d]) => { const v = fuDate(d); return <button key={l} type="button" onClick={() => setFollowUpAt(followUpAt === v ? "" : v)} aria-pressed={followUpAt === v} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-bold transition ${followUpAt === v ? "bg-[var(--navy)] text-white" : "bg-teal-50 text-[var(--navy)]"}`}>{l}</button>; })}
      </div>
      <input type="date" value={followUpAt} onChange={e => setFollowUpAt(e.target.value)} aria-label="تاريخ المتابعة" className="mt-3 min-h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" />
      {followUpAt && <input value={followUpNote} onChange={e => setFollowUpNote(e.target.value)} placeholder="المطلوب في المتابعة (مثال: توصيل عينات)" className="mt-3 min-h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" />}
    </Card>
  </>);

  // ───────────── 4 · send ─────────────
  const extrasSection = (<>
    <Card>
      <Title eyebrow={eyebrow(4)} title={phone ? "نقفل الزيارة؟" : "الموقع والمرفقات"} icon="📍" />
      <div className={`flex min-h-16 items-center gap-3 rounded-2xl p-3 ${!online ? "bg-amber-50 text-amber-800" : gps ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
        <span className="text-xl">{!online ? "📴" : gps ? "✓" : "📍"}</span>
        <span className="flex-1 text-sm font-bold">{!online ? "مفيش نت — الزيارة هتتحفظ على الموبايل وتتبعت لوحدها أول ما النت يرجع" : gpsLoading ? "جاري تحديد الموقع…" : gps ? `موقعك اتسجل · دقة ${Math.round(gps.accuracy_m)}م` : gpsStatus}</span>
        <button type="button" onClick={captureGps} disabled={gpsLoading} className="rounded-xl bg-white/70 px-3 py-2 text-xs font-bold underline-offset-2 hover:underline">تحديث</button>
      </div>
    </Card>
    <Card>
      <Title title="مرفقات" icon="📎" sub="اختياري" />
      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-[var(--border)] text-sm font-bold transition hover:border-teal-500">📷 صورة<input type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => { void addFiles(e.target.files); e.target.value = ""; }} /></label>
        <label className="flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-[var(--border)] text-sm font-bold transition hover:border-teal-500">📎 ملف<input type="file" accept="image/*,application/pdf" multiple className="sr-only" onChange={e => { void addFiles(e.target.files); e.target.value = ""; }} /></label>
      </div>
      {files.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">{files.map(item => (
        <div key={item.id} className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          <div className="aspect-square bg-slate-100">{item.preview ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={item.preview} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs font-bold">PDF</div>}</div>
          {item.state === "uploading" && <div className="absolute inset-x-0 bottom-0 h-1.5 bg-slate-200"><div className="h-full bg-teal-500" style={{ width: `${item.progress}%` }} /></div>}
          {item.state === "done" && <span className="absolute left-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-emerald-600 text-xs text-white">✓</span>}
          {item.state === "error" && <div className="absolute inset-x-0 bottom-0 truncate bg-red-600 p-0.5 text-center text-[10px] text-white">{item.error || "تعذر"}</div>}
          {item.state !== "uploading" && item.state !== "done" && <button type="button" onClick={() => removeFile(item.id)} className="absolute right-1 top-1 h-6 w-6 rounded-full bg-black/60 text-sm text-white" aria-label="حذف">×</button>}
        </div>))}</div>}
    </Card>
  </>);

  const saveLabel = loading ? "جاري الحفظ…" : locked ? "إعادة رفع الملفات" : "✓ حفظ الزيارة";
  const errBox = err && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</div>;
  const summary = (withSave: boolean) => (
    <Card>
      <p className="text-xs font-bold text-teal-600">ملخص الزيارة</p>
      <div className="mt-1 truncate text-lg font-extrabold text-[var(--navy)]" dir="auto">{selectedDoctor?.name || "اختار طبيب الأول"}</div>
      {selectedDoctor && <div className="truncate text-xs text-[var(--muted)]" dir="auto">{[selectedDoctor.clinic_name, ctx?.doctor.classification ? `فئة ${ctx.doctor.classification}` : ""].filter(Boolean).join(" · ")}</div>}
      <div className="my-3 h-px bg-[var(--border)]" />
      <div className="space-y-2">{checks.map(c => <div key={c.label} className={`flex items-center gap-2 text-sm font-bold ${c.ok ? "text-emerald-700" : c.optional ? "text-[var(--muted)]" : "text-red-600"}`}>
        <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] text-white ${c.ok ? "bg-emerald-600" : c.optional ? "bg-slate-300" : "bg-red-500"}`}>{c.ok ? "✓" : c.optional ? "○" : "!"}</span>{c.label}{c.optional && !c.ok ? <span className="text-[11px] font-normal">(اختياري)</span> : null}</div>)}</div>
      {presented.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{presented.map(x => { const p = products.find(y => y.id === x.productId); const s = sampleRows.find(r => r.productId === x.productId)?.quantity || 0; return p && <span key={x.productId} className="rounded-full bg-[var(--bg)] px-2 py-0.5 text-[11px] font-bold" dir="auto">{REACTION_ICONS[x.reaction]} {p.name}{s ? ` · ${s} عينة` : ""}</span>; })}</div>}
      {followUpAt && <div className="mt-2 text-xs font-bold text-[var(--navy)]">↻ متابعة {followUpAt}</div>}
      {withSave && <div className="mt-4 space-y-2">{errBox}
        <button type="submit" disabled={!canSave} className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-[var(--navy)] text-base font-extrabold text-white shadow-lg shadow-[var(--navy)]/20 transition active:scale-[.99] disabled:opacity-40">{saveLabel}</button>
        {locked && <button type="button" onClick={() => setDone(true)} className="w-full rounded-2xl border border-[var(--border)] py-2.5 text-sm font-bold">متابعة من غير الملفات</button>}</div>}
    </Card>
  );
  const banners = <>
    {offlineQueued > 0 && <div className="flex items-center justify-between rounded-2xl border border-amber-300 bg-amber-50 p-3"><span className="text-sm font-bold text-amber-900">📴 {offlineQueued} زيارة محفوظة على الجهاز من غير نت</span><button type="button" onClick={() => void flushQueue()} className="rounded-xl border border-amber-400 bg-white px-3 py-1.5 text-xs font-bold">مزامنة الآن</button></div>}
    {locked && <div role="status" className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">✓ الزيارة اتحفظت — فاضل رفع الملفات بس</div>}
  </>;

  const steps = ["الطبيب", "العرض", "النتيجة", "الإرسال"];
  const header = (
    <div className="mb-3">
      <div className="flex items-end justify-between gap-3"><div>
        {todayPlan.length > 0 && <p className="text-xs font-bold text-teal-600">زيارات اليوم · {planDone} من {todayPlan.length}</p>}
        <h1 className="text-2xl font-extrabold text-[var(--navy)]">تسجيل زيارة</h1>
        {!phone && <p className="mt-0.5 text-sm text-[var(--muted)]">اختار الطبيب، اعرض البروشور، وسجّل النتيجة — الوقت والموقع بيتسجلوا لوحدهم</p>}</div></div>
      {phone && <div className="mt-3">
        <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--border)]"><div className="h-full rounded-full bg-teal-500 transition-all duration-500" style={{ width: `${((wiz + 1) / 4) * 100}%` }} /></div>
        <div className="grid grid-cols-4 gap-1 text-center text-[11px] font-bold">{steps.map((s, i) => <button key={s} type="button" onClick={() => (i <= wiz || (i === 1 && doctorId)) && setWiz(i)} className={`py-1 ${i === wiz ? "text-[var(--navy)]" : "text-[var(--muted)]"}`}>{i < wiz ? "✓ " : ""}{s}</button>)}</div>
      </div>}
    </div>
  );

  // ───────────── layouts ─────────────
  if (phone) {
    const canNext = wiz === 0 ? !!doctorId : wiz === 1 ? !sampleInvalid : wiz === 2 ? notesOk && !sampleInvalid : canSave;
    const nextLabel = wiz === 0 ? (doctorId ? "التالي: العرض" : "اختار الطبيب الأول") : wiz === 1 ? "التالي: النتيجة" : wiz === 2 ? (notesOk ? "التالي: الإرسال" : "اكتب الملاحظات") : saveLabel;
    return (
      <form onSubmit={submit} className="mt-1 space-y-3 pb-44">
        {header}
        {banners}
        <fieldset disabled={locked} className="m-0 min-w-0 space-y-3 border-0 p-0">
          {wiz === 0 && <>{doctorSection}{contextCard}</>}
          {wiz === 1 && <>{selectedDoctor && <ClinicHint doctorId={selectedDoctor.id} />}{productsSection}</>}
          {wiz === 2 && resultSection}
        </fieldset>
        {wiz === 3 && <>{extrasSection}{summary(false)}{errBox}{locked && <button type="button" onClick={() => setDone(true)} className="w-full rounded-2xl border border-[var(--border)] py-2.5 text-sm font-bold">متابعة من غير الملفات</button>}</>}
        <div className="fixed inset-x-0 bottom-[4.75rem] z-30 px-3">
          <div className="mx-auto flex max-w-lg gap-2 rounded-2xl border border-[var(--border)] bg-white/95 p-2 shadow-xl backdrop-blur">
            <button type="button" disabled={wiz === 0} onClick={() => setWiz(wiz - 1)} className="flex min-h-12 flex-1 items-center justify-center gap-1 rounded-xl border border-[var(--border)] font-bold text-[var(--navy)] disabled:opacity-30">→ رجوع</button>
            {wiz < 3
              ? <button key="next" type="button" disabled={!canNext} onClick={() => setWiz(wiz + 1)} className="flex min-h-12 flex-[1.6] items-center justify-center gap-1 rounded-xl bg-[var(--navy)] font-extrabold text-white shadow-lg shadow-[var(--navy)]/20 disabled:opacity-40">{nextLabel} ←</button>
              : <button key="save" type="submit" disabled={!canSave} className="flex min-h-12 flex-[1.6] items-center justify-center rounded-xl bg-[var(--navy)] font-extrabold text-white shadow-lg shadow-[var(--navy)]/20 disabled:opacity-40">{saveLabel}</button>}
          </div>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="mt-1">
      {header}
      <div className={mode === "desktop" ? "grid grid-cols-[1fr_360px] items-start gap-4" : "space-y-3 pb-28"}>
        <div className="min-w-0 space-y-3">
          {banners}
          <fieldset disabled={locked} className="m-0 min-w-0 space-y-3 border-0 p-0">
            {doctorSection}
            {mode === "tablet" && contextCard}
            {productsSection}
            {resultSection}
          </fieldset>
          {extrasSection}
        </div>
        {mode === "desktop" ? <div className="sticky top-4 space-y-3">{summary(true)}{contextCard}</div>
          : <div className="fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/95 to-transparent p-3 lg:right-[272px]">
            <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-[var(--border)] bg-white p-2.5 shadow-xl">
              <div className="flex gap-1">{checks.filter(c => !c.optional).map(c => <span key={c.label} title={c.label} className={`h-2.5 w-2.5 rounded-full ${c.ok ? "bg-emerald-500" : "bg-amber-400"}`} />)}</div>
              <div className="flex-1 truncate text-xs text-[var(--muted)]">{!doctorId ? "اختار الطبيب" : !notesOk ? "اكتب ملاحظات الزيارة" : sampleInvalid ? sampleState.error : "جاهزة للحفظ"}</div>
              {err && <div className="max-w-[40%] truncate text-xs text-red-700" title={err}>{err}</div>}
              <button type="submit" disabled={!canSave} className="rounded-xl bg-[var(--navy)] px-6 py-3 font-extrabold text-white disabled:opacity-40">{loading ? "…" : locked ? "إعادة الرفع" : "✓ حفظ الزيارة"}</button>
            </div>
          </div>}
      </div>
    </form>
  );
}

// ───────────── helpers ─────────────
type TodayItem = { id: string; doctor_id: string; doctor_name: string; clinic_name: string; product_id: string | null; product_name: string | null; done: boolean };
type VisitContext = {
  doctor: { classification: string | null; specialty: string | null; phone: string | null; visits_per_month: number | null };
  history: Array<{ id: string; visited_at: string; status: string; notes: string; rep_name: string; mine: boolean; presented: Array<{ product_id: string; name: string; reaction: string }>; samples: number }>;
  followups: Array<{ due: string; note: string }>; plan: { note: string; product_name: string | null; priority: string } | null; suggested: string[]; daysSince: number | null; brief?: string | null;
};

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`es-card-in rounded-[26px] border border-[var(--border)] bg-white p-4 shadow-sm sm:p-5 ${className}`}>{children}</section>;
}
function Title({ eyebrow, title, icon, sub }: { eyebrow?: string; title: string; icon: string; sub?: string }) {
  return <div className="mb-3 flex items-center gap-3">
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-teal-50 text-base text-[var(--navy)]">{icon}</span>
    <div className="min-w-0">{eyebrow && <div className="text-[11px] font-bold text-teal-600">{eyebrow}</div>}<h2 className="text-lg font-extrabold leading-tight">{title}</h2>{sub && <div className="text-[11px] text-[var(--muted)]">{sub}</div>}</div>
  </div>;
}
function Avatar({ text, soft = false }: { text: string; soft?: boolean }) {
  return <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl font-extrabold ${soft ? "bg-[var(--sky-soft)] text-sm text-[var(--navy)]" : "bg-[var(--navy)] text-base text-white"}`}>{text}</span>;
}

const RX: Record<string, string> = { interested: "👍", neutral: "😐", not_interested: "👎" };
function ContextCard({ ctx, loading, products, onPresent, doctorId, onSame, already }: { ctx: VisitContext | null; loading: boolean; products: Array<{ id: string; name: string }>; onPresent: (id: string) => void; doctorId: string; onSame: (ids: string[]) => void; already: string[] }) {
  if (loading && !ctx) return <div className="space-y-2 rounded-[26px] border border-[var(--border)] bg-white p-4">{[0, 1, 2].map(i => <div key={i} className="es-shimmer h-5 rounded" />)}</div>;
  if (!ctx) return null;
  const last = ctx.history[0];
  const gap = ctx.doctor.visits_per_month ? Math.ceil(30 / ctx.doctor.visits_per_month) : null;
  const late = gap !== null && ctx.daysSince !== null && ctx.daysSince > gap;
  const name = (id: string) => products.find(p => p.id === id)?.name || "";
  return (
    <section className="es-card-in space-y-3 rounded-[26px] border border-teal-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2 font-extrabold text-[var(--navy)]"><span>✨</span>قبل ما تدخل</div>
      {ctx.brief && <div className="es-pop rounded-2xl bg-[var(--navy)] px-3 py-3 text-[13px] font-bold leading-6 text-white">💡 {ctx.brief}</div>}
      <div className="grid grid-cols-2 gap-2">
        <div className={`rounded-2xl p-3 ${late ? "bg-red-50" : "bg-[var(--bg)]"}`}><div className="text-[11px] text-[var(--muted)]">آخر زيارة</div><div className={`text-lg font-extrabold ${late ? "text-red-600" : "text-[var(--navy)]"}`}>{ctx.daysSince === null ? "أول زيارة" : ctx.daysSince === 0 ? "النهارده" : `من ${ctx.daysSince} يوم`}</div>{gap ? <div className="text-[10.5px] text-[var(--muted)]">المفروض كل {gap} يوم</div> : null}</div>
        <div className="rounded-2xl bg-[var(--bg)] p-3"><div className="text-[11px] text-[var(--muted)]">الفئة</div><div className="text-lg font-extrabold text-[var(--navy)]">{ctx.doctor.classification || "—"}{ctx.doctor.classification === "A" ? " · أولوية" : ""}</div></div>
      </div>
      <ClinicHint doctorId={doctorId} />
      {ctx.plan && <div className="rounded-2xl bg-teal-50 p-3 text-sm">🗓️ <b>في خطة النهارده</b>{ctx.plan.product_name ? ` — ${ctx.plan.product_name}` : ""}{ctx.plan.note ? <div className="mt-1 text-xs text-[var(--muted)]">{ctx.plan.note}</div> : null}</div>}
      {ctx.followups.length > 0 && <div className="space-y-1 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm">{ctx.followups.map((f, i) => <div key={i}>↻ <b>متابعة {f.due}</b>{f.note ? ` — ${f.note}` : ""}</div>)}</div>}
      {last && <div>
        <div className="mb-1.5 text-sm font-extrabold">آخر مرة ({last.mine ? "إنت" : last.rep_name})</div>
        {last.presented.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{last.presented.map(p => <span key={p.product_id} className={`rounded-full px-3 py-1 text-[11.5px] font-bold ${p.reaction === "interested" ? "bg-emerald-50 text-emerald-800" : p.reaction === "not_interested" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`} dir="auto">{p.name} {RX[p.reaction] || ""}</span>)}</div>}
        {last.notes && <div className="line-clamp-3 rounded-2xl bg-[var(--bg)] px-3 py-2 text-xs italic leading-5 text-[var(--ink-soft)]" dir="auto">«{last.notes}»</div>}
        {last.presented.some(p => !already.includes(p.product_id)) && <button type="button" onClick={() => onSame(last.presented.map(p => p.product_id))} className="mt-2 min-h-12 w-full rounded-2xl border border-[var(--border)] bg-white px-3 text-sm font-bold text-[var(--navy)] transition hover:border-teal-500">↺ نفس منتجات المرة اللي فاتت ({last.presented.length})</button>}
      </div>}
      {ctx.suggested.length > 0 && <div>
        <div className="mb-1.5 text-sm font-extrabold">اقتراح العرض</div>
        <div className="grid grid-cols-2 gap-2">{ctx.suggested.map((id, i) => <button key={id} type="button" onClick={() => onPresent(id)} className={`min-h-12 rounded-2xl px-3 text-sm font-bold transition ${i === 0 ? "bg-teal-500 text-white shadow hover:bg-teal-400" : "border border-[var(--border)] bg-white text-[var(--navy)]"}`} dir="auto">{i === 0 ? "▶ " : ""}{name(id)}</button>)}</div>
      </div>}
      {ctx.history.length > 1 && <details className="text-xs"><summary className="cursor-pointer font-bold text-[var(--navy)]">سجل الزيارات ({ctx.history.length})</summary>
        <div className="mt-2 space-y-1.5">{ctx.history.slice(1).map(h => <div key={h.id} className="rounded-xl border border-[var(--border)] bg-white p-2"><div className="text-[11px] text-[var(--muted)]">{new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "short", timeZone: "Asia/Riyadh" }).format(new Date(h.visited_at))} · {h.rep_name}</div><div className="line-clamp-2" dir="auto">{h.notes}</div></div>)}</div>
      </details>}
    </section>
  );
}

function SuccessScreen({ doctor, presented, samples, followUp, next, onNew }: { doctor: string; presented: number; samples: number; followUp: string; next: TodayItem | null; onNew: () => void }) {
  const fu = followUp ? followUp.slice(5).split("-").reverse().join("/") : "—";
  return (
    <div className="mx-auto mt-6 max-w-md space-y-5 text-center">
      <div className="mx-auto grid h-24 w-24 animate-[pop_.45s_ease-out] place-items-center rounded-full bg-emerald-50 text-5xl text-emerald-600">✓</div>
      <div><div className="text-2xl font-extrabold text-[var(--navy)]">اتسجلت الزيارة</div><div className="mt-1 text-sm text-[var(--muted)]" dir="auto">{doctor}</div></div>
      <div className="grid grid-cols-3 gap-2">{([[presented, "منتج اتعرض"], [samples, "عينة"], [fu, "متابعة"]] as const).map(([v, l]) => <div key={l} className="rounded-2xl border border-[var(--border)] bg-white p-3"><b className="block text-lg text-[var(--navy)]">{v}</b><span className="text-[11px] text-[var(--muted)]">{l}</span></div>)}</div>
      {next ? <div className="rounded-[26px] border border-[var(--border)] bg-white p-4 text-right">
        <p className="text-xs font-bold text-teal-600">الزيارة الجاية في خطتك</p>
        <p className="mt-1 font-extrabold" dir="auto">{next.doctor_name}</p>
        <p className="text-sm text-[var(--muted)]" dir="auto">{[next.clinic_name, next.product_name].filter(Boolean).join(" · ")}</p>
        <a href={`/visits/new?doctorId=${next.doctor_id}${next.product_id ? `&productId=${next.product_id}` : ""}`} className="mt-3 flex min-h-12 w-full items-center justify-center rounded-2xl bg-teal-500 font-extrabold text-white">ابدأها ←</a>
      </div> : <Link href="/calendar" className="block rounded-2xl bg-[var(--navy)] py-3 font-bold text-white">🗓️ مخطط العمل</Link>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onNew} className="min-h-12 rounded-2xl border border-[var(--border)] bg-white font-bold text-[var(--navy)]">+ زيارة جديدة</button>
        <Link href="/" className="grid min-h-12 place-items-center rounded-2xl border border-[var(--border)] bg-white font-bold text-[var(--navy)]">الرئيسية</Link>
      </div>
      <style>{`@keyframes pop{0%{transform:scale(.4);opacity:0}70%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}
