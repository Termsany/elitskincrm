"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";

const STEPS: Array<{ icon: string; color: string; title: string; text: string; tip: string }> = [
  { icon: "sparkle", color: "#33b3a6", title: "أهلاً بيك في eliteSkin", text: "ده مكان شغلك كله: الزيارات، الخطة، الأطباء، المبيعات، والطلبات. الجولة دي دقيقة واحدة.", tip: "تقدر تقفلها في أي وقت" },
  { icon: "new-visit", color: "#10484f", title: "سجّل الزيارة من العيادة", text: "زرار «زيارة» (على الموبايل في نص الشريط تحت). اختار الدكتور، اعرض المنتج، واكتب النتيجة — أو دوس 🎤 واتكلم.", tip: "سجّلها وانت في العيادة عشان الوقت والموقع يتحسبوا صح" },
  { icon: "doctors", color: "#3b90e8", title: "«قبل ما تدخل»", text: "أول ما تختار الدكتور هتشوف آخر زيارة، المتابعة المستحقة، رصيد العيادة، والمنتج المقترح تعرضه.", tip: "«نفس منتجات المرة اللي فاتت» بضغطة واحدة" },
  { icon: "calendar", color: "#e99608", title: "خطتك", text: "من «الخطة» حط زيارات الأسبوع وابعتها للاعتماد. الرئيسية بتوريك زيارات النهارده بالترتيب.", tip: "الأطباء المتأخرين بيظهروا لوحدهم كاقتراح" },
  { icon: "work", color: "#9676e3", title: "الطلبات والإجازات", text: "إجازة، خروج وعودة، سلفة، أو خطاب — من «الطلبات والإجازات». والجرس فوق بيقولك لما الإدارة ترد.", tip: "الجرس بيعدّ المهم بس" },
];

/** First-login tour for reps (5 short cards). */
export default function OnboardingTour({ show }: { show: boolean }) {
  const [open, setOpen] = useState(false); const [i, setI] = useState(0);
  useEffect(() => { if (show) { const t = setTimeout(() => setOpen(true), 700); return () => clearTimeout(t); } }, [show]);
  if (!open) return null;
  const s = STEPS[i], last = i === STEPS.length - 1;
  const close = () => { setOpen(false); void fetch("/api/me/onboarded", { method: "POST" }).catch(() => null); };
  return createPortal(<div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="tour-t" dir="rtl">
    <div key={i} className="es-card-in w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-2xl">
      <div className="relative flex h-36 items-center justify-center overflow-hidden" style={{ background: `linear-gradient(140deg, ${s.color}33, ${s.color}0d)` }}>
        <span className="absolute -left-8 -top-8 h-32 w-32 rounded-full opacity-20" style={{ background: s.color }} /><span className="absolute -bottom-10 -right-6 h-28 w-28 rounded-full opacity-10" style={{ background: s.color }} />
        <span className="es-pop flex h-20 w-20 items-center justify-center rounded-3xl bg-white shadow-lg" style={{ color: s.color }}><Icon name={s.icon} size={40} /></span>
      </div>
      <div className="space-y-2 p-5">
        <h2 id="tour-t" className="text-xl font-extrabold text-[var(--navy)]">{s.title}</h2>
        <p className="text-[14px] leading-7 text-[var(--ink-soft)]">{s.text}</p>
        <p className="rounded-xl bg-[var(--bg)] px-3 py-2 text-[12px] font-bold text-[var(--navy)]">💡 {s.tip}</p>
        <div className="flex items-center justify-center gap-1.5 pt-2">{STEPS.map((_, k) => <span key={k} className={`h-2 rounded-full transition-all duration-300 ${k === i ? "w-6" : "w-2 bg-[var(--border)]"}`} style={k === i ? { background: s.color } : undefined} />)}</div>
        <div className="flex gap-2 pt-2">
          {!last && <button type="button" onClick={close} className="rounded-xl px-4 py-3 text-sm font-bold text-[var(--muted)]">تخطي</button>}
          {i > 0 && <button type="button" onClick={() => setI(i - 1)} className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-bold">السابق</button>}
          <button type="button" onClick={() => last ? close() : setI(i + 1)} className="flex-1 rounded-xl px-4 py-3 text-sm font-extrabold text-white shadow-md" style={{ background: s.color }}>{last ? "يلا نبدأ ✓" : "التالي"}</button>
        </div>
      </div>
    </div>
  </div>, document.body);
}
