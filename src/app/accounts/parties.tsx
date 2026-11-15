"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/Toast";
import type { AccData, Open } from "./AccountsHub";
import type { StLine } from "@/lib/fin-books";
import { sar, num, Card, ExcelBtn, Table, AGE, Bars, C } from "../daftra-sales/kit";
import { Tile } from "./summary";

export type PartyKind = "client" | "supplier";

/** Customers (receivables) or suppliers (payables): aging, balances, and the statement on click. */
export function Parties({ d, kind, open, x }: { d: AccData; kind: PartyKind; open: Open; x: (s: string) => string }) {
  const b = kind === "client" ? d.ar : d.ap;
  const [bk, setBk] = useState<string | null>(null);
  const old = (b.buckets["61-90"] || 0) + (b.buckets["90+"] || 0);
  const week = new Date(Date.parse(`${d.today}T00:00:00Z`) + 7 * 864e5).toISOString().slice(0, 10);
  const dueWeek = b.open.filter(o => o.due <= week).reduce((s, o) => s + o.unpaid, 0);
  const rows = (bk ? b.parties.filter(p => p.b[bk] > 0) : b.parties) as Array<(typeof b.parties)[number] & Record<string, unknown>>;
  const isC = kind === "client";
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label={isC ? "إجمالي ليك عند العملاء" : "إجمالي عليك للموردين"} value={sar(b.total)} sub={`${b.parties.length} ${isC ? "عميل" : "مورد"} · ${b.open.length} فاتورة مفتوحة`} />
      <Tile label="فات ميعاده" value={sar(b.overdue)} tone={b.overdue > 0 ? "bad" : undefined} sub={b.total ? `${Math.round(b.overdue / b.total * 100)}% من الإجمالي` : "—"} />
      <Tile label={isC ? "أقدم من 60 يوم" : "مستحق خلال 7 أيام"} value={sar(isC ? old : dueWeek)} tone={isC && old > 0 ? "bad" : !isC && dueWeek > 0 ? "warn" : undefined} sub={isC ? "أصعب ديون في التحصيل" : `لحد ${week}`} />
      {isC ? <Tile label="المحصّل في الفترة" value={sar(d.kpi.collected)} sub="دفعات العملاء المسجلة في دفترة" />
        : <Tile label="المشتريات في الفترة" value={sar(d.kpi.purchases)} sub={`${d.kpi.purchase_invoices} فاتورة شراء (قبل الضريبة)`} />}
    </div>

    <Card title="أعمار الأرصدة" hint="الفلوس مقسومة حسب عدد الأيام بعد ميعاد الاستحقاق. اضغط على أي فترة عشان تفلتر." right={<ExcelBtn href={x(isC ? "ar" : "ap")} />}>
      <div className="mb-3 flex h-4 overflow-hidden rounded-full bg-[var(--bg)]">{AGE.map(([k, , c]) => b.buckets[k] ? <button type="button" key={k} aria-label={k} onClick={() => setBk(bk === k ? null : k)} title={sar(b.buckets[k])} style={{ width: `${b.buckets[k] / (b.total || 1) * 100}%`, background: c, opacity: bk && bk !== k ? 0.3 : 1 }} /> : null)}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{AGE.map(([k, l, c]) => <button type="button" key={k} onClick={() => setBk(bk === k ? null : k)} className={`rounded-xl border p-2.5 text-right transition ${bk === k ? "border-[var(--navy)] bg-[var(--sky-light)]" : "border-[var(--border)] hover:bg-[var(--bg)]"}`}>
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--muted)]"><i className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</div><div className="mt-0.5 text-sm font-extrabold tabular-nums">{sar(b.buckets[k] || 0)}</div></button>)}</div>
    </Card>

    <Card title={`${isC ? "العملاء" : "الموردين"}${bk ? ` — ${AGE.find(a => a[0] === bk)?.[1]}` : ""} · اضغط على أي اسم يفتح كشف الحساب`} right={bk && <button type="button" onClick={() => setBk(null)} className="text-xs font-bold text-[var(--navy)]">إلغاء الفلتر</button>}>
      <Table rows={rows} rowKey={r => r.name} search={r => r.name} initialSort={["unpaid", -1]} empty={isC ? "مفيش مستحقات عند العملاء 🎉" : "مفيش مستحقات للموردين"} cols={[
        { key: "name", label: isC ? "العميل" : "المورد", className: "max-w-72 truncate text-right font-bold", render: r => <button type="button" onClick={e => { e.stopPropagation(); open(kind, r.name); }} className="max-w-72 truncate text-right font-bold text-[var(--navy)] hover:underline">{r.name}</button> },
        { key: "unpaid", label: "الرصيد", render: r => <b className="tabular-nums">{sar(r.unpaid)}</b> },
        { key: "overdue", label: "متأخر", render: r => r.overdue ? <span className="font-bold text-red-700">{sar(r.overdue)}</span> : "—" },
        { key: "oldestDue", label: "أقدم تأخير", render: r => r.oldestDue > 0 ? <span className={r.oldestDue > 60 ? "font-bold text-red-700" : "text-amber-700"}>{r.oldestDue} يوم</span> : <span className="text-emerald-700">في الميعاد</span> },
        { key: "n", label: "فواتير" },
      ]} />
    </Card>

    {isC ? <Card title="أكبر العملاء في الفترة (مبيعات)">
      <Bars rows={d.salesByClient.slice(0, 10).map(c => ({ label: c.name, value: c.net, sub: `${c.share}% من مبيعاتك · ${c.n} فاتورة · آخر فاتورة ${c.last}` }))} color={C.blue} onPick={n => open("client", n)} />
    </Card> : <Card title="المشتريات حسب المورد في الفترة">
      <Bars rows={d.purchasesBySupplier.slice(0, 10).map(s => ({ label: s.name, value: s.net, sub: `${s.n} فاتورة · ${s.unpaid ? `عليك ${sar(s.unpaid)}` : "مسدد"}` }))} color={C.teal} onPick={n => open("supplier", n)} />
    </Card>}
  </div>;
}

type St = { kind: PartyKind; name: string; lines: StLine[]; totals: { invoiced: number; refunds: number; paid: number; balance: number; open: number; overdue: number; unallocated: number };
  open: Array<{ id: number; no: string; date: string; due: string; unpaid: number; days_late: number }>; last_invoice: string | null; last_payment: string | null };

/** Account statement in a side drawer: running balance, open invoices, and a ready reminder message. */
export function StatementDrawer({ kind, name, subdomain, onClose }: { kind: PartyKind; name: string; subdomain: string; onClose: () => void }) {
  const toast = useToast();
  const [s, setS] = useState<St | null>(null); const [err, setErr] = useState<string | null>(null); const [all, setAll] = useState(false);
  useEffect(() => {
    setS(null); setErr(null);
    fetch(`/api/admin/finance/statement?kind=${kind}&name=${encodeURIComponent(name)}`, { cache: "no-store" }).then(async r => { const j = await r.json().catch(() => null); if (r.ok && j) setS(j); else setErr(j?.error || "تعذر تحميل كشف الحساب"); }).catch(() => setErr("تعذر تحميل كشف الحساب"));
  }, [kind, name]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", h); return () => document.removeEventListener("keydown", h); }, [onClose]);
  const url = (id: number) => `https://${subdomain}.daftra.com/owner/${kind === "client" ? "invoices" : "purchase_invoices"}/view/${id}`;
  const isC = kind === "client";
  const reminder = s ? `السلام عليكم ${name}،\nنحب نفكّركم إن الرصيد المستحق لنا عندكم ${Math.round(s.totals.open).toLocaleString("en-US")} ر.س${s.totals.overdue ? `، منه ${Math.round(s.totals.overdue).toLocaleString("en-US")} ر.س فات ميعاده` : ""}.\n${s.open.slice(0, 6).map(o => `• فاتورة ${o.no} بتاريخ ${o.date}: ${Math.round(o.unpaid).toLocaleString("en-US")} ر.س${o.days_late ? ` (متأخرة ${o.days_late} يوم)` : ""}`).join("\n")}\nياريت تأكدوا لنا ميعاد السداد. شكراً لكم.` : "";
  const copy = async () => { try { await navigator.clipboard.writeText(reminder); toast("اتنسخت رسالة التذكير — الصقها في واتساب", "success"); } catch { toast("تعذر النسخ", "error"); } };
  const lines = s ? (all ? s.lines : s.lines.slice(-25)) : [];
  if (typeof document === "undefined") return null;
  return createPortal(<div dir="rtl" className="fixed inset-0 z-[90]">
    <button type="button" aria-label="إغلاق" onClick={onClose} className="absolute inset-0 bg-[#0b1d20]/40" />
    <aside role="dialog" aria-modal="true" aria-label={`كشف حساب ${name}`} className="absolute inset-y-0 left-0 flex w-[min(520px,100vw)] flex-col bg-[var(--card)] shadow-2xl">
      <div className="flex items-center justify-between gap-2 bg-[var(--navy)] px-4 py-3.5 text-white">
        <div className="min-w-0"><div className="text-[12px] opacity-80">كشف حساب {isC ? "عميل" : "مورد"}</div><div className="truncate text-[17px] font-extrabold">{name}</div></div>
        <button type="button" onClick={onClose} aria-label="إغلاق" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg hover:bg-white/15">✕</button>
      </div>
      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-4">
        {err && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{err}</div>}
        {!s && !err && <div className="space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--bg)]" />)}</div>}
        {s && <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-[var(--sky-light)] p-3"><div className="text-[11px] font-semibold text-[var(--muted)]">الرصيد</div><div className="text-[17px] font-extrabold tabular-nums">{sar(s.totals.open)}</div></div>
            <div className="rounded-2xl bg-[var(--sky-light)] p-3"><div className="text-[11px] font-semibold text-[var(--muted)]">{isC ? "المحصّل" : "المدفوع"}</div><div className="text-[17px] font-extrabold tabular-nums text-emerald-700">{sar(s.totals.paid)}</div></div>
            <div className="rounded-2xl bg-[var(--sky-light)] p-3"><div className="text-[11px] font-semibold text-[var(--muted)]">متأخر</div><div className={`text-[17px] font-extrabold tabular-nums ${s.totals.overdue ? "text-red-700" : ""}`}>{sar(s.totals.overdue)}</div></div>
          </div>
          <div className="text-[12px] text-[var(--muted)]">إجمالي الفواتير {sar(s.totals.invoiced)}{s.totals.refunds ? ` · مرتجعات ${sar(s.totals.refunds)}` : ""} · آخر فاتورة {s.last_invoice || "—"}{isC ? ` · آخر دفعة ${s.last_payment || "—"}` : ""}</div>
          {Math.abs(s.totals.unallocated) >= 1 && <div className="rounded-xl bg-amber-50 p-2.5 text-[12px] text-amber-900">فيه {sar(Math.abs(s.totals.unallocated))} فرق بين الحركة والفواتير المفتوحة — غالباً دفعة {s.totals.unallocated < 0 ? "مقدمة أو " : ""}مش مربوطة بفاتورة في دفترة.</div>}
          <div className="flex flex-wrap gap-2">
            {isC && s.open.length > 0 && <button type="button" onClick={() => void copy()} className="rounded-full bg-[var(--navy)] px-3.5 py-2 text-xs font-bold text-white">انسخ رسالة تذكير</button>}
          </div>
          {s.open.length > 0 && <div><div className="mb-1.5 text-sm font-extrabold">الفواتير المفتوحة ({s.open.length})</div>
            <div className="space-y-1.5">{s.open.map(o => <a key={o.id} href={url(o.id)} target="_blank" rel="noreferrer" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-xs hover:bg-[var(--sky-light)]">
              <b dir="ltr" className="text-[var(--navy)]">{o.no}</b><span>فاتورة {o.date}</span><span>استحقاق {o.due}</span>
              <span className={o.days_late ? "font-bold text-red-700" : "text-emerald-700"}>{o.days_late ? `متأخرة ${o.days_late} يوم` : "في الميعاد"}</span><b className="tabular-nums">{sar(o.unpaid)}</b></a>)}</div></div>}
          <div>
            <div className="mb-1.5 flex items-center justify-between"><span className="text-sm font-extrabold">الحركة</span>{s.lines.length > 25 && <button type="button" onClick={() => setAll(!all)} className="text-xs font-bold text-[var(--navy)]">{all ? "آخر 25 بس" : `كل الحركة (${s.lines.length})`}</button>}</div>
            <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-[12.5px]">
              <thead className="bg-[var(--sky-light)] text-[11px] text-[var(--muted)]"><tr><th className="p-2 text-right">التاريخ</th><th className="p-2 text-right">البيان</th><th className="p-2">{isC ? "عليه" : "له"}</th><th className="p-2">{isC ? "دفع" : "اتدفع"}</th><th className="p-2">الرصيد</th></tr></thead>
              <tbody className="divide-y divide-[var(--border)]">{lines.map((l, i) => { const up = isC ? l.debit : l.credit, down = isC ? l.credit : l.debit; return <tr key={i}>
                <td className="whitespace-nowrap p-2 text-[var(--muted)]">{l.date}</td>
                <td className="p-2">{l.doc_id && l.kind !== "payment" ? <a href={url(l.doc_id)} target="_blank" rel="noreferrer" className="hover:underline">{l.note}</a> : l.note}</td>
                <td className="p-2 text-center tabular-nums">{up ? num(up, 2) : ""}</td>
                <td className="p-2 text-center tabular-nums text-emerald-700">{down ? num(down, 2) : ""}</td>
                <td className="p-2 text-center font-extrabold tabular-nums">{num(l.balance, 2)}</td></tr>; })}
                {!lines.length && <tr><td colSpan={5} className="p-4 text-center text-[var(--muted)]">مفيش حركة</td></tr>}</tbody></table></div>
            {!isC && <div className="mt-1.5 text-[11px] text-[var(--muted)]">دفعات الموردين مش بتتسحب من دفترة، فالمدفوع من كل فاتورة شراء ظاهر في نفس يومها.</div>}
          </div>
        </>}
      </div>
    </aside>
  </div>, document.body);
}
