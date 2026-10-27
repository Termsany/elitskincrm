"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { dashboardMobileLinks } from "@/lib/dashboard-workspace";
import NotificationsBell from "./NotificationsBell";
import MyAlertsBadge from "./MyAlertsBadge";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";

type Item = { href: string; label: string; icon: string };

export default function MobileNav({ items, active, name, role }: { items: Item[]; active?: string; name: string; role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const isAdmin = role === "admin";
  const primaryItems = dashboardMobileLinks(isAdmin ? "admin" : "sales_rep");
  const isOn = (href: string) => active === href || (href !== "/" && href !== "/admin" && !!active && active.startsWith(href));

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return <>
    <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between gap-3 bg-[var(--navy)] px-3 text-white shadow-md sm:px-5 lg:hidden">
      <button type="button" aria-label="فتح قائمة التنقل" aria-expanded={open} onClick={() => setOpen(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xl leading-none focus-visible:outline-dashed">☰</button>
      <div className="min-w-0 flex-1 text-center">
        <div className="font-display truncate text-sm font-semibold tracking-[0.2em]">ELITE <span className="text-[var(--gold)]">SKIN</span></div>
        <div className="mt-0.5 truncate text-[10px] text-[var(--gold)]">{name}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1"><NotificationsBell role={role} /><MyAlertsBadge role={role} /></div>
    </header>

    <nav aria-label="التنقل السريع" className="fixed inset-x-0 bottom-0 z-50 grid min-h-[74px] grid-cols-5 items-center border-t border-[var(--border)] bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_rgba(43,38,48,0.12)] backdrop-blur lg:hidden">
      {primaryItems.map((item) => {
        const current = item.href !== "#more" && isOn(item.href);
        if (item.href === "#more") {
          return <button key={item.href} type="button" onClick={() => setOpen(true)} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-extrabold text-[var(--muted)] focus-visible:outline-dashed"><Icon name={item.icon} size={22} />{item.label}</button>;
        }
        return <Link key={item.href} href={item.href} aria-current={current ? "page" : undefined} className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-extrabold transition focus-visible:outline-dashed ${item.primary ? "mx-auto -mt-7 h-16 w-16 bg-[var(--gold)] text-[var(--navy)] shadow-lg ring-4 ring-white" : current ? "bg-[var(--sky-soft)] text-[var(--sky-deep)]" : "text-[var(--muted)]"}`}>
          <Icon name={item.icon} size={item.primary ? 26 : 22} />{item.label}
        </Link>;
      })}
    </nav>

    {open && <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="قائمة التنقل">
      <button type="button" aria-label="إغلاق قائمة التنقل" className="absolute inset-0 bg-black/55" onClick={() => setOpen(false)} />
      <aside className="absolute inset-y-0 right-0 flex w-[min(88vw,360px)] flex-col overflow-y-auto bg-[var(--navy)] p-4 text-white shadow-2xl sm:p-5">
        <div className="flex items-center justify-between border-b border-white/15 pb-4">
          <div><Logo variant="lockup" tone="onDark" markSize={36} /><div className="mt-1 text-xs text-white/60">كل أقسام النظام</div></div>
          <button type="button" aria-label="إغلاق القائمة" onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-2xl">×</button>
        </div>
        <nav aria-label="التنقل الرئيسي" className="mt-4 flex flex-col gap-1.5">
          {items.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-bold transition ${isOn(item.href) ? "bg-[var(--gold)] text-[var(--navy)]" : "text-white/90 hover:bg-white/10"}`}><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10"><Icon name={item.icon} size={18} /></span><span>{item.label}</span>{isOn(item.href) && <span className="mr-auto text-xs">●</span>}</Link>)}
        </nav>
        <div className="mt-auto border-t border-white/15 pt-4"><button type="button" disabled={loggingOut} onClick={() => void logout()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-red-500/90 px-4 text-sm font-extrabold text-white disabled:opacity-60">{loggingOut ? "جارٍ تسجيل الخروج…" : "تسجيل خروج"}<span aria-hidden="true">↪</span></button></div>
      </aside>
    </div>}
  </>;
}
