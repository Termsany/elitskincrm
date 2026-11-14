"use client";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Icon";
import type { FinData } from "./FinanceHub";
import { Card } from "./kit";

type Msg = { role: "user" | "assistant"; content: string };

/** Chat with the AI advisor: it reads the period's Daftra numbers on the server and answers in plain Arabic. */
export function AiAdvisor({ d, range, reload, chips, ask }: { d: FinData; range: [string, string]; reload: () => void; chips: string[]; ask: { q: string; n: number } | null }) {
  const [setup, setSetup] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]); const [q, setQ] = useState(""); const [busy, setBusy] = useState(false);
  const ctl = useRef<AbortController | null>(null); const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs]);
  useEffect(() => () => ctl.current?.abort(), []);
  const sendRef = useRef<(t: string) => void>(() => {});
  // a smart button elsewhere on the page asked a question: send it once
  useEffect(() => { if (ask?.q && d.ai) sendRef.current(ask.q); }, [ask?.n]); // eslint-disable-line react-hooks/exhaustive-deps

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

  sendRef.current = t => void send(t);
  if (!d.ai || setup) return <AiSetup onClose={d.ai ? () => setSetup(false) : undefined} onSaved={() => { setSetup(false); reload(); }} />;
  return <Card title="اسأل المستشار الذكي" right={<span className="flex items-center gap-3">{msgs.length > 0 && <button type="button" onClick={() => { ctl.current?.abort(); setMsgs([]); }} className="text-xs font-bold text-[var(--muted)] hover:text-[var(--navy)]">محادثة جديدة</button>}
    <button type="button" onClick={() => setSetup(true)} aria-label="إعدادات الذكاء الاصطناعي" title="إعدادات الذكاء الاصطناعي" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--navy)]"><Icon name="pen" size={15} /></button></span>}>
    {!busy && <div className="mb-3 flex flex-wrap gap-2">{chips.map(a => <button key={a} type="button" onClick={() => void send(a)} className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-right text-[13px] font-bold text-[var(--navy)] transition hover:border-[var(--sky)]">{a}</button>)}</div>}
    {msgs.length > 0 && <div className="space-y-3">{msgs.map((m, i) => <div key={i} className={m.role === "user" ? "flex justify-start" : "flex justify-end"}>
      <div dir="auto" className={`max-w-[92%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-[14px] leading-7 ${m.role === "user" ? "bg-[var(--navy)] text-white" : "bg-[var(--sky-light)] text-[var(--ink)]"}`}>{m.content || <span className="animate-pulse text-[var(--muted)]">بفكّر في أرقامك…</span>}</div>
    </div>)}<div ref={end} /></div>}
    <form onSubmit={e => { e.preventDefault(); void send(q); }} className="mt-3 flex gap-2">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="اكتب سؤالك عن الأرباح، المصاريف، التحصيل، الأسعار…" className="h-12 min-w-0 flex-1 rounded-2xl border border-[var(--border)] px-4 text-[15px]" />
      {busy ? <button type="button" onClick={() => ctl.current?.abort()} className="h-12 shrink-0 rounded-2xl border border-[var(--border)] px-4 text-sm font-bold">إيقاف</button>
        : <button type="submit" disabled={!q.trim()} className="flex h-12 shrink-0 items-center gap-1.5 rounded-2xl bg-[var(--navy)] px-5 text-sm font-bold text-white disabled:opacity-40"><Icon name="send" size={16} />اسأل</button>}
    </form>
  </Card>;
}

type Prov = { id: string; name: string; base_url: string; keys: string };
type Status = { configured: boolean; source?: "app" | "server"; provider?: string; base_url?: string; model?: string; key_hint?: string };

/** Connect the advisor to an AI provider: pick the provider, paste the key, test it, pick a model, save. */
function AiSetup({ onSaved, onClose }: { onSaved: () => void; onClose?: () => void }) {
  const toast = useToast();
  const [provs, setProvs] = useState<Prov[]>([]); const [st, setSt] = useState<Status | null>(null);
  const [provider, setProvider] = useState("anthropic"); const [base, setBase] = useState(""); const [key, setKey] = useState("");
  const [models, setModels] = useState<string[] | null>(null); const [model, setModel] = useState(""); const [busy, setBusy] = useState("");
  useEffect(() => { fetch("/api/admin/finance/ai/settings", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => {
    if (!j) return; setProvs(j.providers || []); setSt(j.status);
    if (j.status?.source === "app") { setProvider(j.status.provider); setBase(j.status.provider === "custom" ? j.status.base_url : ""); setModel(j.status.model); }
  }).catch(() => {}); }, []);
  const cur = provs.find(p => p.id === provider);
  const saved = st?.source === "app" && st.provider === provider;
  const body = () => JSON.stringify({ provider, base_url: base, api_key: key, model });
  const call = async (method: string) => { const r = await fetch("/api/admin/finance/ai/settings", { method, headers: { "content-type": "application/json" }, body: method === "DELETE" ? undefined : body() }); return { ok: r.ok, j: await r.json().catch(() => null) }; };

  async function test() {
    setBusy("test"); const { ok, j } = await call("POST"); setBusy("");
    if (!ok) { setModels(null); toast(j?.error || "تعذر اختبار المفتاح", "error"); return; }
    setModels(j.models || []); if (!(j.models || []).includes(model)) setModel(provider === "anthropic" && (j.models || []).includes("claude-opus-5-5") ? "claude-opus-5-5" : "");
    toast(`المفتاح شغال ✓ — ${(j.models || []).length} موديل متاح`, "success");
  }
  async function save() {
    setBusy("save"); const { ok, j } = await call("PUT"); setBusy("");
    if (!ok) { toast(j?.error || "تعذر الحفظ", "error"); return; }
    toast("اتربط المستشار ✓", "success"); onSaved();
  }
  async function disconnect() {
    setBusy("del"); const { ok, j } = await call("DELETE"); setBusy("");
    if (!ok) { toast(j?.error || "تعذر الفصل", "error"); return; }
    toast("اتفصل واتمسح المفتاح", "info"); onSaved();
  }
  const fld = "h-11 w-full rounded-xl border border-[var(--border)] px-3 text-sm";
  return <Card title="ربط المستشار بالذكاء الاصطناعي" right={onClose && <button type="button" onClick={onClose} className="text-xs font-bold text-[var(--muted)] hover:text-[var(--navy)]">رجوع</button>}>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block"><span className="text-xs font-bold text-[var(--muted)]">المزوّد</span>
        <select value={provider} onChange={e => { setProvider(e.target.value); setModels(null); setModel(""); setKey(""); }} className={fld}>{provs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="block"><span className="text-xs font-bold text-[var(--muted)]">مفتاح الـ API{cur?.keys ? ` (من ${cur.keys})` : ""}</span>
        <input type="password" autoComplete="off" value={key} onChange={e => { setKey(e.target.value); setModels(null); }} placeholder={saved ? `محفوظ ${st?.key_hint || ""} — سيبه فاضي عشان يفضل` : "sk-…"} dir="ltr" className={fld} /></label>
      {provider === "custom" && <label className="block sm:col-span-2"><span className="text-xs font-bold text-[var(--muted)]">عنوان الـ API</span>
        <input value={base} onChange={e => { setBase(e.target.value); setModels(null); }} placeholder="https://api.example.com/v1" dir="ltr" className={fld} /></label>}
      <label className="block sm:col-span-2"><span className="text-xs font-bold text-[var(--muted)]">الموديل</span>
        {models && models.length > 0 ? <select value={model} onChange={e => setModel(e.target.value)} className={fld} dir="ltr"><option value="">اختار…</option>{models.map(m => <option key={m} value={m}>{m}</option>)}</select>
          : <input value={model} onChange={e => setModel(e.target.value)} placeholder="اختبر المفتاح عشان تظهر الموديلات" dir="ltr" className={fld} />}</label>
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={!!busy || (!key.trim() && !saved)} onClick={() => void test()} className="h-11 rounded-xl border border-[var(--navy)] px-4 text-sm font-bold text-[var(--navy)] disabled:opacity-40">{busy === "test" ? "بختبر…" : "اختبر المفتاح"}</button>
      <button type="button" disabled={!!busy || !model.trim() || (!key.trim() && !saved)} onClick={() => void save()} className="h-11 rounded-xl bg-[var(--navy)] px-5 text-sm font-bold text-white disabled:opacity-40">{busy === "save" ? "بحفظ…" : "حفظ"}</button>
      {st?.source === "app" && <button type="button" disabled={!!busy} onClick={() => void disconnect()} className="mr-auto h-11 rounded-xl border border-red-200 px-4 text-sm font-bold text-red-700 disabled:opacity-40">فصل ومسح المفتاح</button>}
    </div>
  </Card>;
}
