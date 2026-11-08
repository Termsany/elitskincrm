"use client";
import { useCallback, useEffect, useState } from "react";
import { Card, Button } from "@/components/ui";

type Req = { id: string; requested_at: string; name: string; email: string; role: string };

/** Pending "forgot password" requests: one click sets a new password to hand to the user. */
export default function ResetRequestsCard() {
  const [rows, setRows] = useState<Req[]>([]);
  const [done, setDone] = useState<Record<string, { name: string; email: string; password: string }>>({});
  const [busy, setBusy] = useState("");
  const load = useCallback(() => { fetch("/api/admin/password-resets", { cache: "no-store" }).then(r => r.json()).then(j => setRows(j.requests || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  async function act(r: Req, action: "reset" | "dismiss") {
    setBusy(r.id);
    const res = await fetch("/api/admin/password-resets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: r.id, action }) });
    const j = await res.json().catch(() => null);
    setBusy("");
    if (!res.ok) { alert(j?.error || "تعذر التنفيذ"); load(); return; }
    if (action === "reset") setDone(d => ({ ...d, [r.id]: { name: r.name, email: r.email, password: j.password } }));
    setRows(x => x.filter(y => y.id !== r.id));
  }
  const doneList = Object.entries(done);
  if (!rows.length && !doneList.length) return null;
  return (
    <Card className="mt-4 border-amber-300 bg-amber-50/60 p-4">
      <div className="mb-2 font-extrabold text-[var(--navy)]">طلبات نسيان كلمة السر</div>
      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
            <div className="min-w-0 flex-1">
              <div className="font-bold">{r.name}</div>
              <div className="text-xs text-[var(--muted)]" dir="ltr">{r.email}</div>
            </div>
            <Button type="button" disabled={busy === r.id} onClick={() => void act(r, "reset")} className="!px-3 !py-1.5 text-xs">تعيين كلمة سر جديدة</Button>
            <Button type="button" variant="outline" disabled={busy === r.id} onClick={() => void act(r, "dismiss")} className="!px-3 !py-1.5 text-xs">تجاهل</Button>
          </div>
        ))}
        {doneList.map(([id, d]) => (
          <div key={id} className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm">
            كلمة السر الجديدة لـ <b>{d.name}</b> — ابعتهاله دلوقتي، مش هتظهر تاني:
            <div className="mt-1 flex items-center gap-2"><code dir="ltr" className="rounded bg-white px-2 py-1 text-base font-bold tracking-wide">{d.password}</code>
              <Button type="button" variant="outline" className="!px-3 !py-1 text-xs" onClick={() => void navigator.clipboard?.writeText(d.password)}>نسخ</Button></div>
          </div>
        ))}
      </div>
    </Card>
  );
}
