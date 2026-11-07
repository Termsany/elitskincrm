import Link from "next/link";
import type { Account } from "@/lib/clinic-account";

const sar = (n: number | null | undefined) => n === null || n === undefined ? "—" : `${Math.round(n).toLocaleString("en-US")} ر.س`;
const day = (d: string | null) => d ? new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`)) : "—";
const STATUS: Record<string, [string, string]> = {
  stopped: ["بطّلت تطلب", "bg-red-50 text-red-700 ring-red-200"], declining: ["مشترياتها بتقل", "bg-amber-50 text-amber-800 ring-amber-200"],
  ok: ["منتظمة", "bg-emerald-50 text-emerald-700 ring-emerald-200"], none: ["لسه ما طلبتش", "bg-slate-100 text-slate-600 ring-slate-200"],
};

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "bad" | "good" }) {
  return <div className="rounded-xl bg-[var(--bg)] p-3"><div className="text-[11px] text-[var(--muted)]">{label}</div>
    <div className={`mt-0.5 text-base font-extrabold ${tone === "bad" ? "text-red-700" : tone === "good" ? "text-emerald-700" : "text-[var(--navy)]"}`}>{value}</div>{sub && <div className="text-[10.5px] text-[var(--muted)]">{sub}</div>}</div>;
}

/** Clinic account from Daftra on the doctor page: balance first (so the rep asks before selling), then the buying pattern. */
export default function ClinicAccountCard({ clinic, account, isAdmin }: { clinic: { id: string; name: string } | null; account: (Account & { customers: string[] }) | null; isAdmin: boolean }) {
  if (!account) return isAdmin ? <section className="mx-auto mt-5 max-w-6xl rounded-2xl border border-dashed border-[var(--border-strong)] bg-white p-4 text-sm text-[var(--muted)]" dir="rtl">
    {clinic ? <>عيادة «{clinic.name}» مش مربوطة بعميل في دفترة، فمش ظاهر هنا مشترياتها ولا رصيدها. </> : <>الطبيب ده مش مربوط بعيادة. </>}
    <Link href="/daftra-sales?tab=ar" className="font-bold text-[var(--sky-deep)] hover:underline">اربط العملاء من صفحة دفترة ‹</Link></section> : null;
  const a = account, b = a.balance, o = a.orders, s = a.sales, [sl, sc] = STATUS[a.status];
  return <section className="mx-auto mt-5 max-w-6xl space-y-3 rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-5" dir="rtl" aria-labelledby="clinic-acc">
    <div className="flex flex-wrap items-center gap-2">
      <h2 id="clinic-acc" className="text-lg font-extrabold text-[var(--navy)]">حساب العيادة{clinic ? ` · ${clinic.name}` : ""}</h2>
      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${sc}`}>{sl}</span>
      <span className="mr-auto text-[11px] text-[var(--muted)]">من دفترة · {a.customers.join("، ")}</span>
    </div>

    {b.overdue > 0 ? <div className="rounded-xl bg-red-50 p-3 text-[13px] leading-6 text-red-900 ring-1 ring-red-200"><b>قبل ما تعرض طلب جديد:</b> العيادة عليها <b>{sar(b.overdue)}</b> متأخرة{b.oldest && b.oldest > 0 ? ` من ${b.oldest} يوم` : ""} (إجمالي المستحق {sar(b.unpaid)}). اسأل عن ميعاد السداد وسجّله في متابعة التحصيل.</div>
      : b.unpaid > 0 ? <div className="rounded-xl bg-sky-50 p-3 text-[13px] text-sky-900 ring-1 ring-sky-200">عليها {sar(b.unpaid)} لسه ما جاش ميعادها — مفيش متأخرات.</div>
      : <div className="rounded-xl bg-emerald-50 p-3 text-[13px] text-emerald-900 ring-1 ring-emerald-200">مفيش عليها أي مستحقات ✓</div>}

    {a.status === "stopped" && <div className="rounded-xl bg-amber-50 p-3 text-[13px] leading-6 text-amber-900 ring-1 ring-amber-200">آخر طلب كان من <b>{o.days_since} يوم</b>{o.usual_gap ? ` وهي عادةً بتطلب كل ${o.usual_gap} يوم` : ""}. اسأل: خلص المخزون عندهم؟ في منافس؟ في مشكلة في منتج أو سعر؟</div>}
    {a.status === "declining" && <div className="rounded-xl bg-amber-50 p-3 text-[13px] leading-6 text-amber-900 ring-1 ring-amber-200">مشترياتها آخر 3 شهور <b>{sar(s.last90)}</b> مقابل {sar(s.prev90)} في الـ 3 شهور اللي قبلها ({s.change}%). اعرف السبب قبل ما تكمل.</div>}

    <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
      <Stat label="آخر طلب" value={day(o.last)} sub={o.days_since !== null ? `من ${o.days_since} يوم` : undefined} tone={a.status === "stopped" ? "bad" : undefined} />
      <Stat label="بتطلب كل" value={o.usual_gap ? `${o.usual_gap} يوم` : "—"} sub={o.next_expected ? `الطلب الجاي المتوقع ${day(o.next_expected)}` : `${o.count} طلب`} />
      <Stat label="آخر 3 شهور" value={sar(s.last90)} sub={s.change !== null ? `${s.change > 0 ? "+" : ""}${s.change}% عن اللي قبلها` : undefined} tone={s.change !== null ? (s.change < -30 ? "bad" : s.change > 0 ? "good" : undefined) : undefined} />
      <Stat label="متوسط الشهر" value={sar(s.monthly_avg)} sub="آخر 12 شهر، قبل الضريبة" />
      <Stat label="المستحق عليها" value={sar(b.unpaid)} sub={b.open_count ? `${b.open_count} فاتورة مفتوحة` : undefined} tone={b.overdue > 0 ? "bad" : undefined} />
    </div>

    {a.products.length > 0 && <div><h3 className="mb-1.5 text-sm font-extrabold text-[var(--navy)]">بتشتري إيه (آخر 12 شهر)</h3>
      <div className="-mx-4 overflow-x-auto px-4"><table className="w-full min-w-[480px] text-sm">
        <thead className="bg-[var(--bg)] text-xs text-[var(--muted)]"><tr><th className="p-2 text-right">المنتج</th><th className="p-2">الكمية</th><th className="p-2">عدد الطلبات</th><th className="p-2">آخر مرة</th><th className="p-2">القيمة</th></tr></thead>
        <tbody className="divide-y divide-[var(--border)]">{a.products.map(p => <tr key={p.item}><td className="max-w-56 truncate p-2 font-bold" dir="auto">{p.item}</td><td className="p-2 text-center">{p.qty.toLocaleString("en-US")}</td><td className="p-2 text-center">{p.orders}</td><td className="p-2 text-center text-xs">{day(p.last)}</td><td className="p-2 text-center">{sar(p.net)}</td></tr>)}</tbody>
      </table></div></div>}

    {b.open.length > 0 && <details className="rounded-xl bg-[var(--bg)] p-3 text-sm"><summary className="cursor-pointer font-bold text-[var(--navy)]">الفواتير المفتوحة ({b.open_count})</summary>
      <ul className="mt-2 space-y-1 text-xs">{b.open.map(i => <li key={i.id} className="flex flex-wrap justify-between gap-2"><span>فاتورة {i.no} · {day(i.date)} · استحقاق {day(i.due)}</span><b className={i.days > 0 ? "text-red-700" : ""}>{sar(i.unpaid)}{i.days > 0 ? ` · متأخرة ${i.days} يوم` : ""}</b></li>)}</ul></details>}
  </section>;
}
