/** Pure helpers to compare two versions of a plan's visits (shared by server + client). */
export type PlanItemLike = {
  id?: string; item_id?: string; doctor_id: string; planned_date: string; product_id?: string | null; priority?: string | null; note?: string | null;
  doctor_name?: string; clinic_name?: string | null; city?: string | null; product_name?: string | null;
};
export type PlanPair<T> = { from: T; to: T; fields: Array<"date" | "product" | "priority" | "note"> };
export type PlanDiff<T> = { added: T[]; removed: T[]; moved: PlanPair<T>[]; changed: PlanPair<T>[]; unchanged: PlanPair<T>[] };

const d10 = (v: unknown) => String(v ?? "").slice(0, 10);
const norm = (v: unknown) => String(v ?? "").trim();

function fieldsOf<T extends PlanItemLike>(a: T, b: T): PlanPair<T>["fields"] {
  const f: PlanPair<T>["fields"] = [];
  if (d10(a.planned_date) !== d10(b.planned_date)) f.push("date");
  if (norm(a.product_id) !== norm(b.product_id)) f.push("product");
  if ((norm(a.priority) || "medium") !== (norm(b.priority) || "medium")) f.push("priority");
  if (norm(a.note) !== norm(b.note)) f.push("note");
  return f;
}

/** Match same doctor on the same day first, then same doctor on another day (= moved). */
export function diffPlanItems<T extends PlanItemLike>(current: T[], proposed: T[]): PlanDiff<T> {
  const left = current.map((x, i) => ({ x, i })), right = proposed.map((x, i) => ({ x, i }));
  const usedL = new Set<number>(), usedR = new Set<number>();
  const pairs: PlanPair<T>[] = [];
  for (const r of right) {
    const l = left.find(l => !usedL.has(l.i) && l.x.doctor_id === r.x.doctor_id && d10(l.x.planned_date) === d10(r.x.planned_date));
    if (l) { usedL.add(l.i); usedR.add(r.i); pairs.push({ from: l.x, to: r.x, fields: fieldsOf(l.x, r.x) }); }
  }
  const byDate = (a: { x: T }, b: { x: T }) => d10(a.x.planned_date).localeCompare(d10(b.x.planned_date));
  const restL = left.filter(l => !usedL.has(l.i)).sort(byDate), restR = right.filter(r => !usedR.has(r.i)).sort(byDate);
  for (const r of restR) {
    const l = restL.find(l => !usedL.has(l.i) && l.x.doctor_id === r.x.doctor_id);
    if (l) { usedL.add(l.i); usedR.add(r.i); pairs.push({ from: l.x, to: r.x, fields: fieldsOf(l.x, r.x) }); }
  }
  return {
    added: right.filter(r => !usedR.has(r.i)).map(r => r.x),
    removed: left.filter(l => !usedL.has(l.i)).map(l => l.x),
    moved: pairs.filter(p => p.fields.includes("date")),
    changed: pairs.filter(p => p.fields.length && !p.fields.includes("date")),
    unchanged: pairs.filter(p => !p.fields.length),
  };
}

export function diffCounts(d: PlanDiff<PlanItemLike>) {
  return { added: d.added.length, removed: d.removed.length, moved: d.moved.length, changed: d.changed.length, total: d.added.length + d.removed.length + d.moved.length + d.changed.length };
}

export function diffSummaryText(c: { added: number; removed: number; moved: number; changed: number }) {
  const parts: string[] = [];
  if (c.added) parts.push(`+${c.added} إضافة`);
  if (c.removed) parts.push(`−${c.removed} حذف`);
  if (c.moved) parts.push(`${c.moved} نقل`);
  if (c.changed) parts.push(`${c.changed} تعديل`);
  return parts.join(" · ") || "بدون تغيير";
}

type Op = Record<string, unknown>;
/** The plan as it would look if a pending request were approved. */
export function applyRequestOps<T extends PlanItemLike>(current: T[], ops: Op[]): PlanItemLike[] {
  const replace = ops.find(o => o.op === "replace");
  if (replace && Array.isArray(replace.items)) return (replace.items as PlanItemLike[]).map(x => ({ ...x, planned_date: d10(x.planned_date) }));
  let out: PlanItemLike[] = current.map(x => ({ ...x, item_id: String(x.id || x.item_id || ""), planned_date: d10(x.planned_date) }));
  for (const o of ops) {
    if (o.op === "move") out = out.map(x => x.item_id === o.item_id ? { ...x, planned_date: String(o.to) } : x);
    if (o.op === "remove") out = out.filter(x => x.item_id !== o.item_id);
    if (o.op === "add") out.push({ doctor_id: String(o.doctor_id), doctor_name: String(o.doctor_name || ""), planned_date: String(o.to), product_id: (o.product_id as string) || null, note: String(o.note || ""), priority: "medium" });
  }
  return out;
}

/** Multiset key used to lock days that already passed. */
export function dayKeys(items: PlanItemLike[], before: string) {
  return items.filter(x => d10(x.planned_date) < before).map(x => `${x.doctor_id}@${d10(x.planned_date)}`).sort().join("|");
}
