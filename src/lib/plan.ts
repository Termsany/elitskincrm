/**
 * Monthly sales planner — pure maths shared by the page (live) and the Excel export.
 * Multi-product break-even using the weighted-average contribution margin of the planned unit mix.
 * All prices/costs are before VAT. Nothing here touches Daftra.
 */
export type PlanCost = { id: string; name: string; kind: "salary" | "expense"; planned: number; actual: number | null };
export type PlanItem = { key: string; name: string; include: boolean; cost: number; price: number; mix: number; qty: number | null; actual_qty: number | null; actual_price: number | null };
export type PlanData = { target_profit: number; variable_pct: number; costs: PlanCost[]; items: PlanItem[]; notes: string };
export type CatalogRow = { key: string; name: string; avg_cost: number | null; last_cost: number | null; price: number | null; list_price: number; hist_qty: number; stock: number; d_qty: number; d_price: number | null };
export type PlanAdvice = { level: "danger" | "warn" | "good" | "info"; title: string; text: string };

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => `${Math.round(n).toLocaleString("en-US")} ر.س`;
const pcs = (n: number) => `${Math.round(n).toLocaleString("en-US")} حبة`;
const num = (v: unknown, lo: number, hi: number, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const opt = (v: unknown, lo: number, hi: number) => v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : null;

/** Server-side sanitising of a plan posted by the page. */
export function cleanPlan(raw: unknown): PlanData {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const costs = (Array.isArray(b.costs) ? b.costs : []).slice(0, 80).map((c: Record<string, unknown>, i) => ({
    id: String(c?.id || `c${i}`).slice(0, 40), name: String(c?.name || "").trim().slice(0, 80) || "مصروف",
    kind: c?.kind === "salary" ? "salary" as const : "expense" as const, planned: r2(num(c?.planned, 0, 1e8)), actual: opt(c?.actual, 0, 1e8),
  }));
  const seen = new Set<string>();
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 400).map((x: Record<string, unknown>) => ({
    key: String(x?.key || "").slice(0, 60), name: String(x?.name || "").trim().slice(0, 200), include: x?.include !== false,
    cost: r2(num(x?.cost, 0, 1e7)), price: r2(num(x?.price, 0, 1e7)), mix: r2(num(x?.mix, 0, 1e6)),
    qty: opt(x?.qty, 0, 1e7), actual_qty: opt(x?.actual_qty, 0, 1e7), actual_price: opt(x?.actual_price, 0, 1e7),
  })).filter(x => x.key && x.name && !seen.has(x.key) && seen.add(x.key));
  return { target_profit: r2(num(b.target_profit, -1e8, 1e8)), variable_pct: r2(num(b.variable_pct, 0, 60)), costs, items, notes: String(b.notes || "").slice(0, 2000) };
}

/** First draft of a month's plan from Daftra history. */
export function draftPlan(cat: CatalogRow[], costs: PlanCost[], targetNetPct: number): PlanData {
  const sold = cat.filter(c => c.hist_qty > 0);
  const totQ = sold.reduce((s, c) => s + c.hist_qty, 0) || 1;
  const items: PlanItem[] = sold.map(c => ({ key: c.key, name: c.name, include: true, cost: r2(c.avg_cost ?? c.last_cost ?? 0), price: r2(c.price ?? c.list_price ?? 0),
    mix: r2(c.hist_qty / totQ * 100), qty: null, actual_qty: null, actual_price: null }));
  const histRev = sold.reduce((s, c) => s + c.hist_qty * (c.price ?? c.list_price ?? 0), 0);
  return { target_profit: Math.max(0, Math.round(histRev * targetNetPct / 100 / 1000) * 1000), variable_pct: 0, costs, items, notes: "" };
}

function core(p: PlanData, catalog: CatalogRow[]) {
  const cat = new Map(catalog.map(c => [c.key, c]));
  const v = p.variable_pct / 100;
  const fixedPlanned = p.costs.reduce((s, c) => s + c.planned, 0);
  const salaries = p.costs.filter(c => c.kind === "salary").reduce((s, c) => s + c.planned, 0);
  const fixedActual = p.costs.reduce((s, c) => s + (c.actual ?? c.planned), 0);
  const inc = p.items.filter(i => i.include);
  const unit = (i: PlanItem) => i.price - i.cost - i.price * v;
  const valid = inc.filter(i => i.price > 0 && unit(i) > 0);
  const mixSum = valid.reduce((s, i) => s + i.mix, 0);
  const w = (i: PlanItem) => !valid.includes(i) ? 0 : mixSum > 0 ? i.mix / mixSum : 1 / valid.length;
  const wcm = valid.reduce((s, i) => s + w(i) * unit(i), 0);              // contribution of one "average" piece
  const need = fixedPlanned + Math.max(0, p.target_profit);
  const nBe = wcm > 0 ? fixedPlanned / wcm : null, nT = wcm > 0 ? need / wcm : null;

  const rows = p.items.filter(i => i.include || i.actual_qty !== null).map(i => {
    const c = cat.get(i.key), u = unit(i), wt = w(i);
    const be_qty = nBe === null || !wt ? 0 : Math.ceil(nBe * wt - 1e-9);
    const target_qty = nT === null || !wt ? 0 : Math.ceil(nT * wt - 1e-9);
    const plan_qty = i.include ? i.qty ?? target_qty : 0;
    const hist = c?.hist_qty ?? 0, stock = Math.max(0, c?.stock ?? 0);
    const aq = i.actual_qty, ap = i.actual_price ?? i.price;
    const a_rev = aq === null ? null : aq * ap, a_cogs = aq === null ? null : aq * i.cost;
    const a_profit = aq === null ? null : a_rev! - a_cogs! - a_rev! * v;
    const issue = !i.include ? null : i.price <= 0 ? "no_price" : i.cost <= 0 ? "no_cost" : u <= 0 ? "loss" : u / i.price < 0.2 ? "thin" : null;
    return { key: i.key, name: i.name, cost: i.cost, price: i.price, var_cost: r2(i.price * v), unit_profit: r2(u), unit_margin: i.price > 0 ? r2(u / i.price * 100) : null,
      include: i.include, min_price: v < 1 ? r2(i.cost / (1 - v)) : null, share: r2(wt * 100), be_qty, target_qty, plan_qty, overridden: i.qty !== null,
      plan_revenue: r2(plan_qty * i.price), plan_cogs: r2(plan_qty * i.cost), plan_profit: r2(plan_qty * u),
      hist_qty: r2(hist), stock, stretch: hist > 0 ? r2(plan_qty / hist) : null, to_buy: Math.max(0, Math.ceil(plan_qty - stock)), buy_cash: r2(Math.max(0, Math.ceil(plan_qty - stock)) * i.cost),
      actual_qty: aq, actual_price: i.actual_price, actual_revenue: a_rev === null ? null : r2(a_rev), actual_profit: a_profit === null ? null : r2(a_profit),
      achieve: aq === null || !plan_qty ? null : r2(aq / plan_qty * 100), d_qty: c?.d_qty ?? 0, d_price: c?.d_price ?? null, issue };
  });

  const sum = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const planRev = sum("plan_revenue"), planCogs = sum("plan_cogs"), planContrib = sum("plan_profit");
  const hasActual = rows.some(r => r.actual_qty !== null);
  const aRev = sum("actual_revenue"), aContrib = sum("actual_profit");
  const beRev = valid.length && nBe !== null ? valid.reduce((s, i) => s + w(i) * nBe * i.price, 0) : null;
  const tRev = valid.length && nT !== null ? valid.reduce((s, i) => s + w(i) * nT * i.price, 0) : null;
  const histRev = rows.reduce((s, r) => s + r.hist_qty * r.price, 0), histContrib = rows.reduce((s, r) => s + r.hist_qty * Math.max(0, r.unit_profit), 0);

  const t = {
    fixed: r2(fixedPlanned), salaries: r2(salaries), fixed_actual: r2(fixedActual), target_profit: p.target_profit, variable_pct: p.variable_pct,
    avg_unit_profit: r2(wcm), be_pieces: nBe === null ? null : Math.ceil(nBe), be_revenue: beRev === null ? null : r2(beRev),
    target_pieces: nT === null ? null : Math.ceil(nT), target_revenue: tRev === null ? null : r2(tRev),
    plan_pieces: sum("plan_qty"), plan_revenue: r2(planRev), plan_cogs: r2(planCogs), plan_variable: r2(planRev * v), plan_gross: r2(planContrib),
    plan_profit: r2(planContrib - fixedPlanned), plan_margin: planRev ? r2((planContrib - fixedPlanned) / planRev * 100) : null,
    safety: planRev && beRev !== null ? r2((planRev - beRev) / planRev * 100) : null, buy_cash: r2(sum("buy_cash")),
    hist_revenue: r2(histRev), hist_profit: r2(histContrib - fixedPlanned),
    has_actual: hasActual, actual_pieces: sum("actual_qty"), actual_revenue: r2(aRev), actual_gross: r2(aContrib), actual_profit: r2(aContrib - fixedActual),
    actual_margin: aRev ? r2((aContrib - fixedActual) / aRev * 100) : null, achieve_revenue: planRev && hasActual ? r2(aRev / planRev * 100) : null,
  };
  return { rows, t };
}
export type PlanRow = ReturnType<typeof core>["rows"][number];
export type PlanTotals = ReturnType<typeof core>["t"];
export function computePlan(p: PlanData, catalog: CatalogRow[] = []) { const { rows, t } = core(p, catalog); return { rows, t, advice: advisePlan(rows, t) }; }

function advisePlan(rows: PlanRow[], t: PlanTotals): PlanAdvice[] {
  const out: PlanAdvice[] = [];
  if (!rows.length) return [{ level: "info", title: "ابدأ بإضافة الأصناف", text: "ضيف الأصناف اللي ناوي تبيعها الشهر ده وحط سعر بيع كل واحد — وأنا أحسبلك الكميات." }];
  const loss = rows.filter(r => r.issue === "loss");
  if (loss.length) out.push({ level: "danger", title: `${loss.length} صنف بيخسر في كل حبة`, text: loss.slice(0, 5).map(r => `${r.name}: السعر ${fmt(r.price)} والتكلفة ${fmt(r.cost)} — أقل سعر من غير خسارة ${r.min_price === null ? "—" : fmt(r.min_price)}`).join(" · ") + ". الأصناف دي مش داخلة في حساب الهدف لحد ما تعدّل سعرها." });
  const nocost = rows.filter(r => r.issue === "no_cost");
  if (nocost.length) out.push({ level: "warn", title: `${nocost.length} صنف من غير تكلفة شراء`, text: `${nocost.slice(0, 4).map(r => r.name).join("، ")} — اكتب تكلفة الحبة عشان الربح يطلع صح.` });
  if (t.target_pieces === null) { out.push({ level: "danger", title: "مفيش صنف بيكسب", text: "كل الأصناف المختارة سعرها أقل من تكلفتها (أو من غير سعر). ارفع الأسعار عشان أقدر أحسب الهدف." }); return out; }

  out.push({ level: "info", title: `عشان تغطي مصاريفك (${fmt(t.fixed)}) محتاج تبيع ${pcs(t.be_pieces || 0)} بقيمة ${fmt(t.be_revenue || 0)}`, text: `ده "نقطة التعادل": أي حبة بعدها ربح صافي. متوسط ربح الحبة بعد التكلفة${t.variable_pct ? " والعمولات" : ""} ${fmt(t.avg_unit_profit)}، ولتحقيق صافي ربح ${fmt(t.target_profit)} محتاج ${pcs(t.target_pieces)} بقيمة ${fmt(t.target_revenue || 0)}.` });

  if (t.hist_revenue > 0 && t.target_revenue) {
    const ratio = t.target_revenue / t.hist_revenue;
    if (ratio > 1.3) {
      const affordable = t.hist_profit + t.fixed - t.target_profit; // contribution at history minus target = max fixed you can carry
      const cut = Math.max(0, t.fixed - affordable);
      out.push({ level: ratio > 2 ? "danger" : "warn", title: `الهدف ${Math.round((ratio - 1) * 100)}% أعلى من متوسط بيعك`, text: `متوسط بيعك لنفس الأصناف حوالي ${fmt(t.hist_revenue)} في الشهر. عشان الخطة تبقى واقعية: إما تزوّد البيع تدريجياً (هدف الشهر الأول +20–30%)، أو تخفّض المصاريف بحوالي ${fmt(cut)}، أو ترفع أسعار الأصناف الأقل ربحاً.` });
    } else out.push({ level: "good", title: "الهدف قريب من مستوى بيعك الحالي", text: `متوسط بيعك لنفس الأصناف ${fmt(t.hist_revenue)} شهرياً — الهدف ده واقعي لو حافظت على الأسعار والتحصيل.` });
  }
  const stretch = rows.filter(r => r.stretch !== null && r.stretch > 2 && r.plan_qty >= 5).sort((a, b) => (b.stretch || 0) - (a.stretch || 0));
  if (stretch.length) out.push({ level: "warn", title: `${stretch.length} صنف مطلوب منه أكتر من ضعف بيعه المعتاد`, text: stretch.slice(0, 4).map(r => `${r.name}: ${pcs(r.plan_qty)} (متوسطك ${pcs(r.hist_qty)})`).join(" · ") + ". لو مش واقعي، قلّل نسبته وزوّد الأصناف اللي ربحها أعلى." });
  const fresh = rows.filter(r => r.hist_qty === 0 && r.plan_qty > 0);
  if (fresh.length) out.push({ level: "info", title: `${fresh.length} صنف ما اتباعش قبل كده`, text: `${fresh.slice(0, 4).map(r => r.name).join("، ")} — الكمية دي تقديرية، تابعها أول أسبوعين.` });
  const best = rows.filter(r => r.unit_profit > 0).sort((a, b) => b.unit_profit - a.unit_profit).slice(0, 3);
  if (best.length) out.push({ level: "good", title: "ركّز البيع على الأصناف الأعلى ربحاً للحبة", text: best.map(r => `${r.name} (${fmt(r.unit_profit)} للحبة، ${r.unit_margin}%)`).join(" · ") + ". كل حبة زيادة منهم بتقرّبك من الهدف أسرع — خلّي المناديب يبدأوا بيها في الزيارات." });
  const thin = rows.filter(r => r.issue === "thin");
  if (thin.length) out.push({ level: "warn", title: `${thin.length} صنف هامشه أقل من 20%`, text: `${thin.slice(0, 4).map(r => `${r.name} (${r.unit_margin}%)`).join("، ")} — بيشغّل فلوس كتير ويكسب قليل. فكّر ترفع سعره 5–10% أو تفاوض المورد على سعر أقل.` });
  if (t.target_revenue && t.salaries / t.target_revenue > 0.25) out.push({ level: "warn", title: `الرواتب ${Math.round(t.salaries / t.target_revenue * 100)}% من هدف المبيعات`, text: "المعدل الصحي في التوزيع الطبي 10–20%. يا إما المبيعات المطلوبة من كل مندوب تزيد، يا إما ربط جزء من الراتب بالتحقيق (عمولة)." });
  if (t.safety !== null && t.safety < 15 && t.plan_profit > 0) out.push({ level: "warn", title: `هامش الأمان ${t.safety}% بس`, text: "يعني لو المبيعات قلّت بالنسبة دي هتخسر. حاول توصل لـ 20% أو أكتر." });
  if (t.plan_profit < 0) out.push({ level: "danger", title: `الكميات اللي حددتها بتطلع خسارة ${fmt(-t.plan_profit)}`, text: "الكميات المكتوبة يدوي أقل من المطلوب. رجّعها للكمية المقترحة أو زوّد الأصناف الأعلى ربحاً." });
  if (t.buy_cash > 0) out.push({ level: "info", title: `هتحتاج تشتري بضاعة بحوالي ${fmt(t.buy_cash)}`, text: "دي قيمة الكميات اللي ناقصة عن المخزون الحالي بسعر التكلفة (قبل الضريبة). جهّز السيولة واطلب بدري عشان التوريد." });
  if (t.has_actual) {
    const ok = t.actual_profit >= t.target_profit;
    out.push({ level: ok ? "good" : t.actual_profit >= 0 ? "warn" : "danger", title: ok ? `حققت الهدف ✓ صافي ربح ${fmt(t.actual_profit)}` : `الفعلي: صافي ربح ${fmt(t.actual_profit)} من هدف ${fmt(t.target_profit)}`, text: `بعت ${fmt(t.actual_revenue)} (${t.achieve_revenue ?? 0}% من الخطة).` + (ok ? "" : ` الناقص ${fmt(t.target_profit - t.actual_profit)} — يعني حوالي ${pcs(Math.ceil((t.target_profit - t.actual_profit) / (t.avg_unit_profit || 1)))} زيادة بمتوسط ربح الحبة.`) });
  }
  return out;
}
