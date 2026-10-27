type Row = Record<string, unknown>;
const clean = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ');
export function normalizeDoctorRows(rows: Row[]) {
  const seen = new Set<string>();
  return rows.flatMap((r) => {
    const name = clean(r.name ?? r['اسم الطبيب'] ?? r['Doctor']);
    const clinicName = clean(r.clinic ?? r['اسم العيادة'] ?? r['Clinic']);
    if (!name) return [];
    const out = { name, clinicName, city: clean(r.city ?? r['المدينة']), phone: clean(r.phone ?? r['الجوال'] ?? r['رقم التواصل']) };
    const key = `${name}|${clinicName}|${out.phone}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [out];
  });
}
export function normalizeProductsAndReps(rows: Row[]) {
  const reps = [...new Set(rows.map(r => clean(r.rep ?? r['المندوب'])).filter(Boolean))];
  const products = [...new Set(rows.map(r => clean(r.product ?? r['المنتج'])).filter(Boolean))];
  const assignments = rows.map(r => ({ rep: clean(r.rep ?? r['المندوب']), product: clean(r.product ?? r['المنتج']) })).filter(x => x.rep && x.product);
  return { reps, products, assignments };
}
