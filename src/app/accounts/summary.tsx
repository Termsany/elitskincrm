"use client";
import type { AccData, Open, Tab } from "./AccountsHub";
import { sar, pct, C, Card, MonthChart } from "../daftra-sales/kit";

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/** % change against the previous period of the same length (null when there is nothing to compare). */
const change = (now: number, before: number | undefined | null) => before === undefined || before === null || before === 0 ? null : (now - before) / Math.abs(before) * 100;

export function Tile({ label, value, sub, tone, onClick, hint }: { label: string; value: string; sub?: React.ReactNode; tone?: "good" | "bad" | "warn"; onClick?: () => void; hint?: string }) {
  const El = onClick ? "button" : "div";
  return <El type={onClick ? "button" : undefined} onClick={onClick} title={hint} className={`group min-w-0 rounded-[22px] border border-[var(--border)] bg-[var(--card)] px-3.5 py-3.5 text-right sm:px-5 sm:py-4 transition ${onClick ? "hover:-translate-y-0.5 hover:border-[var(--sky-border)] hover:shadow-lg" : ""}`}>
    <div className="text-[13px] font-semibold text-[var(--muted)]">{label}</div>
    <div className={`mt-1 break-words text-[19px] font-extrabold leading-tight tabular-nums sm:text-[26px] ${tone === "bad" ? "text-red-700" : "text-[var(--ink)]"}`}>{value}</div>
    {sub && <div className={`mt-1 text-[12px] font-medium ${tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "text-[var(--muted)]"}`}>{sub}</div>}
  </El>;
}
export const Delta = ({ v, inverse = false }: { v: number | null; inverse?: boolean }) => v === null ? null
  : <span className={(v >= 0) !== inverse ? "text-emerald-700" : "text-red-700"}>{v >= 0 ? "▲" : "▼"} {Math.abs(Math.round(v))}%</span>;

const LV: Record<string, [string, string]> = { danger: ["bg-red-50", "bg-red-600"], warn: ["bg-amber-50", "bg-amber-500"], info: ["bg-[var(--sky-light)]", "bg-[var(--navy)]"] };

export function Summary({ d, go, open, pickMonth }: { d: AccData; go: (t: Tab) => void; open: Open; pickMonth: (m: string) => void }) {
  const k = d.kpi, p = d.prev;
  const week = addDays(d.today, 7);
  const apWeek = d.ap.open.filter(o => o.due <= week).reduce((s, o) => s + o.unpaid, 0);
  const costs = d.monthly.map(m => ({ ...m, costs: Number(m.cogs) + Number(m.opex) }));
  const att = d.attention || [];
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="صافي الربح" value={sar(k.net)} tone={k.net < 0 ? "bad" : undefined} onClick={() => go("pnl")}
        sub={<>هامش {pct(k.net_margin)}{change(k.net, p?.net) !== null && <> · <Delta v={change(k.net, p?.net)} /> عن الفترة اللي فاتت</>}</>} />
      <Tile label="ليك عند العملاء" value={sar(d.ar.total)} tone={undefined} onClick={() => go("clients")}
        sub={d.ar.overdue > 0 ? <span className="text-red-700">منها {sar(d.ar.overdue)} متأخر</span> : "مفيش متأخرات"} hint="شامل الضريبة، لحد النهارده — مش مرتبط بالفترة" />
      <Tile label="عليك للموردين" value={sar(d.ap.total)} onClick={() => go("suppliers")}
        sub={apWeek > 0 ? <span className="text-amber-700">منها {sar(apWeek)} مستحقة الأسبوع ده</span> : d.ap.total ? "مفيش مستحق الأسبوع ده" : "مفيش مستحقات"} />
      <Tile label="المصروفات" value={sar(k.opex)} onClick={() => go("expenses")}
        sub={<>{k.sales ? `${pct(k.opex / k.sales * 100)} من المبيعات` : "—"}{change(k.opex, p?.opex) !== null && <> · <Delta v={change(k.opex, p?.opex)} inverse /></>}</>} />
    </div>

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="المبيعات والتكاليف وصافي الربح شهر بشهر" hint="اضغط على أي شهر عشان تفتح أرقامه.">
        {costs.length < 3 && <div className="mb-2 rounded-xl bg-[var(--sky-light)] px-3 py-2 text-[11.5px] text-[var(--muted)]">اختار «آخر 3 شهور» أو أكتر من فوق عشان تشوف الاتجاه.</div>}
        <MonthChart data={costs} series={[{ key: "sales", label: "المبيعات", color: C.mint }, { key: "costs", label: "التكاليف", color: "#9aa8aa" }, { key: "net", label: "صافي الربح", color: C.green }]} onPick={pickMonth} height={190} />
      </Card>
      <Card title="محتاج انتباهك النهارده">
        {!att.length && <div className="rounded-xl bg-emerald-50 p-4 text-center text-sm font-bold text-emerald-800">كله تمام — مفيش حاجة عاجلة 👍</div>}
        <div className="space-y-2">{att.map((a, i) => { const [box, dot] = LV[a.level] || LV.info; return <div key={i} className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 ${box}`}>
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
          <div className="min-w-0 flex-1"><div className="text-[14px] font-bold text-[var(--ink)]">{a.title}</div><div className="text-[12px] text-[var(--muted)]">{a.text}</div></div>
          <button type="button" onClick={() => a.party && a.kind ? open(a.kind, a.party) : go(a.tab as Tab)} className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-bold text-[var(--navy)]">افتح ‹</button>
        </div>; })}</div>
      </Card>
    </div>

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Balances title="أكبر أرصدة العملاء" rows={d.ar.parties.slice(0, 6)} onPick={n => open("client", n)} more={() => go("clients")} />
      <Balances title="أكبر أرصدة الموردين" rows={d.ap.parties.slice(0, 6)} onPick={n => open("supplier", n)} more={() => go("suppliers")} />
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="صافي المبيعات" value={sar(k.sales)} sub={<>{k.invoices} فاتورة · {k.clients} عميل{change(k.sales, p?.sales) !== null && <> · <Delta v={change(k.sales, p?.sales)} /></>}</>} />
      <Tile label="مجمل الربح" value={sar(k.gross)} sub={`هامش ${pct(k.gross_margin)}`} />
      <Tile label="المحصّل من العملاء" value={sar(k.collected)} sub="الفلوس اللي دخلت فعلاً في الفترة" />
      <Tile label="ضريبة مستحقة (تقديري)" value={sar(k.vat_payable)} onClick={() => go("vat")} sub="ضريبة المبيعات ناقص المشتريات والمصروفات" />
    </div>
  </div>;
}

function Balances({ title, rows, onPick, more }: { title: string; rows: Array<{ name: string; unpaid: number; overdue: number; oldestDue: number }>; onPick: (n: string) => void; more: () => void }) {
  return <Card title={title} right={<button type="button" onClick={more} className="text-xs font-bold text-[var(--navy)] hover:underline">الكل ‹</button>}>
    {!rows.length ? <div className="py-4 text-center text-sm text-[var(--muted)]">مفيش أرصدة مفتوحة</div>
      : <div className="-mx-4 divide-y divide-[var(--border)]">{rows.map(r => <button key={r.name} type="button" onClick={() => onPick(r.name)} className="flex w-full items-center gap-3 px-4 py-2.5 text-right transition hover:bg-[var(--sky-light)]">
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{r.name}</span>
        {r.overdue > 0 && <span className="shrink-0 text-[12px] font-bold text-red-700">{r.oldestDue} يوم</span>}
        <span className="w-28 shrink-0 text-left text-sm font-extrabold tabular-nums">{sar(r.unpaid)}</span>
      </button>)}</div>}
  </Card>;
}
