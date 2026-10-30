"use client";
import { useEffect, useRef, useState } from "react";

type R = { found: boolean; ref?: string; signer?: string; signed_at?: string; name?: string; kinds?: string[]; sha256?: string; source?: string; intact?: boolean | null; error?: string };
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");

export default function VerifyClient({ initialRef }: { initialRef: string }) {
  const [ref, setRef] = useState(initialRef.toUpperCase());
  const [file, setFile] = useState<{ name: string; hash: string } | null>(null);
  const [busy, setBusy] = useState(false); const [res, setRes] = useState<R | null>(null); const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const check = async (r = ref, f = file) => {
    if (!r.trim() && !f) return;
    setBusy(true); setRes(null);
    try {
      const p = new URLSearchParams(); if (r.trim()) p.set("ref", r.trim()); if (f) p.set("hash", f.hash);
      const resp = await fetch(`/api/verify?${p}`, { cache: "no-store" }); setRes(await resp.json());
    } catch { setRes({ found: false, error: "تعذر الاتصال" }); } finally { setBusy(false); }
  };
  useEffect(() => { if (initialRef) void check(initialRef, null); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = async (f?: File | null) => {
    if (!f) return; if (f.size > 40 * 1048576) { setRes({ found: false, error: "الملف كبير جدًا" }); return; }
    const h = hex(await crypto.subtle.digest("SHA-256", await f.arrayBuffer())); const x = { name: f.name, hash: h }; setFile(x); void check(ref, x);
  };
  const ok = res?.found && res.intact !== false;
  const when = res?.signed_at ? new Date(res.signed_at).toLocaleString("ar-EG-u-nu-latn", { timeZone: "Asia/Riyadh", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  return <main dir="rtl" className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0b2b30] via-[#10484f] to-[#0d3a40] p-4 font-sans">
    <div className="w-full max-w-lg">
      <div className="mb-5 text-center text-white"><div className="text-2xl font-extrabold tracking-[0.3em]">ELITE <span className="text-[#33b3a6]">SKIN</span></div><div className="mt-1 text-sm text-white/60">التحقق من صحة مستند موقّع أو مختوم</div></div>
      <div className="space-y-4 rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
        <div><label className="mb-1.5 block text-sm font-bold text-slate-700">الرقم المرجعي (Ref)</label>
          <div className="flex gap-2"><input value={ref} onChange={e => setRef(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && void check()} placeholder="مثال: 9C040229" dir="ltr" maxLength={12} className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 px-4 text-center font-mono text-lg tracking-widest outline-none focus:border-[#33b3a6]" />
            <button onClick={() => void check()} disabled={busy || (!ref.trim() && !file)} className="shrink-0 rounded-xl bg-[#10484f] px-5 font-bold text-white disabled:opacity-40">{busy ? "…" : "تحقق"}</button></div>
          <div className="mt-1 text-[11px] text-slate-500">مكتوب في أسفل الصفحة الموقّعة بجانب كلمة Ref</div></div>
        <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); void pick(e.dataTransfer.files?.[0]); }} onClick={() => input.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-5 text-center transition ${drag ? "border-[#33b3a6] bg-teal-50" : "border-slate-200 hover:bg-slate-50"}`}>
          <input ref={input} type="file" accept="application/pdf" className="hidden" onChange={e => void pick(e.target.files?.[0])} />
          {file ? <><div className="text-sm font-bold text-slate-800" dir="auto">📄 {file.name}</div><div className="mt-1 truncate font-mono text-[10px] text-slate-400" dir="ltr">{file.hash}</div></> : <><div className="text-2xl">📄</div><div className="mt-1 text-sm font-bold text-slate-700">أو اسحب ملف الـ PDF الموقّع هنا</div><div className="text-[11px] text-slate-500">عشان نتأكد إنه ما اتعدلش بعد التوقيع — الملف مش بيترفع، بنقارن بصمته بس</div></>}
        </div>
        {res && (res.error ? <div className="rounded-2xl bg-amber-50 p-4 text-center text-sm font-bold text-amber-800">{res.error}</div>
          : <div className={`rounded-2xl border-2 p-5 ${ok ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
            <div className="flex items-center gap-3"><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl text-white ${ok ? "bg-emerald-600" : "bg-red-600"}`}>{ok ? "✓" : "✕"}</span>
              <div><div className={`text-lg font-extrabold ${ok ? "text-emerald-800" : "text-red-800"}`}>{!res.found ? "مستند غير معروف" : res.intact === false ? "المستند اتعدّل بعد التوقيع" : res.intact ? "مستند أصلي ومطابق تمامًا" : "التوقيع مسجّل وصحيح"}</div>
                <div className={`text-xs ${ok ? "text-emerald-700" : "text-red-700"}`}>{!res.found ? "مفيش مستند موقّع بالرقم أو البصمة دي في نظام Elite Skin" : res.intact === false ? "الرقم المرجعي صحيح، لكن الملف اللي رفعته مش هو النسخة الموقّعة الأصلية" : res.intact ? "البصمة الرقمية للملف مطابقة للنسخة الموقّعة" : "ارفع الملف كمان عشان نتأكد إن محتواه ما اتغيرش"}</div></div></div>
            {res.found && <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-slate-500">المستند</dt><dd className="font-bold" dir="auto">{res.name}</dd>
              <dt className="text-slate-500">وقّعه</dt><dd className="font-bold">{res.signer || "—"}</dd>
              <dt className="text-slate-500">التاريخ</dt><dd className="font-bold">{when}</dd>
              {res.kinds?.length ? <><dt className="text-slate-500">النوع</dt><dd className="font-bold">{res.kinds.join(" + ")}</dd></> : null}
              {res.ref && <><dt className="text-slate-500">المرجع</dt><dd className="font-mono font-bold" dir="ltr">{res.ref}</dd></>}
            </dl>}
          </div>)}
      </div>
      <div className="mt-4 text-center text-[11px] text-white/40">Elite Skin CRM · Document verification</div>
    </div>
  </main>;
}
