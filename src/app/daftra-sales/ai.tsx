"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import type { FinData } from "./FinanceHub";
import { Card, sar, pct, C } from "./kit";

type Msg = { role: "user" | "assistant"; content: string };
const ASK = ["أنا كسبان ولا خسران الفترة دي وليه؟", "إيه أهم 3 حاجات أعملها الأسبوع ده عشان الربح يزيد؟", "مين العملاء اللي أحصّل منهم الأول؟", "أنهي منتجات بتكسّبني وأنهي بتخسّرني؟", "مصاريفي فين أقدر أوفّر فيها؟", "السيولة عندي تكفي لحد إمتى؟"];

/** Chat with the AI advisor: it reads the period's Daftra numbers on the server and answers in plain Arabic. */
export function AiAdvisor({ d, range }: { d: FinData; range: [string, string] }) {
  const [msgs, setMsgs] = useState<Msg[]>([]); const [q, setQ] = useState(""); const [busy, setBusy] = useState(false);
  const ctl = useRef<AbortController | null>(null); const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs]);
  useEffect(() => () => ctl.current?.abort(), []);

  async function send(text: string) {
    const t = text.trim(); if (!t || busy) return;
    const history: Msg[] = [...msgs, { role: "user", content: t }];
    setMsgs([...history, { role: "assistant", content: "" }]); setQ(""); setBusy(true);
    const put = (c: string) => setMsgs(m => [...m.slice(0, -1), { role: "assistant", content: c }]);
    ctl.current = new AbortController();
    try {
      const r = await fetch("/api/admin/finance/ai", { method: "POST", headers: { "content-type": "application/json" }, signal: ctl.current.signal, body: JSON.stringify({ from: range[0], to: range[1], messages: history }) });
      if (!r.ok || !r.body) { const j = await r.json().catch(() => null); put(`⚠ ${j?.error || "تعذر الوصول للمستشار"}`); return; }
      const reader = r.body.getReader(); const dec = new TextDecoder(); let acc = "";
      for (;;) { const { done, value } = await reader.read(); if (done) break; acc += dec.decode(value, { stream: true }); put(acc); }
      if (!acc.trim()) put("⚠ ما وصلش رد — جرّب تاني");
    } catch (e) { if ((e as Error).name !== "AbortError") put("⚠ الاتصال اتقطع — جرّب تاني"); }
    finally { setBusy(false); }
  }

  if (!d.ai) return <Card title="المستشار الذكي"><div className="text-sm text-[var(--muted)]">مش مفعّل على السيرفر.</div></Card>;
  return <Card title="اسأل المستشار الذكي" right={msgs.length > 0 ? <button type="button" onClick={() => { ctl.current?.abort(); setMsgs([]); }} className="text-xs font-bold text-[var(--muted)] hover:text-[var(--navy)]">محادثة جديدة</button> : undefined}>
    {msgs.length === 0 && <div className="flex flex-wrap gap-2">{ASK.map(a => <button key={a} type="button" onClick={() => void send(a)} className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-right text-[13px] font-bold text-[var(--navy)] transition hover:border-[var(--sky)]">{a}</button>)}</div>}
    {msgs.length > 0 && <div className="max-h-[60vh] space-y-3 overflow-y-auto">{msgs.map((m, i) => <div key={i} className={m.role === "user" ? "flex justify-start" : "flex justify-end"}>
      <div dir="auto" className={`max-w-[92%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-[14px] leading-7 ${m.role === "user" ? "bg-[var(--navy)] text-white" : "bg-[var(--sky-light)] text-[var(--ink)]"}`}>{m.content || <span className="animate-pulse text-[var(--muted)]">بفكّر في أرقامك…</span>}</div>
    </div>)}<div ref={end} /></div>}
    <form onSubmit={e => { e.preventDefault(); void send(q); }} className="mt-3 flex gap-2">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="اكتب سؤالك عن الأرباح، المصاريف، التحصيل، الأسعار…" className="h-12 min-w-0 flex-1 rounded-2xl border border-[var(--border)] px-4 text-[15px]" />
      {busy ? <button type="button" onClick={() => ctl.current?.abort()} className="h-12 shrink-0 rounded-2xl border border-[var(--border)] px-4 text-sm font-bold">إيقاف</button>
        : <button type="submit" disabled={!q.trim()} className="flex h-12 shrink-0 items-center gap-1.5 rounded-2xl bg-[var(--navy)] px-5 text-sm font-bold text-white disabled:opacity-40"><Icon name="send" size={16} />اسأل</button>}
    </form>
  </Card>;
}

/** The period's profit and loss as one statement: each line, its share of sales, and the change vs the previous period. */
export function PnlStatement({ d }: { d: FinData }) {
  const k = d.kpi, p = d.prev || null;
  const rows: Array<{ label: string; v: number; prev: number | null; sign: "" | "−" | "+"; strong?: boolean; goodUp: boolean }> = [
    { label: "المبيعات", v: k.sales, prev: p?.sales ?? null, sign: "", goodUp: true },
    { label: "تكلفة البضاعة", v: k.cogs, prev: p?.cogs ?? null, sign: "−", goodUp: false },
    { label: "مجمل الربح", v: k.gross, prev: p?.gross ?? null, sign: "", strong: true, goodUp: true },
    { label: "المصروفات", v: k.opex, prev: p?.opex ?? null, sign: "−", goodUp: false },
    ...(k.other_income ? [{ label: "إيرادات أخرى", v: k.other_income, prev: p?.other_income ?? null, sign: "+" as const, goodUp: true }] : []),
  ];
  const win = k.net >= 0;
  const delta = (v: number, prev: number | null, goodUp: boolean) => {
    if (prev === null || !prev) return null;
    const ch = (v - prev) / Math.abs(prev) * 100; if (Math.abs(ch) < 0.5) return <span className="text-[var(--muted)]">زي الفترة اللي فاتت</span>;
    const good = ch > 0 === goodUp;
    return <span className={good ? "text-emerald-700" : "text-red-700"}>{ch > 0 ? "▲" : "▼"} {Math.abs(ch).toFixed(0)}%</span>;
  };
  return <div className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-white">
    <div className={`flex flex-wrap items-center gap-3 p-5 ${win ? "bg-emerald-50" : "bg-red-50"}`}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ background: win ? C.green : C.red }}><Icon name={win ? "trophy" : "warn"} size={24} /></span>
      <div className="min-w-0 flex-1"><div className="text-xs font-bold text-[var(--muted)]">{win ? "صافي ربح الفترة" : "صافي خسارة الفترة"}</div>
        <div className={`text-3xl font-extrabold ${win ? "text-emerald-800" : "text-red-800"}`}>{sar(Math.abs(k.net))}</div></div>
      <div className="text-left text-sm font-bold">{k.net_margin !== null && <div>{pct(k.net_margin)} من المبيعات</div>}{p && <div className="text-xs">{delta(k.net, p.net, true)}</div>}</div>
    </div>
    <div className="divide-y divide-[var(--border)]">{rows.map(r => <div key={r.label} className={`flex items-center gap-3 px-5 py-3 ${r.strong ? "bg-[var(--bg)] font-extrabold" : ""}`}>
      <span className="min-w-0 flex-1 text-sm">{r.sign && <span className="ml-1 text-[var(--muted)]">{r.sign}</span>}{r.label}</span>
      {p && <span className="w-28 text-left text-xs font-bold">{delta(r.v, r.prev, r.goodUp)}</span>}
      <span className="w-14 text-left text-xs text-[var(--muted)]">{k.sales ? `${(r.v / k.sales * 100).toFixed(0)}%` : ""}</span>
      <b className="w-32 text-left tabular-nums">{sar(r.v)}</b>
    </div>)}</div>
  </div>;
}
