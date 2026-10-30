"use client";
/* Small shared visual pieces for the visits hub. */
export const L = "ar-EG-u-nu-latn";
export const BAND: Record<string, { label: string; ring: string; chip: string; bar: string; text: string }> = {
  excellent: { label: "ممتازة", ring: "#059669", chip: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-500", text: "text-emerald-700" },
  good: { label: "جيدة", ring: "#f59e0b", chip: "bg-amber-100 text-amber-800", bar: "bg-amber-400", text: "text-amber-700" },
  weak: { label: "ضعيفة", ring: "#f97316", chip: "bg-orange-100 text-orange-800", bar: "bg-orange-400", text: "text-orange-700" },
};
export const REACT: Record<string, { label: string; icon: string; tone: string }> = {
  interested: { label: "مهتم", icon: "😊", tone: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  neutral: { label: "محايد", icon: "😐", tone: "bg-slate-50 text-slate-700 border-slate-200" },
  not_interested: { label: "مش مهتم", icon: "🙁", tone: "bg-red-50 text-red-700 border-red-200" },
};
export const fd = (d: string, o: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString(L, o);
export const ago = (min: number | null) => min === null ? "—" : min < 1 ? "دلوقتي" : min < 60 ? `من ${min} د` : min < 1440 ? `من ${Math.floor(min / 60)} س${min % 60 ? ` و${min % 60} د` : ""}` : `من ${Math.floor(min / 1440)} يوم`;
export const secs = (s: number) => s < 60 ? `${s} ث` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} د`;

export function Ring({ value, size = 44, stroke = 5, band, label }: { value: number | null; size?: number; stroke?: number; band?: string | null; label?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = value ?? 0;
  const color = band ? BAND[band]?.ring : value === null ? "#cbd5e1" : v >= 75 ? "#059669" : v >= 50 ? "#f59e0b" : "#f97316";
  return <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
    <svg width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f6" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, v) / 100)} style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)" }} /></svg>
    <span className="absolute text-center leading-none"><b className="block font-extrabold text-[var(--navy)]" style={{ fontSize: size * 0.3 }}>{value ?? "—"}</b>{label && <span className="block text-[9px] text-[var(--muted)]">{label}</span>}</span>
  </div>;
}

/** Day strip 07:00 → 24:00 with a dot per visit. */
export function DayStrip({ items, onPick }: { items: Array<{ id: string; hm: string; doctor: string; band: string | null; red: boolean; planned: boolean }>; onPick?: (id: string) => void }) {
  const pos = (hm: string) => { const [h, m] = hm.split(":").map(Number); const t = (h < 5 ? h + 24 : h) + m / 60; return Math.min(100, Math.max(0, (t - 7) / 18 * 100)); };
  return <div className="relative h-9">
    <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--bg)]" />
    {[9, 12, 15, 18, 21, 24].map(h => <span key={h} className="absolute top-full translate-x-1/2 text-[9px] text-[var(--muted)]" style={{ right: `${(h - 7) / 18 * 100}%` }}>{h === 24 ? "12ص" : h > 12 ? `${h - 12}م` : `${h}${h === 12 ? "ظ" : "ص"}`}</span>)}
    {items.map(i => <button key={i.id} type="button" title={`${i.hm} · ${i.doctor}`} onClick={() => onPick?.(i.id)}
      className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-white shadow transition hover:scale-150 ${i.red ? "bg-red-500 ring-2 ring-red-200" : i.band ? BAND[i.band].bar : "bg-slate-300"}`} style={{ right: `${pos(i.hm)}%` }} />)}
  </div>;
}

export function Bars({ data, max }: { data: Array<{ key: string; label: string; value: number; sub?: string; tone?: string }>; max?: number }) {
  const m = max ?? Math.max(1, ...data.map(d => d.value));
  return <div className="space-y-2">{data.map(d => <div key={d.key} className="flex items-center gap-3 text-sm">
    <span className="w-28 shrink-0 truncate font-bold" title={d.label}>{d.label}</span>
    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--bg)]"><div className={`h-full rounded-full ${d.tone || "bg-[var(--navy)]"}`} style={{ width: `${d.value / m * 100}%`, transition: "width .7s cubic-bezier(.2,.8,.2,1)" }} /></div>
    <span className="w-14 shrink-0 text-left text-xs font-bold">{d.value}{d.sub ? <span className="font-normal text-[var(--muted)]"> {d.sub}</span> : null}</span>
  </div>)}</div>;
}
