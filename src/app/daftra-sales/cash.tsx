"use client";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import type { cashForecast } from "@/lib/fin-cash";
import type { Tab } from "./FinanceHub";
import { sar, short, C, Hint, Kpi, Card, Table } from "./kit";

type F = ReturnType<typeof cashForecast>;
type Data = { today: string; cash_balance: number | null; cash_as_of: string | null; vat_period: number; forecast: F };
const dm = (d: string) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;

function WeekChart({ rows, opening }: { rows: F["rows"]; opening: number }) {
  const [h, setH] = useState<number | null>(null);
  const vals = [opening, ...rows.map(r => r.balance)], max = Math.max(1, ...vals), min = Math.min(0, ...vals), span = max - min || 1, zero = max / span * 100;
  return <div>
    <div className="mb-1 h-5 text-xs text-[var(--muted)]">{h !== null ? <span>أسبوع {dm(rows[h].from)}–{dm(rows[h].to)} · داخل <b className="text-emerald-700">{sar(rows[h].in_ar + rows[h].in_new)}</b> · خارج <b className="text-red-700">{sar(rows[h].out_ap + rows[h].out_fixed + rows[h].out_var)}</b> · الرصيد <b className="text-[var(--navy)]">{sar(rows[h].balance)}</b></span> : "مرّر على أي أسبوع — العمود = الرصيد المتوقع آخر الأسبوع"}</div>
    <div className="relative flex items-stretch gap-1" style={{ height: 170 }}>
      <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[var(--border-strong)]" style={{ top: `${zero}%` }} />
      {rows.map((r, i) => { const v = r.balance, hg = Math.abs(v) / span * 100; return <div key={r.i} onMouseEnter={() => setH(i)} onMouseLeave={() => setH(null)} className={`relative flex-1 rounded-lg ${h === i ? "bg-[var(--sky-light)]" : ""}`}>
        <div className={`absolute inset-x-1 ${v >= 0 ? "rounded-t" : "rounded-b"} transition-all duration-700`} style={{ height: `${hg}%`, background: v < 0 ? C.red : v < opening * 0.25 ? C.amber : C.teal, ...(v >= 0 ? { bottom: `${100 - zero}%` } : { top: `${zero}%` }) }} />
      </div>; })}
    </div>
    <div className="mt-1 flex gap-1">{rows.map(r => <span key={r.i} className="min-w-0 flex-1 truncate text-center text-[9.5px] text-[var(--muted)]">{dm(r.from)}</span>)}</div>
  </div>;
}

export function CashTab({ go }: { go: (t: Tab) => void }) {
  const toast = useToast();
  const [d, setD] = useState<Data | null>(null);
  const [inc, setInc] = useState(false);
  const [bal, setBal] = useState("");
  const load = useCallback(async () => {
    const j = await fetch(`/api/admin/finance/cash${inc ? "?new=1" : ""}`).then(r => r.json()).catch(() => null);
    if (j?.forecast) { setD(j); setBal(j.cash_balance === null ? "" : String(j.cash_balance)); } else toast(j?.error || "تعذر تحميل السيولة", "error");
  }, [inc, toast]);
  useEffect(() => { void load(); }, [load]);
  async function saveBal() {
    const r = await fetch("/api/admin/finance/cash", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ cash_balance: Number(bal.replace(/,/g, "")) }) });
    const j = await r.json().catch(() => null);
    if (!r.ok) toast(j?.error || "تعذر الحفظ", "error"); else { toast("اتحفظ الرصيد", "success"); await load(); }
  }
  if (!d) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;
  const f = d.forecast, a = f.assumptions, neg = f.first_negative_week;
  const stale = d.cash_as_of && (Date.parse(d.today) - Date.parse(d.cash_as_of)) / 864e5 > 7;
  return <div className="space-y-4">
    <Card title="رصيدك النهارده (بنك + خزنة)" hint="دفترة مش بتبعت أرصدة البنك، فاكتب رصيدك الفعلي النهارده (كل الحسابات البنكية + الخزنة) وأنا أحسب منه السيولة للـ 13 أسبوع الجايين. حدّثه كل أسبوع.">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-48 flex-1"><span className="text-xs text-[var(--muted)]">الرصيد بالريال</span><input value={bal} onChange={e => setBal(e.target.value)} inputMode="decimal" placeholder="مثلاً 250000" dir="ltr" className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-bold" /></label>
        <button type="button" onClick={() => void saveBal()} disabled={!bal || Number(bal.replace(/,/g, "")) === d.cash_balance} className="rounded-xl bg-[var(--navy)] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">احفظ الرصيد</button>
        <span className="text-[11px] text-[var(--muted)]">{d.cash_as_of ? `آخر تحديث ${d.cash_as_of}` : "لسه ما اتسجلش رصيد — الحساب دلوقتي بيبدأ من صفر"}</span>
      </div>
      {stale && <p className="mt-2 rounded-xl bg-amber-50 p-2 text-[11.5px] text-amber-900 ring-1 ring-amber-200">الرصيد ده عمره أكتر من أسبوع — حدّثه عشان التوقع يبقى دقيق.</p>}
    </Card>

    {neg !== null ? <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-[12.5px] leading-6 text-red-900"><span className="text-red-600"><Icon name="flag" size={20} /></span><div><b className="block text-sm">تحذير: الفلوس هتخلص في أسبوع {dm(f.rows[neg].from)}</b>
      الرصيد المتوقع يوصل {sar(f.lowest.balance)}. الحلول بالترتيب: حصّل المديونيات المتأخرة الأول (<button type="button" onClick={() => go("ar")} className="font-bold underline">ليا عند العملاء</button>)، أجّل دفعات الموردين اللي تقدر تتفاوض عليها، وأجّل أي مصروف مش ضروري.</div></div>
      : <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-[12.5px] leading-6 text-emerald-950"><span className="text-emerald-700"><Icon name="check" size={20} /></span><div><b className="block text-sm">السيولة مغطية الـ 13 أسبوع الجايين</b>أقل رصيد متوقع {sar(f.lowest.balance)}{f.lowest.week >= 0 ? ` في أسبوع ${dm(f.rows[f.lowest.week].from)}` : ""}. خلّي دايماً احتياطي يغطي شهر مصاريف على الأقل ({sar(a.fixed_monthly + a.variable_monthly)}).</div></div>}

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="الرصيد النهارده" value={sar(f.opening)} icon="wallet" color={C.teal} />
      <Kpi label="داخل متوقع (13 أسبوع)" value={sar(f.total_in)} sub="تحصيل الفواتير المفتوحة" icon="time" color={C.green} hint="الفواتير اللي لسه ما استحقتش محسوبة 95%، والمتأخرة بنسبة أقل كل ما التأخير يزيد (80% لحد شهر، 60% لحد شهرين، 40% لحد 3 شهور، 20% بعد كده) وموزعة على 4 أسابيع." />
      <Kpi label="خارج متوقع (13 أسبوع)" value={sar(f.total_out)} sub="موردين + مصاريف" icon="send" color={C.red} />
      <Kpi label="الرصيد بعد 13 أسبوع" value={sar(f.closing)} icon="trophy" color={f.closing < 0 ? C.red : C.green} tone={f.closing < 0 ? "bad" : "good"} />
    </div>

    <Card title="الرصيد أسبوع بأسبوع" right={<label className="flex cursor-pointer items-center gap-2 text-xs font-bold"><input type="checkbox" checked={inc} onChange={e => setInc(e.target.checked)} className="accent-[var(--sky)]" />ضيف مبيعات جديدة متوقعة<Hint text={`من الأسبوع الخامس: ${sar(a.new_weekly)} في الأسبوع = متوسط فواتيرك الشهرية شامل الضريبة ÷ 4.33 × 80% تحصيل. من غيرها التوقع متحفظ: بيحسب اللي اتفوتر بس.`} /></label>}>
      <WeekChart rows={f.rows} opening={f.opening} />
      <div className="mt-4"><Table rows={f.rows.map(r => ({ ...r, key: String(r.i) }))} rowKey={r => r.key} max={13} cols={[
        { key: "from", label: "الأسبوع", className: "whitespace-nowrap text-right font-bold", render: r => `${dm(r.from)} – ${dm(r.to)}` },
        { key: "in_ar", label: "تحصيل", render: r => <span className="text-emerald-700">{r.in_ar ? short(r.in_ar) : "—"}</span> },
        ...(inc ? [{ key: "in_new", label: "مبيعات جديدة", render: (r: F["rows"][number]) => r.in_new ? short(r.in_new) : "—" }] : []),
        { key: "out_ap", label: "موردين", render: r => <span className="text-red-700">{r.out_ap ? short(r.out_ap) : "—"}</span> },
        { key: "out_fixed", label: "مصاريف ثابتة", render: r => r.out_fixed ? short(r.out_fixed) : "—" },
        { key: "out_var", label: "مصاريف متغيرة", render: r => r.out_var ? short(r.out_var) : "—" },
        { key: "net", label: "الصافي", render: r => <b className={r.net < 0 ? "text-red-700" : "text-emerald-700"}>{short(r.net)}</b> },
        { key: "balance", label: "الرصيد", render: r => <b className={r.balance < 0 ? "text-red-700" : "text-[var(--navy)]"}>{sar(r.balance)}</b> },
      ]} expand={r => r.items.length ? <ul className="space-y-1 text-xs">{r.items.map((it, k) => <li key={k} className="flex justify-between gap-2"><span dir="auto">{it.kind === "in" ? "⬇︎" : "⬆︎"} {it.label}</span><b className={it.kind === "in" ? "text-emerald-700" : "text-red-700"}>{sar(it.amount)}</b></li>)}</ul> : <span className="text-xs text-[var(--muted)]">مفيش حركات كبيرة الأسبوع ده.</span>} /></div>
    </Card>

    <Card title="الافتراضات اللي بنيت عليها التوقع">
      <ul className="grid gap-2 text-[12px] leading-6 text-[var(--ink-soft)] sm:grid-cols-2">
        <li>• المصاريف الثابتة {sar(a.fixed_monthly)} في الشهر بتتدفع يوم 27 ({a.fixed_source === "list" ? "من قائمة المصروفات الثابتة" : "متوسط مصروفاتك من دفترة — ضيف المصروفات الثابتة في تبويب الأرباح لدقة أكبر"}).</li>
        {a.variable_monthly > 0 && <li>• مصاريف متغيرة (تسويق، سفر، حكومي…) {sar(a.variable_monthly)} في الشهر موزعة على الأسابيع.</li>}
        <li>• فواتير الموردين بتتدفع كاملة في ميعادها، والمتأخر منها موزع على أول 4 أسابيع.</li>
        <li>• ضريبة القيمة المضافة المستحقة عن الشهر ده لحد دلوقتي: <b>{sar(d.vat_period)}</b> — احجزها وما تصرفهاش، بتتدفع للهيئة مع الإقرار.</li>
      </ul>
    </Card>
  </div>;
}
