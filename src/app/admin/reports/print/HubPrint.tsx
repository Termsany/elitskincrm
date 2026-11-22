import { query } from "@/lib/db";
import { riyadhToday } from "@/lib/riyadh-day";
import { parseHub, reportHub, VIEWS, type HubData, type View } from "@/lib/report-hub";
import { MarketView, RepsView, SummaryView } from "../HubViews";
import AutoPrint from "./AutoPrint";

const TITLE: Partial<Record<View, string>> = { summary: "التقرير الشامل", reps: "المناديب", market: "السوق والعملاء" };
const fmtDate = (d: string) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

export default async function HubPrint({ sp, manager }: { sp: URLSearchParams; manager: boolean }) {
  const today = riyadhToday(), f = parseHub(sp, today);
  const view = (VIEWS.includes(sp.get("view") as View) ? sp.get("view") : "summary") as View;
  const views = view === "summary" ? VIEWS : [view];
  const data = Object.fromEntries(await Promise.all(views.map(async v => [v, await reportHub(v, f, today, manager).catch(() => null)] as const))) as Partial<HubData>;
  const rep = f.repId ? (await query<{ name: string }>("SELECT name FROM users WHERE id=$1", [f.repId])).rows[0]?.name : "";
  const filters = [`${fmtDate(f.from)} — ${fmtDate(f.to)}`, rep, f.city].filter(Boolean).join(" · ");
  const body = (v: View) => {
    const d = data[v]; if (!d) return <p className="text-sm text-[var(--muted)]">تعذر تحميل الجزء ده</p>;
    switch (v) {
      case "summary": return <SummaryView d={d as HubData["summary"]} print />;
      case "reps": return <RepsView d={d as HubData["reps"]} print />;
      case "market": return <MarketView d={d as HubData["market"]} print />;
      default: return null;
    }
  };
  return (
    <div dir="rtl" className="report-print mx-auto max-w-[1000px] bg-white px-6 py-6 text-[var(--ink)]">
      <style>{`
        @page{size:A4;margin:12mm 10mm}
        html,body{background:#fff!important}
        .report-print{-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:13px;line-height:1.55}
        .report-print section{box-shadow:none!important;border-color:#e3ecec}
        .report-print table{font-size:11.5px}
        .report-print thead th{background:#f3f8f8}
        .report-print tbody tr:nth-child(even) td{background:#fafcfc}
        .page{break-before:page}
        @media print{.no-print{display:none!important}.report-print{padding:0;max-width:none}section{break-inside:avoid-page}tr{break-inside:avoid}}
      `}</style>
      <AutoPrint />
      <header className="mb-5 flex items-end justify-between gap-4 border-b-2 border-[var(--navy)] pb-3">
        <div><div className="text-[12px] font-bold tracking-wide text-teal-700">eliteSkin</div><h1 className="text-[24px] font-black text-[var(--navy)]">{TITLE[view] || "التقرير"}</h1><div className="text-[12.5px] text-[var(--muted)]">{filters}</div></div>
        <div className="text-left text-[11px] text-[var(--muted)]">اتعمل {fmtDate(today)}<br />مقارنة بالفترة اللي قبلها بنفس الطول</div>
      </header>
      {views.map((v, i) => <div key={v} className={i ? "page pt-2" : ""}>
        {view === "summary" && <h2 className="mb-3 mt-1 flex items-center gap-2 text-[18px] font-extrabold text-[var(--navy)]"><span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--navy)] text-[12px] text-white">{i + 1}</span>{v === "summary" ? "الملخص والقرارات" : TITLE[v]}</h2>}
        {body(v)}
      </div>)}
      <footer className="mt-6 border-t border-[var(--border)] pt-2 text-center text-[10.5px] text-[var(--muted)]">المبالغ بالريال قبل الضريبة · eliteSkin CRM</footer>
    </div>
  );
}
