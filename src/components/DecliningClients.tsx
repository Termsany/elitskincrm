import Link from "next/link";
import type { Decline } from "@/lib/clinic-account";

const sar = (n: number) => `${Math.round(n).toLocaleString("en-US")} ر.س`;

/** Customers (from Daftra) that stopped ordering or are buying less — a sales lead, not a chart. */
export default function DecliningClients({ rows, showRep = false }: { rows: Decline[]; showRep?: boolean }) {
  if (!rows.length) return null;
  return <section className="mt-6 space-y-2" aria-labelledby="dec-h">
    <h2 id="dec-h" className="text-lg font-extrabold text-[var(--navy)]">عيادات بتقلّ ({rows.length})</h2>
    <p className="text-xs text-[var(--muted)]">من فواتير دفترة: عيادة ما طلبتش بقالها مدة أطول من عادتها (45 يوم على الأقل)، أو مشترياتها آخر 3 شهور أقل 30% من اللي قبلها. دي أسرع فرصة مبيعات — زورها واعرف السبب.</p>
    {rows.map(r => <div key={r.client_id} className="flex flex-col gap-2 rounded-2xl border border-[var(--border)] bg-white p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><b className="truncate text-[var(--navy)]" dir="auto">{r.clinic_name || r.name}</b>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${r.status === "stopped" ? "bg-red-50 text-red-700 ring-red-200" : "bg-amber-50 text-amber-800 ring-amber-200"}`}>{r.status === "stopped" ? "بطّلت تطلب" : `نزلت ${Math.abs(r.change ?? 0)}%`}</span>
          {showRep && <span className="text-[11px] text-[var(--muted)]">{r.rep_name || "بدون مندوب"}</span>}</div>
        <div className="mt-1 text-[12.5px] leading-6 text-[var(--ink-soft)]">{r.status === "stopped"
          ? <>آخر طلب من <b>{r.days_since} يوم</b>{r.usual_gap ? ` (عادتها كل ${r.usual_gap} يوم)` : ""}.</>
          : <>آخر 3 شهور {sar(r.last90)} مقابل {sar(r.prev90)} قبلها.</>} متوسطها {sar(r.monthly_avg)} في الشهر{r.top.length ? ` · بتاخد: ${r.top.join("، ")}` : ""}</div>
      </div>
      {r.doctor_id ? <Link href={`/doctors/${r.doctor_id}`} className="shrink-0 rounded-xl bg-[var(--navy)] px-3 py-2 text-center text-xs font-bold text-white">افتح ملف العيادة</Link>
        : <span className="shrink-0 text-[11px] text-[var(--muted)]">مفيش طبيب مربوط بالعيادة</span>}
    </div>)}
  </section>;
}
