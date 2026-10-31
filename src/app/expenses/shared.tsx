"use client";
import { Icon } from "@/components/Icon";

export type Cat = { id: string; code: string; name: string; icon: string; monthly_cap: number | null; receipt_required_above: number; allows_doctor: boolean; active: boolean };
export type Exp = {
  id: string; rep_id: string; rep_name: string; category_id: string; category_code: string; category_name: string; category_icon: string;
  expense_date: string; amount: number; vat_amount: number; merchant: string; description: string; doctor_id: string | null; doctor_name: string | null;
  status: "pending" | "approved" | "rejected" | "reimbursed"; review_note: string; reviewer_name: string | null; reimbursed_at: string | null; payment_ref: string;
  receipts: Array<{ id: string; file_name: string; mime_type: string }>; flags: string[];
};
export const sar = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: n % 1 ? 2 : 0 })} ر.س`;
export const STATUS: Record<Exp["status"], [string, string]> = {
  pending: ["بانتظار الاعتماد", "bg-amber-50 text-amber-700 ring-amber-200"],
  approved: ["معتمد", "bg-sky-50 text-sky-700 ring-sky-200"],
  reimbursed: ["تم الصرف", "bg-emerald-50 text-emerald-700 ring-emerald-200"],
  rejected: ["مرفوض", "bg-red-50 text-red-700 ring-red-200"],
};
export const CAT_TONE: Record<string, string> = { fuel: "#3b90e8", parking: "#637274", hospitality: "#e16201", promo: "#9676e3", events: "#c92f36", travel: "#15646a", phone: "#1aa865", print: "#a46603", other: "#526162" };
export const tone = (code: string) => CAT_TONE[code] || "#15646a";
export function StatusPill({ s }: { s: Exp["status"] }) { const [l, c] = STATUS[s]; return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${c}`}>{l}</span>; }
export function CatIcon({ code, icon, size = 40 }: { code: string; icon: string; size?: number }) {
  const c = tone(code);
  return <span className="flex shrink-0 items-center justify-center rounded-xl" style={{ width: size, height: size, color: c, background: `${c}1f` }}><Icon name={icon} size={Math.round(size * 0.5)} /></span>;
}
export function Receipts({ e }: { e: Exp }) {
  if (!e.receipts.length) return null;
  return <div className="flex flex-wrap gap-1.5">{e.receipts.map((r, i) => <a key={r.id} href={`/api/expenses/${e.id}/receipts/${r.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-[11px] font-bold text-[var(--navy)] hover:border-[var(--sky)]"><Icon name="file" size={13} />إيصال {i + 1}</a>)}</div>;
}
export function Flags({ flags }: { flags: string[] }) {
  if (!flags.length) return null;
  return <div className="flex flex-wrap gap-1">{flags.map(f => <span key={f} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-800 ring-1 ring-amber-200"><Icon name="warn" size={11} />{f}</span>)}</div>;
}
