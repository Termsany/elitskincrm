"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GlyphIcon, Icon } from "@/components/Icon";

type R = { kind: string; icon: string; title: string; sub: string; href: string };
const ACTIONS: R[] = [
  { kind: "action", icon: "⚡", title: "المناديب النهارده", sub: "مين شغال ومين متأخر", href: "/visits" },
  { kind: "action", icon: "🗓️", title: "خطة جديدة لمندوب", sub: "الخطط والاعتماد", href: "/plans" },
  { kind: "action", icon: "📋", title: "كل الزيارات", sub: "فلاتر وجودة وتنبيهات", href: "/visits?tab=visits" },
  { kind: "action", icon: "📊", title: "تقرير زيارات", sub: "PDF أو Excel", href: "/visits?tab=reports" },
  { kind: "action", icon: "📈", title: "تحليلات الزيارات", sub: "ترتيب المناديب والمنتجات", href: "/visits?tab=insights" },
  { kind: "action", icon: "🖋️", title: "طلبات التوقيع", sub: "مكتبة المستندات", href: "/library?view=signreq" },
  { kind: "action", icon: "⬆", title: "رفع مستند", sub: "مكتبة المستندات", href: "/library" },
  { kind: "action", icon: "💰", title: "المبيعات والأهداف", sub: "التوقع والمحقق", href: "/sales" },
  { kind: "action", icon: "🩺", title: "الأطباء والعيادات", sub: "التغطية والتحليلات", href: "/doctors" },
  { kind: "action", icon: "🧭", title: "مخطط العمل", sub: "تقويم الفريق", href: "/calendar" },
  { kind: "action", icon: "📑", title: "التقارير", sub: "كل تقارير النظام", href: "/admin/reports" },
  { kind: "action", icon: "👥", title: "المناديب", sub: "الحسابات والأهداف", href: "/admin/reps" },
];
const GROUP: Record<string, string> = { action: "اختصارات", doctor: "أطباء", rep: "مناديب", product: "منتجات", file: "ملفات" };

/** ⌘K / Ctrl+K anywhere: jump to any page, doctor, rep, product or document. */
export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const [res, setRes] = useState<R[]>([]); const [i, setI] = useState(0); const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null); const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(o => !o); } if (e.key === "Escape") setOpen(false); };
    const ev = () => setOpen(true);
    window.addEventListener("keydown", k); window.addEventListener("open-command-palette", ev);
    return () => { window.removeEventListener("keydown", k); window.removeEventListener("open-command-palette", ev); };
  }, []);
  useEffect(() => { if (open) { setQ(""); setRes([]); setI(0); setTimeout(() => input.current?.focus(), 30); } }, [open]);
  useEffect(() => {
    if (t.current) clearTimeout(t.current);
    if (q.trim().length < 2) { setRes([]); return; }
    t.current = setTimeout(async () => { setBusy(true); const j = await fetch(`/api/admin/search?q=${encodeURIComponent(q.trim())}`).then(r => r.json()).catch(() => null); setRes(j?.results || []); setBusy(false); setI(0); }, 180);
  }, [q]);
  const list = useMemo(() => { const s = q.trim().toLowerCase(); const acts = ACTIONS.filter(a => !s || `${a.title} ${a.sub}`.toLowerCase().includes(s)); return [...(s ? res : []), ...acts.slice(0, s ? 4 : 12)]; }, [q, res]);
  const go = (r?: R) => { if (!r) return; setOpen(false); router.push(r.href); };
  if (!open) return null;
  let last = "";
  return <div className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-950/40 p-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)} dir="rtl">
    <div onClick={e => e.stopPropagation()} className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5" style={{ animation: "cp-in .16s cubic-bezier(.2,.8,.2,1)" }}>
      <style>{`@keyframes cp-in{from{opacity:0;transform:translateY(-8px) scale(.98)}to{opacity:1;transform:none}}`}</style>
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-4">
        <span className="text-[var(--navy)]"><Icon name="search" size={22} /></span>
        <input ref={input} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "ArrowDown") { e.preventDefault(); setI(x => Math.min(list.length - 1, x + 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setI(x => Math.max(0, x - 1)); } if (e.key === "Enter") go(list[i]); }}
          placeholder="دوّر على طبيب، مندوب، منتج، ملف… أو اكتب اللي عايز تعمله" className="h-14 flex-1 !border-0 bg-transparent text-base !shadow-none !outline-none !ring-0" />
        {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--navy)] border-t-transparent" /> : <kbd className="rounded-md border border-[var(--border)] px-1.5 text-[10px] text-[var(--muted)]">Esc</kbd>}
      </div>
      <div className="max-h-[56vh] overflow-auto p-2">
        {list.map((r, k) => { const head = GROUP[r.kind] !== last ? (last = GROUP[r.kind]) : null; return <div key={`${r.kind}${r.href}${k}`}>
          {head && <div className="px-3 pb-1 pt-2 text-[11px] font-bold text-[var(--muted)]">{head}</div>}
          <button onMouseEnter={() => setI(k)} onClick={() => go(r)} className={`relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-right transition ${i === k ? "bg-[var(--sky-soft)]" : ""}`}>
            <GlyphIcon g={r.icon} chip size={19} box={38} className={i === k ? "es-chip-on" : ""} />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-[var(--navy)]" dir="auto">{r.title}</span><span className="block truncate text-[11px] text-[var(--muted)]">{r.sub}</span></span>
            {i === k && <><kbd className="rounded-md border border-[var(--border)] bg-white px-1.5 text-[10px] text-[var(--muted)]">Enter</kbd><span className="absolute inset-y-2.5 right-0 w-[3px] rounded-full bg-[var(--sky)]" /></>}
          </button>
        </div>; })}
        {q.trim().length >= 2 && !busy && !res.length && <div className="px-3 py-2 text-xs text-[var(--muted)]">مفيش نتايج لـ «{q}» — جرّب اسم تاني</div>}
      </div>
      <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-[10px] text-[var(--muted)]"><span>↑↓ للتنقل · ↵ للفتح</span><span>⌘K / Ctrl+K من أي صفحة</span></div>
    </div>
  </div>;
}

/** Sidebar trigger (desktop) — the palette itself is mounted once in AppShell. */
export function PaletteButton() {
  return <button type="button" onClick={() => window.dispatchEvent(new Event("open-command-palette"))} data-tip="بحث سريع (Ctrl K)" className="es-search flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.07] px-3.5 py-2.5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white">
    <Icon name="search" size={18} className="shrink-0" /><span className="es-hide flex-1 text-right">بحث سريع</span><kbd className="es-hide rounded-md bg-white/10 px-1.5 text-[10px]" dir="ltr">Ctrl K</kbd>
  </button>;
}
