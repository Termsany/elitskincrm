"use client";
import { useState } from "react";
import type { FinData } from "./FinanceHub";
import { sar, pct, Card, Hint } from "./kit";

const ceil5 = (n: number) => Math.ceil(n / 5) * 5;
/** Price for a cost so that `share` of the price is left after it (cost ÷ (1 − share)). */
export const priceFor = (cost: number, share: number) => share >= 0.95 ? null : cost / (1 - share);
/** Biggest discount off a list price that still lands at or above `floor`. */
export const maxDiscount = (list: number | null, floor: number | null) => !list || !floor || list <= 0 ? null : Math.max(0, (1 - floor / list) * 100);

function F({ label, hint, value, set, suffix }: { label: string; hint?: string; value: number; set: (n: number) => void; suffix: string }) {
  return <label className="block"><span className="text-[11.5px] font-bold">{label}{hint && <Hint text={hint} />}</span>
    <div className="mt-1 flex items-center rounded-xl border border-[var(--border)] bg-white"><input type="number" inputMode="decimal" min={0} value={Number.isFinite(value) ? value : ""} onChange={e => set(Math.max(0, Number(e.target.value)))} dir="ltr" className="min-w-0 flex-1 rounded-xl bg-transparent px-3 py-2 text-sm font-bold" /><span className="px-2 text-[11px] text-[var(--muted)]">{suffix}</span></div></label>;
}

/** Price one product (existing or new) so it covers its cost, its share of overheads, rep commission and a discount buffer. */
export function PriceCalc({ d, needed, opexRatio }: { d: FinData; needed: number; opexRatio: number }) {
  const opts = d.pricing.filter(p => p.avg_cost !== null).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const [pid, setPid] = useState("");
  const [cost, setCost] = useState(0); const [extra, setExtra] = useState(0); const [comm, setComm] = useState(0); const [disc, setDisc] = useState(10);
  const [list, setList] = useState(0);
  function pick(k: string) { setPid(k); const p = opts.find(x => x.key === k); if (p) { setCost(p.avg_cost || 0); setList(p.list_price || 0); } }
  const landed = cost * (1 + extra / 100), c = comm / 100;
  const be = priceFor(landed, c), cover = priceFor(landed, opexRatio + c), tgt = priceFor(landed, needed + c);
  const rec = tgt === null ? null : ceil5(tgt / Math.max(0.05, 1 - disc / 100));
  const unit = (price: number) => price * (1 - c) - landed - price * opexRatio;
  return <Card title="حاسبة تسعير منتج" hint="اختار منتج موجود أو اكتب تكلفة منتج جديد. الحاسبة بتضيف نصيب المنتج من مصاريف الشركة، وعمولة المندوب، وهامش للخصم — وتقولك سعر القائمة الصح وأقصى خصم مسموح.">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      <label className="col-span-2 block"><span className="text-[11.5px] font-bold">المنتج</span><select value={pid} onChange={e => pick(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"><option value="">منتج جديد (اكتب التكلفة)</option>{opts.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}</select></label>
      <F label="تكلفة الشراء للوحدة" value={cost} set={setCost} suffix="ر.س" hint="قبل الضريبة. لو اخترت منتج، بتتملى بمتوسط سعر الشراء من دفترة." />
      <F label="شحن وجمارك وتخزين" value={extra} set={setExtra} suffix="%" hint="أي تكلفة بتتضاف على سعر الشراء لحد ما المنتج يوصل المخزن." />
      <F label="عمولة المندوب" value={comm} set={setComm} suffix="%" />
      <F label="أقصى خصم للعميل" value={disc} set={setDisc} suffix="%" hint="الخصم اللي ممكن المندوب يديه. السعر المقترح بيتحسب بحيث حتى بعد الخصم ده تفضل كسبان بالهامش المستهدف." />
    </div>
    {cost > 0 ? <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="rounded-2xl bg-red-50 p-3 ring-1 ring-red-100"><span className="text-[11px] text-red-800">أقل سعر ممكن</span><b className="block text-lg text-red-700">{sar(be, 2)}</b><span className="text-[10.5px] text-red-800/80">تحته خسارة فعلية في كل حبة</span></div>
      <div className="rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-100"><span className="text-[11px] text-amber-900">أقل سعر يحقق هدفك</span><b className="block text-lg text-amber-800">{sar(tgt, 2)}</b><span className="text-[10.5px] text-amber-900/80">هامش {Math.round(needed * 100)}% بعد الخصم{cover !== null && opexRatio + c < 0.9 ? ` · يغطي المصاريف من ${sar(cover)}` : ""}</span></div>
      <div className="rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-200"><span className="text-[11px] text-emerald-900">سعر القائمة المقترح</span><b className="block text-xl text-emerald-700">{sar(rec)}</b><span className="text-[10.5px] text-emerald-900/80">شامل الضريبة {sar(rec === null ? null : rec * 1.15, 2)}</span></div>
      <div className="rounded-2xl bg-[var(--sky-light)] p-3"><span className="text-[11px] text-[var(--muted)]">ربحك في الحبة بعد نصيبها من المصاريف</span><b className="block text-lg text-[var(--navy)]">{sar(rec === null ? null : unit(rec), 2)}</b><span className="text-[10.5px] text-[var(--muted)]">بعد خصم {disc}%: {sar(rec === null ? null : unit(rec * (1 - disc / 100)), 2)}</span></div>
    </div> : null}
    {cost > 0 && <div className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl bg-[var(--bg)] p-3 text-[12px] leading-6">
      <div className="w-40"><F label="سعر القائمة الحالي" value={list} set={setList} suffix="ر.س" /></div>
      {list > 0 && <div className="min-w-0 flex-1">بسعر {sar(list)}: الهامش {pct(list > 0 ? (1 - landed / list) * 100 : null)}.
        أقصى خصم المندوب يقدر يديه وانت لسه بتحقق هدفك: <b className="text-emerald-700">{pct(maxDiscount(list, tgt))}</b> — وأقصى خصم قبل ما تخسر: <b className="text-red-700">{pct(maxDiscount(list, be))}</b>.
        {rec !== null && list < rec && <span className="block text-amber-800">سعرك الحالي أقل من المقترح بـ {sar(rec - list)} — لو العميل بياخد خصم {disc}%، هامشك هيقل عن الهدف.</span>}</div>}
    </div>}
  </Card>;
}
