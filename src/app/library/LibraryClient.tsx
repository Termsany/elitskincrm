"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import SignStudio, { AssetsManager } from "./SignStudio";
import { Thumb, fileUrl, shortName, fmtDate, fmtSize, typeMeta, canSign, SRC_META, type LFile, type Asset } from "./ui";
import { pdfjs } from "@/components/detailing/pdf";

type Count = { src: string; n: number; signed: number; mine: number; bytes: string };
type Folder = { folder: string; n: number };
type Coll = { key: string; label: string; icon: string; n: number };
type SignReq = { id: string; src: string; item_id: string; file_name: string; note: string; want: string; status: string; admin_note: string; created_at: string; decided_at: string | null; signed_file_id: string | null; requested_by: string; requested_by_name: string; decided_by_name: string | null; ref: string | null };
const WANT: Record<string, string> = { signature: "توقيع", stamp: "ختم", both: "توقيع وختم" };
const REQ_ST: Record<string, [string, string]> = { pending: ["مستني", "bg-amber-100 text-amber-800"], signed: ["اتوقّع ✓", "bg-emerald-100 text-emerald-800"], rejected: ["مرفوض", "bg-red-100 text-red-700"], cancelled: ["اتلغى", "bg-slate-100 text-slate-600"] };
type TrashItem = { id: string; src: string; item_id: string; name: string; mime: string; size_bytes: string; ctx: string; deleted_at: string; deleted_by_name: string; deleted_by: string; days_left: number; src_label: string };
const card = "rounded-3xl border border-[var(--border)] bg-white";
const btn = "inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition disabled:opacity-50";
const ghost = `${btn} border border-[var(--border)] bg-white hover:bg-[var(--bg)]`;
const primary = `${btn} bg-[var(--navy)] text-white hover:opacity-95`;
const field = "h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--sky)]";

function useDevice() { const [w, setW] = useState(1400); useEffect(() => { const f = () => setW(window.innerWidth); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []); return w < 768 ? "phone" : w < 1200 ? "tablet" : "desktop"; }

function PdfPages({ f }: { f: LFile }) {
  const box = useRef<HTMLDivElement>(null); const [pages, setPages] = useState(0); const [limit, setLimit] = useState(4); const docRef = useRef<any>(null);
  useEffect(() => { let dead = false; pdfjs().then(m => m.getDocument({ url: fileUrl(f), withCredentials: true }).promise).then(d => { if (dead) { d.destroy(); return; } docRef.current = d; setPages(d.numPages); }).catch(() => setPages(-1)); return () => { dead = true; docRef.current?.destroy?.(); docRef.current = null; }; }, [f.src, f.id]);
  useEffect(() => {
    const d = docRef.current; const el = box.current; if (!d || !el) return;
    const cs = el.querySelectorAll("canvas"); const W = el.clientWidth;
    cs.forEach(async (c, i) => { if (c.dataset.done) return; c.dataset.done = "1"; const p = await d.getPage(i + 1); const v0 = p.getViewport({ scale: 1 }); const dpr = Math.min(2, window.devicePixelRatio || 1); const vp = p.getViewport({ scale: (W / v0.width) * dpr }); c.width = vp.width; c.height = vp.height; c.style.width = "100%"; await p.render({ canvasContext: c.getContext("2d")!, viewport: vp, canvas: c }).promise; });
  }, [pages, limit]);
  if (pages === -1) return <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-[var(--muted)]">تعذر عرض المعاينة — نزّل الملف</div>;
  return <div ref={box} className="space-y-2">{pages === 0 && <div className="h-64 animate-pulse rounded-2xl bg-[var(--bg)]" />}
    {Array.from({ length: Math.min(pages, limit) }, (_, i) => <canvas key={i} className="w-full rounded-xl border border-[var(--border)] bg-white shadow-sm" />)}
    {pages > limit && <button onClick={() => setLimit(l => l + 6)} className={`${ghost} w-full`}>اعرض صفحات أكتر ({pages - limit} باقي)</button>}
  </div>;
}

export default function LibraryClient({ isAdmin, userId, initialFile, initialView }: { isAdmin: boolean; userId: string; initialFile?: string; initialView?: string }) {
  const toast = useToast(); const device = useDevice();
  const [files, setFiles] = useState<LFile[]>([]); const [counts, setCounts] = useState<Count[]>([]); const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [coll, setColl] = useState(initialView || "all"); const [q, setQ] = useState(""); const [type, setType] = useState(""); const [sort, setSort] = useState("new");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sel, setSel] = useState<LFile | null>(null); const [detail, setDetail] = useState<any>(null);
  const [signing, setSigning] = useState<LFile | null>(null);
  const [upFiles, setUpFiles] = useState<File[]>([]); const [upFolder, setUpFolder] = useState("عام"); const [upVis, setUpVis] = useState<"team" | "private">("team"); const [upDesc, setUpDesc] = useState(""); const [progress, setProgress] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false); const [assets, setAssets] = useState<Asset[]>([]); const [canStamp, setCanStamp] = useState(false);
  const [edit, setEdit] = useState<{ name: string; folder: string; description: string } | null>(null);
  const [selecting, setSelecting] = useState(false); const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmDel, setConfirmDel] = useState<LFile[] | null>(null); const [deleting, setDeleting] = useState(false);
  const [trash, setTrash] = useState<TrashItem[]>([]); const [trashDays, setTrashDays] = useState(30);
  const [reqs, setReqs] = useState<SignReq[]>([]); const [reqFor, setReqFor] = useState<LFile | null>(null); const [reqWant, setReqWant] = useState("signature"); const [reqNote, setReqNote] = useState(""); const [reqBusy, setReqBusy] = useState(false);
  const [signReq, setSignReq] = useState<SignReq | null>(null); const [rejectFor, setRejectFor] = useState<SignReq | null>(null); const [rejectNote, setRejectNote] = useState(""); const [upAskSign, setUpAskSign] = useState(false);
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null); const [qLive, setQLive] = useState("");

  const params = useMemo(() => {
    const p = new URLSearchParams(); if (qLive) p.set("q", qLive); if (type) p.set("type", type); if (sort !== "new") p.set("sort", sort);
    if (coll === "mine") p.set("scope", "mine"); else if (coll === "trash" || coll === "signreq") { /* separate endpoint */ } else if (coll.startsWith("folder:")) p.set("folder", coll.slice(7)); else if (coll !== "all") p.set("src", coll);
    return p.toString();
  }, [qLive, type, sort, coll]);
  const loadTrash = useCallback(async () => { const j = await fetch("/api/library/trash", { cache: "no-store" }).then(r => r.json()).catch(() => null); if (j) { setTrash(j.items || []); setTrashDays(j.days || 30); } }, []);
  useEffect(() => { void loadTrash(); }, [loadTrash]);
  const loadReqs = useCallback(async () => { const j = await fetch("/api/library/sign-requests", { cache: "no-store" }).then(r => r.json()).catch(() => null); if (j) setReqs(j.requests || []); }, []);
  useEffect(() => { void loadReqs(); }, [loadReqs]);
  const pendingReqs = reqs.filter(r => r.status === "pending");
  async function sendSignRequest(list: Array<{ src: string; id: string }>, note: string, want: string, quiet = false) {
    const r = await fetch("/api/library/sign-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: list, note, want }) });
    const j = await r.json().catch(() => null);
    if (!r.ok) { if (!quiet) toast(j?.results?.[0]?.error || j?.error || "تعذر إرسال الطلب", "error"); return false; }
    toast(`اتبعت طلب ${WANT[want] || "التوقيع"} للمدير ✓${j.created < list.length ? ` (${list.length - j.created} ملف مش مدعوم)` : ""}`, "success"); void loadReqs(); return true;
  }
  async function decideReq(r: SignReq, action: "reject" | "cancel", note = "") {
    const resp = await fetch(`/api/library/sign-requests/${r.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, note }) });
    const j = await resp.json().catch(() => null);
    if (!resp.ok) { toast(j?.error || "فشل", "error"); return; }
    toast(action === "reject" ? "اترفض الطلب واتبلغ المندوب" : "اتلغى الطلب", "success"); setRejectFor(null); setRejectNote(""); void loadReqs();
  }
  const reqFile = (r: SignReq): LFile => ({ src: r.src, id: r.item_id, name: r.file_name, mime: /\.(png)$/i.test(r.file_name) ? "image/png" : /\.(jpe?g)$/i.test(r.file_name) ? "image/jpeg" : "application/pdf", size: 0, created_at: r.created_at, owner_id: r.requested_by, owner_name: r.requested_by_name, folder: "", description: "", visibility: "private", signed: false, source_kind: null, source_id: null, ctx: "", ctx_url: null });
  const load = useCallback(async () => {
    if (coll === "trash" || coll === "signreq") {
      setLoading(true);
      await Promise.all([coll === "trash" ? loadTrash() : loadReqs(), counts.length ? null : fetch("/api/library", { cache: "no-store" }).then(r => r.json()).then(j => { setCounts(j.counts || []); setFolders(j.folders || []); }).catch(() => null)]);
      setLoading(false); return;
    }
    setLoading(true);
    try { const r = await fetch(`/api/library?${params}`, { cache: "no-store" }); const j = await r.json(); setFiles(j.files || []); setCounts(j.counts || []); setFolders(j.folders || []); }
    catch { toast("تعذر تحميل المكتبة", "error"); } finally { setLoading(false); }
  }, [params, coll]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPicked(new Set()); setSelecting(false); }, [coll]);
  const loadAssets = useCallback(async () => { const j = await fetch("/api/library/assets", { cache: "no-store" }).then(r => r.json()).catch(() => null); if (j) { setAssets(j.assets || []); setCanStamp(!!j.canStamp); } }, []);
  useEffect(() => { if (assetsOpen) void loadAssets(); }, [assetsOpen, loadAssets]);
  useEffect(() => { if (initialFile) void fetch(`/api/library/${initialFile}`).then(r => r.ok ? r.json() : null).then(j => { if (j?.file) openFile({ ...j.file, src: "lib", size: j.file.size_bytes, ctx: j.file.signed ? "نسخة موقعة / مختومة" : `المكتبة · ${j.file.folder}`, ctx_url: null }); }); }, [initialFile]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.body.style.overflow = sel && device !== "desktop" ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [sel, device]);

  function openFile(f: LFile) {
    setSel(f); setDetail(null); setEdit(null);
    if (f.src === "lib") fetch(`/api/library/${f.id}`).then(r => r.ok ? r.json() : null).then(j => j && setDetail(j));
  }
  const total = (src?: string) => counts.filter(c => !src || c.src === src).reduce((a, c) => a + c.n, 0);
  const bytes = counts.reduce((a, c) => a + Number(c.bytes || 0), 0);
  const colls: Coll[] = [
    { key: "all", label: "كل الملفات", icon: "🗂️", n: total() },
    { key: "mine", label: "ملفاتي", icon: "👤", n: counts.reduce((a, c) => a + c.mine, 0) },
    { key: "signed", label: "المستندات الموقعة", icon: "🖋️", n: counts.reduce((a, c) => a + c.signed, 0) },
    { key: "signreq", label: isAdmin ? "طلبات التوقيع" : "طلبات توقيعي", icon: "📨", n: pendingReqs.length },
    { key: "lib", label: "المكتبة العامة", icon: "📁", n: total("lib") },
    { key: "brochure", label: "بروشورات المنتجات", icon: "📘", n: total("brochure") },
    { key: "visit", label: "مرفقات الزيارات", icon: "🩺", n: total("visit") },
    { key: "task", label: "مرفقات المهام", icon: "✅", n: total("task") },
    { key: "request", label: "مرفقات الطلبات", icon: "📨", n: total("request") + total("request_signed") },
    { key: "trash", label: "سلة المحذوفات", icon: "🗑️", n: trash.length },
  ];
  const collLabel = coll.startsWith("folder:") ? `📂 ${coll.slice(7)}` : colls.find(c => c.key === coll)?.label || "";

  function pickFiles(list: FileList | File[] | null) {
    const arr = Array.from(list || []).slice(0, 10); if (!arr.length) return;
    const big = arr.filter(f => f.size > 15 * 1048576); if (big.length) toast(`${big.length} ملف أكبر من 15MB واتشال`, "error");
    setUpFiles(arr.filter(f => f.size <= 15 * 1048576)); if (coll.startsWith("folder:")) setUpFolder(coll.slice(7));
  }
  function upload() {
    if (!upFiles.length) return;
    const fd = new FormData(); upFiles.forEach(f => fd.append("file", f)); fd.set("folder", upFolder); fd.set("visibility", upVis); fd.set("description", upDesc);
    const x = new XMLHttpRequest(); x.open("POST", "/api/library"); setProgress(0);
    x.upload.onprogress = e => e.lengthComputable && setProgress(Math.round(e.loaded / e.total * 100));
    x.onload = () => {
      setProgress(null); let j: any = null; try { j = JSON.parse(x.responseText); } catch { /* ignore */ }
      if (x.status >= 400 && !j?.created?.length) { toast(j?.rejected?.map((r: any) => `${r.name}: ${r.error}`).join("\n") || j?.error || "فشل الرفع", "error"); return; }
      toast(`اترفع ${j.created.length} ملف ✓${j.rejected?.length ? ` — اترفض ${j.rejected.length}` : ""}`, "success");
      if (upAskSign && j.created?.length) { void sendSignRequest(j.created.map((c: { id: string }) => ({ src: "lib", id: c.id })), upDesc, "signature", true); setUpAskSign(false); }
      setUpFiles([]); setUpDesc(""); void load();
    };
    x.onerror = () => { setProgress(null); toast("انقطع الاتصال أثناء الرفع", "error"); };
    x.send(fd);
  }
  async function saveEdit() {
    if (!sel || !edit) return;
    const r = await fetch(`/api/library/${sel.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(edit) });
    if (!r.ok) { const j = await r.json().catch(() => null); toast(j?.error || "فشل الحفظ", "error"); return; }
    toast("اتحفظ ✓", "success"); setSel({ ...sel, name: edit.name, folder: edit.folder, description: edit.description }); setEdit(null); void load();
  }
  async function setVisibility(v: "team" | "private") {
    if (!sel) return; await fetch(`/api/library/${sel.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ visibility: v }) });
    setSel({ ...sel, visibility: v }); void load();
  }
  const canManage = (f: LFile) => f.src === "lib" && (isAdmin || f.owner_id === userId);
  const canDelete = (f: LFile) => isAdmin || (["lib", "visit", "task"].includes(f.src) && f.owner_id === userId);
  const keyOf = (f: { src: string; id: string }) => `${f.src}:${f.id}`;
  const togglePick = (f: LFile) => setPicked(s => { const n = new Set(s); const k = keyOf(f); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  async function doDelete(list: LFile[]) {
    setDeleting(true);
    try {
      const r = await fetch("/api/library/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: list.map(f => ({ src: f.src, id: f.id })) }) });
      const j = await r.json().catch(() => null);
      if (!j?.deleted?.length) { toast(j?.failed?.[0]?.error || j?.error || "تعذر الحذف", "error"); return; }
      toast(`اتنقل ${j.deleted.length} ملف لسلة المحذوفات${j.failed?.length ? ` — ${j.failed.length} مش مسموح` : ""}`, "success");
      const gone = new Set<string>(j.deleted); setFiles(fs => fs.filter(f => !gone.has(keyOf(f))));
      if (sel && gone.has(keyOf(sel))) setSel(null);
      setPicked(new Set()); setSelecting(false); setConfirmDel(null); void load(); void loadTrash();
    } catch { toast("تعذر الاتصال بالخادم", "error"); } finally { setDeleting(false); }
  }
  async function restore(t: TrashItem) {
    const r = await fetch(`/api/library/trash/${t.id}`, { method: "POST" }); const j = await r.json().catch(() => null);
    if (!r.ok) { toast(j?.error || "تعذر الاسترجاع", "error"); return; }
    toast(`اترجع «${t.name}» لمكانه ✓`, "success"); void loadTrash(); void fetch(`/api/library?${new URLSearchParams()}`).then(r => r.json()).then(j => { setCounts(j.counts || []); setFolders(j.folders || []); }).catch(() => {});
  }
  async function purge(t: TrashItem) {
    if (!confirm(`حذف «${t.name}» نهائيًا؟ مش هتقدر ترجعه بعد كده.`)) return;
    const r = await fetch(`/api/library/trash/${t.id}`, { method: "DELETE" });
    if (!r.ok) { toast("مسموح للي حذفه أو المدير فقط", "error"); return; }
    toast("اتحذف نهائيًا", "success"); void loadTrash();
  }

  const sidebar = <nav className="space-y-1">
    {colls.map(c => <button key={c.key} onClick={() => setColl(c.key)} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-right text-sm font-bold transition ${coll === c.key ? "bg-[var(--navy)] text-white" : "hover:bg-white"}`}><span>{c.icon}</span><span className="flex-1">{c.label}</span><span className={`rounded-full px-2 text-[11px] ${coll === c.key ? "bg-white/20" : "bg-[var(--bg)] text-[var(--muted)]"}`}>{c.n}</span></button>)}
    {folders.length > 0 && <div className="pt-3"><div className="px-3 pb-1 text-[11px] font-bold text-[var(--muted)]">المجلدات</div>
      {folders.map(f => <button key={f.folder} onClick={() => setColl(`folder:${f.folder}`)} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-right text-sm transition ${coll === `folder:${f.folder}` ? "bg-[var(--sky-light)] font-bold text-[var(--navy)]" : "hover:bg-white"}`}><span>📂</span><span className="flex-1 truncate">{f.folder}</span><span className="text-[11px] text-[var(--muted)]">{f.n}</span></button>)}</div>}
    <div className="mt-4 rounded-2xl bg-white p-3 text-[11px] text-[var(--muted)]"><div className="font-bold text-[var(--navy)]">المساحة</div>{fmtSize(bytes)} في {total()} ملف</div>
  </nav>;

  const fileCard = (f: LFile) => { const m = typeMeta(f.mime, f.name); const on = picked.has(keyOf(f)); return <div key={`${f.src}:${f.id}`} onClick={() => selecting ? (canDelete(f) && togglePick(f)) : openFile(f)} className={`group relative cursor-pointer overflow-hidden rounded-2xl border bg-white transition hover:-translate-y-0.5 hover:shadow-lg ${on ? "border-red-400 ring-2 ring-red-200" : sel?.id === f.id && sel.src === f.src ? "border-[var(--navy)] ring-2 ring-[var(--navy)]/15" : "border-[var(--border)]"} ${selecting && !canDelete(f) ? "opacity-40" : ""}`}>
    {selecting && canDelete(f) && <span className={`absolute bottom-[7.2rem] left-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border-2 text-xs font-bold ${on ? "border-red-500 bg-red-500 text-white" : "border-slate-300 bg-white"}`}>{on ? "✓" : ""}</span>}
    <Thumb f={f} className="h-36 border-b border-[var(--border)]" />
    <span className={`absolute left-2 top-2 rounded-md border px-1.5 py-0.5 text-[10px] font-extrabold ${m.tone}`}>{m.label}</span>
    {f.signed && <span className="absolute right-2 top-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white shadow">🖋️ موقّع</span>}
    <div className="p-3">
      <div className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-5" dir="auto" title={f.name}>{shortName(f.name)}</div>
      <div className="mt-1 truncate text-[11px] text-[var(--muted)]">{f.ctx}</div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--muted)]"><span>{fmtSize(f.size)}</span><span>{fmtDate(f.created_at)}</span></div>
    </div>
    <div className={`absolute inset-x-2 top-24 flex justify-center gap-1.5 opacity-0 transition ${selecting ? "hidden" : "group-hover:opacity-100"}`} onClick={e => e.stopPropagation()}>
      <a href={fileUrl(f, true)} className="rounded-lg bg-white/95 px-2.5 py-1 text-xs font-bold shadow">⬇ تنزيل</a>
      {canSign(f.mime) && <button onClick={() => setSigning(f)} className="rounded-lg bg-[var(--navy)] px-2.5 py-1 text-xs font-bold text-white shadow">🖋️ وقّع</button>}
      {canDelete(f) && <button onClick={() => setConfirmDel([f])} className="rounded-lg bg-white/95 px-2 py-1 text-xs font-bold text-red-600 shadow" title="حذف">🗑️</button>}
    </div>
  </div>; };

  const fileRow = (f: LFile) => { const m = typeMeta(f.mime, f.name); const on = picked.has(keyOf(f)); return <tr key={`${f.src}:${f.id}`} onClick={() => selecting ? (canDelete(f) && togglePick(f)) : openFile(f)} className={`cursor-pointer border-t border-[var(--border)] hover:bg-[var(--sky-light)]/50 ${on ? "bg-red-50" : sel?.id === f.id && sel.src === f.src ? "bg-[var(--sky-light)]" : ""} ${selecting && !canDelete(f) ? "opacity-40" : ""}`}>
    <td className="p-3"><div className="flex items-center gap-3">{selecting && <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 text-[10px] ${on ? "border-red-500 bg-red-500 text-white" : "border-slate-300"} ${canDelete(f) ? "" : "invisible"}`}>{on ? "✓" : ""}</span>}<span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-[10px] font-extrabold ${m.tone}`}>{m.label}</span><div className="min-w-0"><div className="truncate font-bold" dir="auto">{shortName(f.name)}</div><div className="truncate text-[11px] text-[var(--muted)]">{f.ctx}</div></div>{f.signed && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">موقّع</span>}</div></td>
    {device !== "phone" && <td className="p-3 text-xs text-[var(--muted)]">{f.owner_name || "—"}</td>}
    {device !== "phone" && <td className="p-3 text-xs text-[var(--muted)]">{fmtSize(f.size)}</td>}
    <td className="p-3 text-xs text-[var(--muted)]">{fmtDate(f.created_at)}</td>
    <td className="p-3" onClick={e => e.stopPropagation()}><div className="flex justify-end gap-1"><a href={fileUrl(f, true)} className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-bold" title="تنزيل">⬇</a>{canSign(f.mime) && <button onClick={() => setSigning(f)} className="rounded-lg bg-[var(--navy)] px-2 py-1 text-xs font-bold text-white" title="توقيع">🖋️</button>}{canDelete(f) && <button onClick={() => setConfirmDel([f])} className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600" title="حذف">🗑️</button>}</div></td>
  </tr>; };

  const preview = sel && <div className="space-y-3">
    <div className="flex items-start gap-3"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-xs font-extrabold ${typeMeta(sel.mime, sel.name).tone}`}>{typeMeta(sel.mime, sel.name).label}</span>
      <div className="min-w-0 flex-1"><div className="break-words font-extrabold text-[var(--navy)]" dir="auto">{shortName(sel.name)}</div><div className="text-xs text-[var(--muted)]">{fmtSize(sel.size)} · {fmtDate(sel.created_at, true)}</div></div>
      <button onClick={() => setSel(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-lg">×</button></div>
    {!isAdmin && canSign(sel.mime) && !sel.signed && <button onClick={() => { setReqFor(sel); setReqNote(""); setReqWant("signature"); }} className={`${btn} w-full border border-[var(--sky-border)] bg-[var(--sky-light)] text-[var(--navy)]`}>📨 اطلب توقيع / ختم المدير</button>}
    <div className="grid grid-cols-2 gap-2"><a href={fileUrl(sel, true)} className={primary}>⬇ تنزيل</a>{canSign(sel.mime) ? <button onClick={() => setSigning(sel)} className={`${btn} bg-emerald-600 text-white`}>🖋️ توقيع / ختم</button> : <a href={fileUrl(sel)} target="_blank" rel="noreferrer" className={ghost}>↗ فتح</a>}</div>
    {sel.signed && detail?.file?.sign_meta?.ref && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs"><div className="font-extrabold text-emerald-800">🖋️ مستند موقّع</div><div className="mt-1 space-y-0.5 text-emerald-900/80"><div>بواسطة {detail.file.sign_meta.signer} · {fmtDate(detail.file.sign_meta.signed_at, true)}</div><div>الرقم المرجعي: <span className="font-mono font-bold">{detail.file.sign_meta.ref}</span></div><div>الأصل: <span dir="auto">{detail.file.sign_meta.source?.name}</span></div><div className="truncate font-mono text-[10px]" title={detail.file.sha256}>SHA-256: {detail.file.sha256}</div></div><a href={`/verify?ref=${detail.file.sign_meta.ref}`} target="_blank" rel="noreferrer" className="mt-2 inline-block font-bold text-emerald-800 underline">صفحة التحقق العامة ↗</a></div>}
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-2">
      {sel.mime === "application/pdf" ? <PdfPages f={sel} /> : sel.mime.startsWith("image/") && sel.mime !== "image/heic" ? <img src={fileUrl(sel)} alt="" className="mx-auto max-h-[420px] rounded-xl object-contain" /> : <div className="p-8 text-center text-sm text-[var(--muted)]">المعاينة غير متاحة لهذا النوع — نزّل الملف وافتحه</div>}
    </div>
    <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-white text-sm">
      <div className="flex justify-between gap-2 p-3"><span className="text-[var(--muted)]">المصدر</span><span className="text-left font-bold">{SRC_META[sel.src]?.icon} {SRC_META[sel.src]?.label}</span></div>
      <div className="flex justify-between gap-2 p-3"><span className="shrink-0 text-[var(--muted)]">مرتبط بـ</span>{sel.ctx_url ? <a href={sel.ctx_url} className="truncate font-bold text-[var(--navy)] underline">{sel.ctx}</a> : <span className="truncate font-bold">{sel.ctx}</span>}</div>
      <div className="flex justify-between gap-2 p-3"><span className="text-[var(--muted)]">رفعه</span><span className="font-bold">{sel.owner_name || "—"}</span></div>
      {sel.src === "lib" && <div className="flex items-center justify-between gap-2 p-3"><span className="text-[var(--muted)]">الظهور</span>{canManage(sel) ? <div className="flex rounded-lg bg-[var(--bg)] p-0.5 text-xs font-bold">{(["team", "private"] as const).map(v => <button key={v} onClick={() => void setVisibility(v)} className={`rounded-md px-2.5 py-1 ${sel.visibility === v ? "bg-white text-[var(--navy)] shadow" : "text-[var(--muted)]"}`}>{v === "team" ? "👥 الفريق" : "🔒 أنا فقط"}</button>)}</div> : <span className="font-bold">{sel.visibility === "team" ? "👥 الفريق" : "🔒 خاص"}</span>}</div>}
      {sel.description && <div className="p-3 text-xs text-[var(--muted)]">{sel.description}</div>}
    </div>
    {detail?.signedCopies?.length > 0 && <div className="rounded-2xl border border-[var(--border)] bg-white p-3"><div className="mb-2 text-sm font-extrabold text-[var(--navy)]">النسخ الموقعة ({detail.signedCopies.length})</div>{detail.signedCopies.map((s: any) => <button key={s.id} onClick={() => openFile({ ...sel, id: s.id, src: "lib", name: s.name, signed: true, mime: "application/pdf", created_at: s.created_at, ctx: "نسخة موقعة / مختومة" })} className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-right text-xs hover:bg-[var(--bg)]"><span>🖋️</span><span className="flex-1 truncate" dir="auto">{s.name}</span><span className="font-mono text-[10px] text-[var(--muted)]">{s.ref}</span></button>)}</div>}
    {canManage(sel) && (edit ? <div className="space-y-2 rounded-2xl border border-[var(--border)] bg-white p-3">
      <input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} className={field} placeholder="اسم الملف" />
      <input value={edit.folder} onChange={e => setEdit({ ...edit, folder: e.target.value })} list="lib-folders" className={field} placeholder="المجلد" />
      <textarea value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} rows={2} className="w-full rounded-xl border border-[var(--border)] p-3 text-sm" placeholder="وصف" />
      <div className="flex gap-2"><button onClick={() => setEdit(null)} className={`${ghost} flex-1`}>إلغاء</button><button onClick={() => void saveEdit()} className={`${primary} flex-1`}>حفظ</button></div>
    </div> : <div className="flex gap-2"><button onClick={() => setEdit({ name: sel.name, folder: sel.folder, description: sel.description || "" })} className={`${ghost} flex-1`}>✎ تعديل البيانات</button></div>)}
    {canDelete(sel) && <button onClick={() => setConfirmDel([sel])} className={`${btn} w-full border border-red-200 bg-white text-red-600 hover:bg-red-50`}>🗑️ حذف الملف</button>}
  </div>;

  return <div className="mt-4 space-y-3 pb-20 lg:pb-0" onDragOver={e => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } }} onDragLeave={e => { if (e.currentTarget === e.target) setDragOver(false); }} onDrop={e => { e.preventDefault(); setDragOver(false); pickFiles(e.dataTransfer.files); }}>
    <datalist id="lib-folders">{["عام", "عقود", "فواتير", "عروض أسعار", "تسجيلات وتراخيص", "مستندات الأطباء", ...folders.map(f => f.folder)].filter((v, i, a) => a.indexOf(v) === i).map(f => <option key={f} value={f} />)}</datalist>
    <div className={`${card} flex flex-wrap items-center gap-2 p-2.5 shadow-sm`}>
      <input value={q} onChange={e => { setQ(e.target.value); if (qTimer.current) clearTimeout(qTimer.current); const v = e.target.value; qTimer.current = setTimeout(() => setQLive(v.trim()), 300); }} placeholder="🔎 دوّر باسم الملف أو الطبيب أو المهمة أو صاحب الملف" className={`${field} min-w-[200px] flex-1`} />
      <div className="flex rounded-xl bg-[var(--bg)] p-1 text-sm font-bold">{[["", "الكل"], ["pdf", "PDF"], ["image", "صور"], ["office", "Office"]].map(([k, l]) => <button key={k} onClick={() => setType(k)} className={`rounded-lg px-3 py-1.5 ${type === k ? "bg-white text-[var(--navy)] shadow" : "text-[var(--muted)]"}`}>{l}</button>)}</div>
      <select value={sort} onChange={e => setSort(e.target.value)} className={`${field} !w-auto`}><option value="new">الأحدث</option><option value="old">الأقدم</option><option value="name">الاسم</option><option value="size">الأكبر</option></select>
      <div className="hidden rounded-xl bg-[var(--bg)] p-1 sm:flex">{(["grid", "list"] as const).map(v => <button key={v} onClick={() => setView(v)} className={`rounded-lg px-2.5 py-1.5 text-sm ${view === v ? "bg-white shadow" : "text-[var(--muted)]"}`} title={v === "grid" ? "شبكة" : "قائمة"}>{v === "grid" ? "▦" : "☰"}</button>)}</div>
      {coll !== "trash" && coll !== "signreq" && <button onClick={() => { setSelecting(v => !v); setPicked(new Set()); }} className={selecting ? `${btn} bg-red-50 text-red-700 border border-red-200` : ghost}>{selecting ? "إلغاء التحديد" : "☑ تحديد"}</button>}
      <button onClick={() => setAssetsOpen(true)} className={ghost}>✍️ توقيعاتي</button>
      <label className={`${primary} cursor-pointer`}>⬆ رفع ملفات<input type="file" multiple className="hidden" onChange={e => { pickFiles(e.target.files); e.target.value = ""; }} /></label>
    </div>
    {device !== "desktop" && <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">{[...colls, ...folders.map(f => ({ key: `folder:${f.folder}`, label: f.folder, icon: "📂", n: f.n }))].map(c => <button key={c.key} onClick={() => setColl(c.key)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${coll === c.key ? "bg-[var(--navy)] text-white" : "bg-white"}`}>{c.icon} {c.label} <span className="opacity-60">{c.n}</span></button>)}</div>}
    <div className={device === "desktop" ? `grid items-start gap-3 ${sel ? "grid-cols-[230px_1fr_400px]" : "grid-cols-[230px_1fr]"}` : ""}>
      {device === "desktop" && <aside className="sticky top-3">{sidebar}</aside>}
      <main className="min-w-0 space-y-3">
        <div className="flex items-center justify-between px-1"><div className="font-extrabold text-[var(--navy)]">{collLabel} <span className="text-sm font-normal text-[var(--muted)]">· {coll === "trash" ? `${trash.length} ملف` : coll === "signreq" ? `${pendingReqs.length} مستني` : `${files.length} ملف`}</span></div>{loading && <span className="text-xs text-[var(--muted)]">جاري التحميل…</span>}</div>
        {coll === "signreq" ? <div className="space-y-2">
          <div className="rounded-2xl border border-[var(--sky-border)] bg-[var(--sky-light)] p-3 text-sm text-[var(--navy)]">{isAdmin ? "📨 المستندات اللي المناديب طالبين توقيعك أو ختمك عليها — اضغط «وقّع الآن» وهتتبعت النسخة الموقعة للمندوب تلقائيًا." : "📨 طلباتك للمدير بتوقيع أو ختم مستندات — من أي ملف اضغط «اطلب توقيع / ختم المدير»."}</div>
          {reqs.map(r => <div key={r.id} className={`rounded-2xl border bg-white p-3 ${r.status === "pending" ? "border-amber-200" : "border-[var(--border)]"}`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-[10px] font-extrabold ${typeMeta(reqFile(r).mime, r.file_name).tone}`}>{typeMeta(reqFile(r).mime, r.file_name).label}</span>
              <div className="min-w-0 flex-1"><button onClick={() => openFile(reqFile(r))} className="block max-w-full truncate text-right font-bold hover:underline" dir="auto">{shortName(r.file_name)}</button>
                <div className="truncate text-[11px] text-[var(--muted)]">{isAdmin ? `${r.requested_by_name} · ` : ""}طالب {WANT[r.want]} · {fmtDate(r.created_at, true)}</div></div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${REQ_ST[r.status]?.[1]}`}>{REQ_ST[r.status]?.[0]}</span>
              <div className="flex gap-1.5">
                {isAdmin && r.status === "pending" && <><button onClick={() => { setSignReq(r); setSigning(reqFile(r)); }} className={`${btn} bg-emerald-600 text-white`}>🖋️ وقّع الآن</button><button onClick={() => { setRejectFor(r); setRejectNote(""); }} className={`${btn} border border-red-200 bg-white text-red-600`}>رفض</button></>}
                {!isAdmin && r.status === "pending" && <button onClick={() => void decideReq(r, "cancel")} className={ghost}>إلغاء الطلب</button>}
                {r.status === "signed" && r.signed_file_id && <a href={fileUrl({ src: "lib", id: r.signed_file_id }, true)} className={primary}>⬇ النسخة الموقعة</a>}
              </div>
            </div>
            {r.note && <div className="mt-2 rounded-xl bg-[var(--bg)] px-3 py-2 text-xs">💬 {r.note}</div>}
            {r.status === "rejected" && r.admin_note && <div className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-800">سبب الرفض: {r.admin_note}</div>}
            {r.status === "signed" && <div className="mt-2 text-[11px] text-[var(--muted)]">وقّعه {r.decided_by_name} {r.decided_at ? fmtDate(r.decided_at, true) : ""}{r.ref ? <> · <span className="font-mono">Ref {r.ref}</span></> : null}</div>}
          </div>)}
          {!reqs.length && <div className={`${card} flex flex-col items-center gap-2 border-dashed p-12 text-center`}><div className="text-5xl">📨</div><div className="font-extrabold text-[var(--navy)]">مفيش طلبات توقيع</div></div>}
        </div> : coll === "trash" ? <div className="space-y-2">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">🗑️ الملفات المحذوفة بتفضل هنا {trashDays} يوم تقدر ترجّعها لمكانها الأصلي، وبعدها بتتمسح نهائي تلقائيًا.</div>
          {trash.map(t => { const m = typeMeta(t.mime, t.name); return <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-white p-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-[10px] font-extrabold ${m.tone}`}>{m.label}</span>
            <div className="min-w-0 flex-1"><div className="truncate font-bold" dir="auto">{shortName(t.name)}</div><div className="truncate text-[11px] text-[var(--muted)]">{t.src_label} · {t.ctx} · حذفه {t.deleted_by_name} {fmtDate(t.deleted_at, true)}</div></div>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${t.days_left <= 3 ? "bg-red-100 text-red-700" : "bg-[var(--bg)] text-[var(--muted)]"}`}>باقي {t.days_left} يوم</span>
            <div className="flex gap-1.5"><button onClick={() => void restore(t)} className={`${btn} bg-emerald-600 text-white`}>↩ استرجاع</button>{(isAdmin || t.deleted_by === userId) && <button onClick={() => void purge(t)} className={`${btn} border border-red-200 bg-white text-red-600`}>حذف نهائي</button>}</div>
          </div>; })}
          {!trash.length && <div className={`${card} flex flex-col items-center gap-2 border-dashed p-12 text-center`}><div className="text-5xl">🗑️</div><div className="font-extrabold text-[var(--navy)]">السلة فاضية</div></div>}
        </div> : !loading && !files.length ? <div className={`${card} flex flex-col items-center gap-2 border-dashed p-12 text-center`}><div className="text-5xl">🗂️</div><div className="font-extrabold text-[var(--navy)]">مفيش ملفات هنا</div><div className="text-sm text-[var(--muted)]">اسحب ملفات وأفلتها في أي مكان في الصفحة، أو استخدم «رفع ملفات»</div></div>
          : view === "grid" ? <div className={`grid gap-3 ${sel && device === "desktop" ? "grid-cols-2 2xl:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"}`}>{loading && !files.length ? Array.from({ length: 8 }, (_, i) => <div key={i} className="h-60 animate-pulse rounded-2xl bg-white" />) : files.map(fileCard)}</div>
            : <div className={`${card} overflow-hidden`}><table className="w-full text-sm"><thead className="bg-[var(--bg)] text-xs text-[var(--muted)]"><tr><th className="p-3 text-right">الملف</th>{device !== "phone" && <th className="p-3 text-right">صاحبه</th>}{device !== "phone" && <th className="p-3 text-right">الحجم</th>}<th className="p-3 text-right">التاريخ</th><th className="p-3" /></tr></thead><tbody>{files.map(fileRow)}</tbody></table></div>}
      </main>
      {device === "desktop" && sel && <aside className={`${card} sticky top-3 max-h-[calc(100vh-24px)] overflow-auto p-4`}>{preview}</aside>}
    </div>

    {device !== "desktop" && sel && <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 sm:items-center sm:justify-center sm:p-4" onClick={() => setSel(null)}><div onClick={e => e.stopPropagation()} className="max-h-[92vh] w-full overflow-auto rounded-t-3xl bg-[var(--bg)] p-4 sm:max-w-xl sm:rounded-3xl">{preview}</div></div>}

    {dragOver && <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-[var(--navy)]/80 backdrop-blur-sm"><div className="rounded-3xl border-4 border-dashed border-white/70 px-16 py-12 text-center text-white"><div className="text-5xl">⬆</div><div className="mt-3 text-xl font-extrabold">أفلت الملفات هنا</div><div className="text-sm text-white/70">PDF · صور · Word · Excel · PowerPoint · CSV — حتى 15MB</div></div></div>}

    {upFiles.length > 0 && <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/40 sm:items-center sm:p-4"><div className="w-full max-w-lg space-y-3 rounded-t-3xl bg-white p-5 sm:rounded-3xl">
      <div className="flex items-center justify-between"><div className="text-lg font-extrabold text-[var(--navy)]">رفع {upFiles.length} ملف</div><button disabled={progress !== null} onClick={() => setUpFiles([])} className="h-9 w-9 rounded-full border text-lg">×</button></div>
      <div className="max-h-48 space-y-1.5 overflow-auto">{upFiles.map((f, i) => <div key={i} className="flex items-center gap-2 rounded-xl bg-[var(--bg)] px-3 py-2 text-sm"><span className={`rounded-md border px-1.5 text-[10px] font-extrabold ${typeMeta(f.type, f.name).tone}`}>{typeMeta(f.type, f.name).label}</span><span className="min-w-0 flex-1 truncate" dir="auto">{f.name}</span><span className="text-[11px] text-[var(--muted)]">{fmtSize(f.size)}</span>{progress === null && <button onClick={() => setUpFiles(l => l.filter((_, j) => j !== i))} className="text-red-500">×</button>}</div>)}</div>
      <div className="grid gap-2 sm:grid-cols-2"><div><div className="mb-1 text-xs font-bold text-[var(--muted)]">المجلد</div><input value={upFolder} onChange={e => setUpFolder(e.target.value)} list="lib-folders" className={field} /></div>
        <div><div className="mb-1 text-xs font-bold text-[var(--muted)]">مين يشوفه</div><div className="flex h-11 rounded-xl bg-[var(--bg)] p-1 text-sm font-bold">{(["team", "private"] as const).map(v => <button key={v} onClick={() => setUpVis(v)} className={`flex-1 rounded-lg ${upVis === v ? "bg-white text-[var(--navy)] shadow" : "text-[var(--muted)]"}`}>{v === "team" ? "👥 الفريق" : "🔒 أنا فقط"}</button>)}</div></div></div>
      <input value={upDesc} onChange={e => setUpDesc(e.target.value)} placeholder="وصف (اختياري) — مثال: عقد توريد مستشفى الحبيب 2026" className={field} />
      {!isAdmin && <label className="flex items-center gap-2 rounded-xl bg-[var(--sky-light)] p-3 text-sm font-bold text-[var(--navy)]"><input type="checkbox" checked={upAskSign} onChange={e => setUpAskSign(e.target.checked)} className="h-4 w-4 accent-[var(--navy)]" />📨 اطلب من المدير يوقّع / يختم الملفات دي</label>}
      {progress !== null && <div><div className="h-2 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full bg-[var(--navy)] transition-all" style={{ width: `${progress}%` }} /></div><div className="mt-1 text-center text-xs text-[var(--muted)]">{progress < 100 ? `جاري الرفع ${progress}%` : "جاري الحفظ…"}</div></div>}
      <button disabled={progress !== null} onClick={upload} className={`${primary} w-full py-3`}>⬆ ارفع للمكتبة</button>
    </div></div>}

    {assetsOpen && <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/40 sm:items-center sm:p-4" onClick={() => setAssetsOpen(false)}><div onClick={e => e.stopPropagation()} className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-t-3xl bg-[var(--bg)] p-5 sm:rounded-3xl">
      <div className="mb-4 flex items-center justify-between"><div><div className="text-lg font-extrabold text-[var(--navy)]">توقيعاتي وأختامي</div><div className="text-xs text-[var(--muted)]">جهّزها مرة واحدة واستخدمها على أي مستند بضغطة</div></div><button onClick={() => setAssetsOpen(false)} className="h-9 w-9 rounded-full border bg-white text-lg">×</button></div>
      <AssetsManager assets={assets} canStamp={canStamp} reload={loadAssets} />
    </div></div>}

    {selecting && <div className={`fixed left-0 right-0 z-40 px-3 lg:right-[272px] ${device === "phone" ? "bottom-[4.75rem]" : "bottom-4"}`}><div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-white/95 p-2.5 shadow-xl backdrop-blur">
      <span className="px-2 text-sm font-extrabold text-[var(--navy)]">{picked.size} محدد</span>
      <button onClick={() => setPicked(new Set(files.filter(canDelete).map(keyOf)))} className={ghost}>تحديد الكل ({files.filter(canDelete).length})</button>
      {picked.size > 0 && <button onClick={() => setPicked(new Set())} className={ghost}>مسح التحديد</button>}
      <button disabled={!picked.size} onClick={() => setConfirmDel(files.filter(f => picked.has(keyOf(f))))} className={`${btn} mr-auto bg-red-600 text-white`}>🗑️ حذف المحدد</button>
    </div></div>}

    {confirmDel && <div className="fixed inset-0 z-[65] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4" onClick={() => !deleting && setConfirmDel(null)}><div onClick={e => e.stopPropagation()} className="w-full max-w-md space-y-3 rounded-t-3xl bg-white p-5 sm:rounded-3xl">
      <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl">🗑️</span><div><div className="text-lg font-extrabold text-[var(--navy)]">{confirmDel.length === 1 ? "حذف الملف؟" : `حذف ${confirmDel.length} ملف؟`}</div><div className="text-xs text-[var(--muted)]">هيتنقل لسلة المحذوفات وتقدر ترجعه خلال {trashDays} يوم</div></div></div>
      {confirmDel.length <= 4 ? <div className="space-y-1">{confirmDel.map(f => <div key={keyOf(f)} className="truncate rounded-xl bg-[var(--bg)] px-3 py-2 text-sm" dir="auto">{shortName(f.name)}</div>)}</div> : <div className="rounded-xl bg-[var(--bg)] px-3 py-2 text-sm">{confirmDel.slice(0, 3).map(f => shortName(f.name)).join("، ")} و{confirmDel.length - 3} كمان</div>}
      {(() => { const w: string[] = []; const has = (s: string) => confirmDel.some(f => f.src === s);
        if (has("visit")) w.push("مرفقات الزيارات هتتشال من الزيارة نفسها كمان");
        if (has("task")) w.push("مرفقات المهام هتتشال من المهمة نفسها");
        if (has("brochure")) w.push("البروشور هيختفي من صفحة المنتجات وعرض المنتج للمناديب");
        if (has("request") || has("request_signed")) w.push("الملف هيتشال من الطلب المرتبط بيه");
        return w.length ? <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{w.map(x => <li key={x}>⚠️ {x}</li>)}</ul> : null; })()}
      <div className="flex gap-2"><button disabled={deleting} onClick={() => setConfirmDel(null)} className={`${ghost} flex-1`}>إلغاء</button><button disabled={deleting} onClick={() => void doDelete(confirmDel)} className={`${btn} flex-1 bg-red-600 text-white`}>{deleting ? "جاري الحذف…" : "احذف"}</button></div>
    </div></div>}

    {reqFor && <div className="fixed inset-0 z-[65] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4" onClick={() => !reqBusy && setReqFor(null)}><div onClick={e => e.stopPropagation()} className="w-full max-w-md space-y-3 rounded-t-3xl bg-white p-5 sm:rounded-3xl">
      <div><div className="text-lg font-extrabold text-[var(--navy)]">📨 اطلب توقيع المدير</div><div className="truncate text-xs text-[var(--muted)]" dir="auto">{shortName(reqFor.name)}</div></div>
      <div><div className="mb-1 text-xs font-bold text-[var(--muted)]">محتاج إيه؟</div><div className="flex h-11 rounded-xl bg-[var(--bg)] p-1 text-sm font-bold">{Object.entries(WANT).map(([k, v]) => <button key={k} onClick={() => setReqWant(k)} className={`flex-1 rounded-lg ${reqWant === k ? "bg-white text-[var(--navy)] shadow" : "text-[var(--muted)]"}`}>{v}</button>)}</div></div>
      <textarea value={reqNote} onChange={e => setReqNote(e.target.value)} rows={3} placeholder="ملاحظة للمدير — مثال: عقد مستشفى الحبيب، محتاج الختم في الصفحة الأخيرة قبل الخميس" className="w-full rounded-xl border border-[var(--border)] p-3 text-sm" />
      <div className="flex gap-2"><button disabled={reqBusy} onClick={() => setReqFor(null)} className={`${ghost} flex-1`}>إلغاء</button><button disabled={reqBusy} onClick={async () => { setReqBusy(true); try { if (await sendSignRequest([{ src: reqFor.src, id: reqFor.id }], reqNote, reqWant)) setReqFor(null); } finally { setReqBusy(false); } }} className={`${primary} flex-1`}>{reqBusy ? "جاري…" : "ابعت الطلب"}</button></div>
    </div></div>}

    {rejectFor && <div className="fixed inset-0 z-[65] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4" onClick={() => setRejectFor(null)}><div onClick={e => e.stopPropagation()} className="w-full max-w-md space-y-3 rounded-t-3xl bg-white p-5 sm:rounded-3xl">
      <div className="text-lg font-extrabold text-[var(--navy)]">رفض طلب التوقيع</div><div className="truncate text-xs text-[var(--muted)]" dir="auto">{rejectFor.requested_by_name} · {shortName(rejectFor.file_name)}</div>
      <textarea autoFocus value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={3} placeholder="سبب الرفض — هيوصل للمندوب" className="w-full rounded-xl border border-[var(--border)] p-3 text-sm" />
      <div className="flex gap-2"><button onClick={() => setRejectFor(null)} className={`${ghost} flex-1`}>إلغاء</button><button onClick={() => void decideReq(rejectFor, "reject", rejectNote)} className={`${btn} flex-1 bg-red-600 text-white`}>ارفض</button></div>
    </div></div>}

    {signing && <SignStudio file={signing} requestId={signReq?.id} requestNote={signReq?.note} onClose={() => { setSigning(null); setSignReq(null); }} onDone={() => { void load(); void loadReqs(); }} />}
  </div>;
}
