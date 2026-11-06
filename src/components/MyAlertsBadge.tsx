"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";

/** Rep-only: number of doctors past their visit frequency (not paused, not already planned). */
export default function MyAlertsBadge({ role }: { role: string }) {
  const [count, setCount] = useState(0);
  const load = useCallback(() => { fetch("/api/my/alerts/count", { cache: "no-store" }).then(r => r.json()).then(j => setCount(Number(j.count) || 0)).catch(() => {}); }, []);
  useEffect(() => {
    if (role === "admin") return;
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    const onFocus = () => document.visibilityState === "visible" && load();
    window.addEventListener("focus", onFocus); document.addEventListener("visibilitychange", onFocus); window.addEventListener("es:alerts-changed", load);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); window.removeEventListener("es:alerts-changed", load); };
  }, [role, load]);
  if (role === "admin" || count === 0) return null;
  return (
    <Link href="/my/alerts" title="أطباء عدّى ميعاد زيارتهم ومش في خطتك" aria-label={`${count} طبيب متأخر عن ميعاد زيارته`}
      className="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-amber-100 border border-amber-300 px-3 py-2 text-xs font-bold text-amber-900 transition hover:bg-amber-200">
      <Icon name="warn" size={14} /><span>{count} {count === 1 ? "طبيب متأخر" : "أطباء متأخرين"}</span>
    </Link>
  );
}
