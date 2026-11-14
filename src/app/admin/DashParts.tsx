"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { useUndo } from "@/components/UndoToast";
import { healthScore, startActions, toneOf, type Action, type ActionIn, type HealthIn } from "@/lib/dash-health";

const STYLE = `
@keyframes dp-draw{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}
@keyframes dp-pulse{0%,100%{box-shadow:0 0 0 0 var(--c)}50%{box-shadow:0 0 0 8px transparent}}
@keyframes dp-pop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
@keyframes dp-spark{0%{transform:scale(0) translate(0,0);opacity:1}100%{transform:scale(1) translate(var(--x),var(--y));opacity:0}}
.dp-spark-line{stroke-dasharray:100;animation:dp-draw 1.2s ease both}
.dp-cta{transition:transform .2s cubic-bezier(.2,.8,.2,1),box-shadow .2s}.dp-cta:hover{transform:translateY(-2px)}.dp-cta:active{transform:scale(.96)}
.dp-first{animation:dp-pulse 2.2s ease-in-out infinite}
.dp-fab-item{animation:dp-pop .35s cubic-bezier(.2,.8,.2,1) both}
@media (prefers-reduced-motion:reduce){.dp-spark-line,.dp-first,.dp-fab-item{animation:none}.dp-cta{transition:none}}
`;


/** Sparkline that fills the tile bottom; the line draws itself in. Newest value on the left (RTL reading order). */
export function Spark({ data, color, h = 44 }: { data: number[]; color: string; h?: number }) {
  if (data.length < 2) return <div style={{ height: h }} />;
  const max = Math.max(...data), min = Math.min(...data), span = max - min || 1;
  const pts = data.map((v, i) => [100 - i / (data.length - 1) * 100, 6 + (1 - (v - min) / span) * (h - 12)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const id = `sp${color.slice(1)}${data.length}`;
  return <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: h }} aria-hidden>
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
    <path d={`${line} L${pts[data.length - 1][0]},${h} L${pts[0][0]},${h} Z`} fill={`url(#${id})`} />
    <path d={line} pathLength={100} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="dp-spark-line" />
  </svg>;
}

/** "صحة الشغل": one gauge + four colored, clickable sub-scores. */
export function HealthHero({ h }: { h: HealthIn }) {
  const r = healthScore(h); const n = r.score ?? 0;
  const R = 70, C = 2 * Math.PI * R, pct = (r.score ?? 0) / 100;
  const anchor: Record<string, string> = { sales: "#dash-money", visits: "#dash-visits", collect: "#dash-money", quality: "#dash-visits" };
  return <section className="relative overflow-hidden rounded-[28px] bg-[var(--navy)] p-5 text-white sm:p-7" aria-label="صحة الشغل">
    <style>{STYLE}</style>
    <div className="relative flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
      <div className="relative h-[170px] w-[170px] shrink-0">
        <svg viewBox="0 0 170 170" className="-rotate-90"><defs><linearGradient id="dp-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5cc3b8" /><stop offset="1" stopColor="#5cc3b8" /></linearGradient></defs>
          <circle cx="85" cy="85" r={R} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="14" />
          <circle cx="85" cy="85" r={R} fill="none" stroke="url(#dp-g)" strokeWidth="14" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} style={{ transition: "stroke-dashoffset .25s ease-out" }} /></svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none"><span className="text-5xl font-extrabold tabular-nums">{r.score === null ? "—" : n}</span><span className="mt-1 text-[11px] text-white/70">من 100</span></div>
      </div>
      <div className="min-w-0 flex-1 text-center sm:text-right">
        <div className="text-xs font-bold text-[#8fe3d6]">صحة الشغل</div>
        <h2 className="mt-1 text-2xl font-extrabold sm:text-3xl">{r.headline}</h2>
        <p className="mt-1 text-sm text-white/75">{r.note}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">{r.chips.map(c => { const col = toneOf(c.score); return <a key={c.key} href={anchor[c.key]} className="dp-cta rounded-2xl border border-white/10 bg-white/[.07] p-3 text-right backdrop-blur hover:bg-white/[.12]">
          <div className="flex items-center gap-1.5 text-[11px] text-white/70"><i className="h-2 w-2 rounded-full" style={{ background: col }} />{c.label}</div>
          <div className="mt-1 text-xl font-extrabold tabular-nums">{c.value}%</div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full transition-all duration-200" style={{ width: `${c.value}%`, background: col }} /></div>
        </a>; })}</div>
      </div>
    </div>
  </section>;
}

const TONE = {
  red: { bg: "from-white to-white", ring: "border-[var(--border)]", bar: "#c25550", chip: "bg-red-50 text-red-700", btn: "bg-[var(--navy)]", icon: "wallet" },
  amber: { bg: "from-white to-white", ring: "border-[var(--border)]", bar: "#d39a3c", chip: "bg-amber-50 text-amber-800", btn: "bg-[var(--navy)]", icon: "plans" },
  blue: { bg: "from-white to-white", ring: "border-[var(--border)]", bar: "#5b9bd5", chip: "bg-sky-50 text-sky-700", btn: "bg-[var(--navy)]", icon: "check" },
} as const;

/** "ابدأ من هنا": the top actions (real data), each with one big colored button. */
export function StartHere({ input, today, onDone }: { input: ActionIn; today: string; onDone: () => void }) {
  const toast = useToast(); const undo = useUndo();
  const [snoozed, setSnoozed] = useState<string[]>([]); const [busy, setBusy] = useState(""); const [burst, setBurst] = useState("");
  useEffect(() => { fetch("/api/me/dash-snooze", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => j && setSnoozed(j.ids || [])).catch(() => {}); }, [today]);
  const all = startActions(input); const list = all.filter(a => !snoozed.includes(a.id));
  const save = (ids: string[]) => { setSnoozed(ids); void fetch("/api/me/dash-snooze", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) }).catch(() => {}); };
  const snooze = (id: string) => { const prev = snoozed; save([...snoozed, id]); undo({ text: "اتأجلت للنهارده", undo: () => save(prev) }); };
  async function run(a: Action) {
    if (a.run !== "autoplan") return;
    setBusy(a.id);
    const r = await fetch("/api/plans/auto", { method: "POST" }); const j = await r.json().catch(() => null); setBusy("");
    if (!r.ok) { toast(j?.error || "تعذر تجهيز الخطط", "error"); return; }
    setBurst(a.id); setTimeout(() => setBurst(""), 1200);
    toast(j.created.length ? `اتعمل ${j.created.length} مسودة وبعتناها للمناديب` : `مفيش مسودات جديدة: ${j.skipped.map((s: { rep: string; why: string }) => `${s.rep.split(" ")[0]}: ${s.why}`).join(" · ")}`, j.created.length ? "success" : "info");
    onDone();
  }
  if (!list.length) return <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 ring-1 ring-emerald-200"><Icon name="sparkle" size={18} />{all.length ? "أجّلت كل المقترحات النهارده" : "مفيش حاجة مستنياك — كل حاجة ماشية"}{all.length > 0 && <button type="button" className="mr-auto text-xs underline" onClick={() => save([])}>رجّعهم</button>}</div>;
  return <section aria-label="ابدأ من هنا">
    <div className="mb-2 flex items-end justify-between"><div><h2 className="text-lg font-extrabold text-[var(--navy)]">ابدأ من هنا</h2><p className="text-[11px] text-[var(--muted)]">أهم {list.length === 1 ? "حاجة" : `${list.length} حاجات`} تحرّك الشغل دلوقتي</p></div>{snoozed.length > 0 && <span className="rounded-full bg-[var(--bg)] px-2.5 py-1 text-[11px] font-bold text-[var(--muted)]">{snoozed.length} اتأجلوا</span>}</div>
    <div className={`grid gap-3 ${list.length >= 3 ? "lg:grid-cols-3" : list.length === 2 ? "sm:grid-cols-2" : ""}`}>{list.map((a, i) => { const t = TONE[a.tone]; const body = <>{a.cta}<span aria-hidden>‹</span></>; const cls = `dp-cta ${i === 0 ? "dp-first" : ""} flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-extrabold text-white ${t.btn}`;
      return <div key={a.id} className={`relative overflow-hidden rounded-[24px] border bg-white ${t.ring} p-4 transition-colors duration-200 hover:border-[var(--sky-border)]`} style={{ "--c": `${t.bar}66` } as React.CSSProperties}>
        <span className="absolute inset-y-4 right-0 w-1 rounded-l-full" style={{ background: t.bar }} />
        <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--sky-light)]" style={{ color: t.bar }}><Icon name={a.icon} size={22} /></span>
          <div className="min-w-0 flex-1"><div className="text-[15px] font-extrabold leading-6 text-[var(--navy)]">{a.title}</div><div className="mt-0.5 text-[12px] leading-5 text-[var(--muted)]">{a.sub}</div></div></div>
        <div className="mt-4 flex items-center gap-2">
          {a.run ? <button type="button" disabled={busy === a.id} onClick={() => void run(a)} className={`${cls} disabled:opacity-60`}>{busy === a.id ? "جاري التجهيز…" : body}</button>
            : <Link href={a.href || "/"} className={cls}>{body}</Link>}
          <button type="button" onClick={() => snooze(a.id)} className="h-12 rounded-2xl border border-[var(--border)] bg-white px-3 text-xs font-bold text-[var(--muted)] transition hover:text-[var(--navy)]">بعدين</button>
        </div>
        {burst === a.id && <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>{[...Array(10)].map((_, j) => <i key={j} className="absolute h-2 w-2 rounded-full" style={{ background: ["#1aa865", "#e9a23b", "#3b82f6", "#d64545", "#8b5cf6"][j % 5], ["--x" as string]: `${Math.cos(j * 0.63) * 90}px`, ["--y" as string]: `${Math.sin(j * 0.63) * 60}px`, animation: "dp-spark .9s ease-out forwards" }} />)}</div>}
      </div>; })}</div>
  </section>;
}

/** Floating "+" with four colored shortcuts (portal: the page wrapper animates with a transform, which breaks fixed children). */
export function QuickFab({ mgr = false, rep = false }: { mgr?: boolean; rep?: boolean }) {
  const [open, setOpen] = useState(false); const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  const items: Array<[string, string, string, string]> = rep
    ? [["/visits/new", "تسجيل زيارة", "#33b3a6", "visits"], ["/plans", "خطتي", "#e9a23b", "plans"], ["/work", "مهامي", "#3b82f6", "check"], ["/my/office-time", "وقت مكتبي", "#c9a24a", "clock"], ["/requests", "طلب جديد", "#8b5cf6", "send"]]
    : mgr
    ? [["/plans", "خطة", "#e9a23b", "plans"], ["/tasks", "مهمة", "#3b82f6", "check"], ["/admin/reports", "تقرير", "#1aa865", "reports"], ["/doctors", "الأطباء", "#8b5cf6", "doctors"]]
    : [["/plans", "خطة", "#e9a23b", "plans"], ["/tasks", "مهمة", "#3b82f6", "check"], ["/library?view=signreq", "توقيع", "#8b5cf6", "signature"], ["/admin/reports", "تقرير", "#1aa865", "reports"]];
  return createPortal(<div dir="rtl" className="es-quickfab fixed bottom-24 left-4 z-[55] flex flex-col-reverse items-start gap-2 lg:bottom-6">
    <button type="button" aria-label="إجراءات سريعة" aria-expanded={open} onClick={() => setOpen(o => !o)} className="dp-cta flex h-14 w-14 items-center justify-center rounded-full bg-[var(--navy)] text-3xl font-light leading-none text-white shadow-[0_14px_30px_-10px_rgba(11,42,74,.7)]"><span style={{ transform: open ? "rotate(45deg)" : "none", transition: "transform .25s" }}>＋</span></button>
    {open && items.map(([href, label, c, ic], i) => <Link key={href} href={href} onClick={() => setOpen(false)} className="dp-fab-item flex items-center gap-2 rounded-full bg-white py-1.5 pl-4 pr-1.5 text-sm font-bold text-[var(--navy)] shadow-lg ring-1 ring-black/5" style={{ animationDelay: `${i * 50}ms` }}><span className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ background: c }}><Icon name={ic} size={18} /></span>{label}</Link>)}
  </div>, document.body);
}

/** Colored KPI tile: tinted gradient, icon bubble, big number, optional chip, sparkline fills the bottom. */
export function KpiTile({ href, color, label, icon, value, sub, chip, spark, delay, live, onOpen }: { href: string; color: string; tint: string; label: string; icon: string; value: React.ReactNode; sub?: string; chip?: { text: string; tone: "green" | "red" }; spark?: React.ReactNode; delay: number; onOpen?: () => void; live?: boolean }) {
  const cls = "dz-card dz-in group relative flex flex-col overflow-hidden rounded-[24px] border border-[var(--border)] bg-white p-4 text-right sm:p-5";
  const inner = <>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0"><div className="text-xs font-bold text-[var(--muted)]">{label}</div><div className="mt-2 flex items-end gap-0.5">{value}</div></div>
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--sky-light)]" style={{ color }}><Icon name={icon} size={20} />{live && <span className="absolute -left-1 -top-1 h-3 w-3 animate-ping rounded-full opacity-70" style={{ background: color }} />}</span>
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--muted)]">{chip && <span className={`rounded-full px-2 py-0.5 font-bold ${chip.tone === "green" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{chip.text}</span>}{sub && <span>{sub}</span>}</div>
    <div className="mt-auto pt-2">{spark}</div></>;
  return onOpen ? <button type="button" onClick={onOpen} className={cls} style={{ "--d": `${delay}ms` } as React.CSSProperties}>{inner}</button>
    : <Link href={href} className={cls} style={{ "--d": `${delay}ms` } as React.CSSProperties}>{inner}</Link>;
}
