"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { notificationHref } from "@/lib/notification-links";
import { GROUP_LABEL, QUICK_APPROVE } from "@/lib/notification-levels";
import { Icon } from "@/components/Icon";

type N = { id: string; message: string; kind: string; is_read: boolean; created_at: string; task_id: string | null; task_title: string | null; plan_title: string | null; plan_id: string | null; action_url: string | null; entity_id: string | null; level: "important" | "info" };
type Live = { key: string; icon: string; text: string; href: string; count: number; tone: "red" | "amber" | "teal" };
const LIVE_TONE: Record<Live["tone"], string> = { red: "bg-red-500", amber: "bg-amber-500", teal: "bg-teal-600" };
type Row = { group: false; n: N } | { group: true; kind: string; items: N[] };
const rel = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 6e4); return m < 1 ? "دلوقتي" : m < 60 ? `من ${m} د` : m < 1440 ? `من ${Math.round(m / 60)} س` : `من ${Math.round(m / 1440)} يوم`; };

/** Bell with two levels (important / FYI), piles of the same kind grouped, and one-tap approve for plans and expenses. */
export default function NotificationsBell({ role = "sales_rep" }: { role?: string }) {
  const router = useRouter();
  const [list, setList] = useState<N[]>([]); const [important, setImportant] = useState(0); const [info, setInfo] = useState(0);
  const [open, setOpen] = useState(false); const [tab, setTab] = useState<"important" | "info">("important");
  const [hasNew, setHasNew] = useState(false); const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(""); const [msg, setMsg] = useState("");
  const [live, setLive] = useState<Live[]>([]);
  const [fresh, setFresh] = useState(0); const [seenLive, setSeenLive] = useState<Record<string, number>>({});
  const load = useCallback(async () => {
    const [r, l] = await Promise.all([
      fetch("/api/notifications", { cache: "no-store" }).then(x => x.json()).catch(() => null),
      fetch("/api/notifications/live", { cache: "no-store" }).then(x => x.ok ? x.json() : null).catch(() => null),
    ]);
    if (l) setLive(l.items || []);
    if (r) {
      const n = r.important ?? r.unread ?? 0;
      setImportant(n); setInfo(r.info || 0);
      setFresh(p => { const f = r.fresh ?? n; if (f > p) setHasNew(true); return f; }); setSeenLive(r.seen_live || {});
      setList(r.notifications || []);
    }
  }, []);
  useEffect(() => {
    void load();
    const id = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60 * 1000);
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    const onChange = () => void load();
    document.addEventListener("visibilitychange", onVis); window.addEventListener("es:alerts-changed", onChange);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("es:alerts-changed", onChange); };
  }, [load]);
  useEffect(() => { if (hasNew) { const t = setTimeout(() => setHasNew(false), 2000); return () => clearTimeout(t); } }, [hasNew]);
  useEffect(() => {
    if (!open) return;
    setTab(important || liveTotal || !info ? "important" : "info");
    // Opening the bell marks everything in it as seen: the red number clears, the items stay until handled.
    const snap = Object.fromEntries(live.map(x => [x.key, x.count]));
    setFresh(0); setSeenLive(snap);
    void fetch("/api/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ seen: true, live: snap }) }).catch(() => {});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => list.filter(n => (n.level || "important") === tab), [list, tab]);
  const rows = useMemo<Row[]>(() => {
    const unreadByKind = new Map<string, N[]>();
    for (const n of shown) if (!n.is_read) unreadByKind.set(n.kind, [...(unreadByKind.get(n.kind) || []), n]);
    const out: Row[] = [], done = new Set<string>();
    for (const n of shown) {
      const pile = unreadByKind.get(n.kind);
      if (!n.is_read && pile && pile.length >= 3) { if (!done.has(n.kind)) { done.add(n.kind); out.push({ group: true, kind: n.kind, items: pile }); } continue; }
      out.push({ group: false, n });
    }
    return out;
  }, [shown]);

  async function markIds(ids: string[]) {
    await fetch("/api/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) });
  }
  async function markAll() { await fetch("/api/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: true, level: tab }) }); await load(); }
  async function openNotification(n: N) {
    setList(l => l.filter(x => x.id !== n.id));
    if (!n.is_read) await markIds([n.id]);
    setOpen(false); router.push(notificationHref(n, role));
  }
  async function approve(n: N) {
    setBusy(n.id); setMsg("");
    const r = n.kind === "plan_pending" && n.plan_id
      ? await fetch(`/api/plans/${n.plan_id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "approved", admin_note: "" }) })
      : await fetch("/api/admin/expenses/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [n.entity_id], action: "approve" }) });
    const j = await r.json().catch(() => null);
    setBusy("");
    if (!r.ok) { setMsg(j?.error || "تعذر الاعتماد — افتح التفاصيل"); return; }
    await markIds([n.id]); setMsg("اتعتمد ✓"); await load(); setTimeout(() => setMsg(""), 1800);
  }
  async function snooze(n: N) {
    setBusy(n.id);
    const r = await fetch("/api/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ snooze: n.id, days: 1 }) });
    setBusy("");
    if (!r.ok) { setMsg("تعذر التأجيل"); return; }
    setMsg("هيرجعلك بكرة 8 الصبح ⏰"); await load(); setTimeout(() => setMsg(""), 1800);
  }
  const canApprove = (n: N) => role === "admin" && !n.is_read && QUICK_APPROVE.includes(n.kind) && (n.kind === "plan_pending" ? !!n.plan_id : !!n.entity_id);

  const item = (n: N, inner = false) => <div key={n.id} className={`flex items-start gap-2 p-3 text-sm transition hover:bg-sky-50 ${!n.is_read ? "bg-amber-50/70" : ""} ${inner ? "pr-6" : ""}`}>
    {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />}
    <button type="button" onClick={() => void openNotification(n)} className="min-w-0 flex-1 text-right">
      <div className={`leading-6 ${n.is_read ? "text-[var(--muted)]" : "font-semibold"}`}>{n.message}</div>
      {(n.task_title || n.plan_title) && <div className="text-xs text-[var(--muted)]">{n.task_title || n.plan_title}</div>}
      <div className="mt-0.5 text-[11px] text-[var(--muted)]">{rel(n.created_at)}</div>
    </button>
    {!n.is_read && !inner && (n.level || "important") === "important" && <button type="button" disabled={busy === n.id} onClick={() => void snooze(n)} title="فكّرني بكرة" aria-label="فكّرني بكرة" className="shrink-0 rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-[11px] font-bold text-[var(--muted)] hover:text-[var(--navy)] disabled:opacity-60">⏰ بكرة</button>}
    {canApprove(n) && <button type="button" disabled={busy === n.id} onClick={() => void approve(n)} className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-60">{busy === n.id ? "…" : "✓ اعتماد"}</button>}
  </div>;

  const liveTotal = live.reduce((a, x) => a + x.count, 0);
  // Only what is new since the bell was last opened: new important notifications + live items that grew.
  const freshLive = live.reduce((a, x) => a + Math.max(0, x.count - (seenLive[x.key] ?? 0)), 0);
  const badge = fresh + freshLive;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className={`relative flex h-11 w-11 items-center justify-center rounded-2xl border-2 shadow-md transition ${badge > 0 ? "es-bell-ring border-[var(--sky)] bg-[var(--navy)] text-white" : "es-bell-idle border-[var(--border)] bg-white text-[var(--navy)] hover:border-[var(--sky)]"} ${hasNew ? "scale-110" : ""}`} title="الإشعارات" aria-label={`الإشعارات${badge ? ` — ${badge} محتاج منك حاجة` : ""}`}>
        <Icon name="bell" size={22} />
        {badge > 0 ? <span key={badge} className="es-badge-pop absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[11px] font-extrabold text-white shadow">{badge > 99 ? "99+" : badge}</span>
          : info > 0 ? <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-sky-400" /> : null}
      </button>
      {open && <>
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        <div className="absolute left-0 z-50 mt-2 w-[380px] max-w-[92vw] overflow-hidden rounded-2xl border border-[var(--border)] bg-white text-[var(--ink)] shadow-2xl">
          <div className="flex items-center justify-between gap-2 bg-[var(--navy)] p-3 text-white">
            <span className="flex items-center gap-2 text-sm font-bold"><Icon name="bell" size={16} /> الإشعارات</span>
            {(tab === "important" ? important : info) > 0 && <button onClick={() => void markAll()} className="rounded-full bg-white/15 px-2 py-1 text-xs font-bold hover:bg-white/20">تعليم الكل مقروء</button>}
          </div>
          <div className="grid grid-cols-2 gap-1 border-b border-[var(--border)] bg-[var(--bg)] p-1.5">
            {([["important", "مهم", important + liveTotal], ["info", "للعلم", info]] as const).map(([t, l, c]) => <button key={t} type="button" onClick={() => { setTab(t); setExpanded(null); }}
              className={`rounded-xl py-2 text-xs font-bold transition ${tab === t ? "bg-white text-[var(--navy)] shadow" : "text-[var(--muted)]"}`}>{l}{c ? <span className={`mr-1.5 rounded-full px-1.5 text-[10px] text-white ${t === "important" ? "bg-red-500" : "bg-sky-500"}`}>{c}</span> : null}</button>)}
          </div>
          {msg && <div className="border-b border-[var(--border)] bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{msg}</div>}
          <div className="max-h-[55vh] divide-y divide-[var(--border)] overflow-auto">
            {tab === "important" && live.length > 0 && <div className="bg-[var(--bg)] p-2">
              <div className="space-y-1.5">{live.map(x => <button key={x.key} type="button" onClick={() => { setOpen(false); router.push(x.href); }}
                className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-white p-2.5 text-right text-sm shadow-sm transition hover:border-[var(--sky)]">
                <span className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-extrabold text-white ${LIVE_TONE[x.tone]}`}>{x.count}</span>
                <span className="min-w-0 flex-1 font-bold leading-5">{x.icon} {x.text}</span>
                <span className="text-[var(--muted)]">‹</span>
              </button>)}</div>
            </div>}
            {rows.map(r => r.group ? <div key={`g-${r.kind}`}>
              <button type="button" onClick={() => setExpanded(expanded === r.kind ? null : r.kind)} className="flex w-full items-center gap-3 bg-amber-50 p-3 text-right text-sm hover:bg-amber-100/70">
                <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-amber-500 px-2 text-xs font-extrabold text-white">{r.items.length}</span>
                <span className="min-w-0 flex-1 font-bold">{GROUP_LABEL[r.kind] || r.items[0].message}<span className="block text-[11px] font-normal text-[var(--muted)]">آخرها {rel(r.items[0].created_at)}</span></span>
                <span className="text-xs text-[var(--muted)]">{expanded === r.kind ? "▴" : "▾"}</span>
              </button>
              {expanded === r.kind && <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">{r.items.map(n => item(n, true))}
                <button type="button" onClick={() => void markIds(r.items.map(n => n.id)).then(load)} className="w-full py-2 text-center text-[11px] font-bold text-[var(--muted)] hover:text-[var(--navy)]">تعليم المجموعة مقروءة</button></div>}
            </div> : item(r.n))}
            {!rows.length && !(tab === "important" && live.length) && <div className="p-8 text-center text-sm text-[var(--muted)]">{tab === "important" ? "مفيش حاجة محتاجاك ✓" : "مفيش إشعارات للعلم"}</div>}
          </div>
        </div>
      </>}
    </div>
  );
}
