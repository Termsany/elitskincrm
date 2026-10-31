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
    <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between gap-3 bg-gradient-to-l from-[var(--navy)] to-[#0b2a2f] px-3 text-white shadow-md sm:px-5 lg:hidden">
      <button type="button" aria-label="فتح قائمة التنقل" aria-expanded={open} onClick={() => setOpen(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 transition active:scale-95 focus-visible:outline-dashed"><Icon name="more" size={22} /></button>
      <div className="min-w-0 flex-1 text-center">
        <div className="font-display truncate text-sm font-semibold tracking-[0.2em]">ELITE <span className="text-[var(--sky)]">SKIN</span></div>
        <div className="mt-0.5 truncate text-[10px] text-white/60">{name}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1"><NotificationsBell role={role} /><MyAlertsBadge role={role} /></div>
    </header>

    <nav aria-label="التنقل السريع" className="es-tabbar fixed inset-x-0 bottom-0 z-50 grid min-h-[76px] grid-cols-5 items-end rounded-t-[26px] bg-white/95 px-2 pt-2 pb-[max(10px,env(safe-area-inset-bottom))] shadow-[0_-12px_32px_rgba(16,72,79,0.14)] backdrop-blur lg:hidden">
      {primaryItems.map((item) => {
        const current = item.href !== "#more" && isOn(item.href);
        if (item.href === "#more") {
          return <button key={item.href} type="button" onClick={() => setOpen(true)} className="es-tab focus-visible:outline-dashed"><span className="es-pill"><Icon name={item.icon} size={22} /></span><span className="es-tab-label">{item.label}</span></button>;
        }
        if (item.primary) {
          return <Link key={item.href} href={item.href} aria-label={item.label} className="es-fab-wrap focus-visible:outline-dashed">
            <span className="es-fab"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></span>
            <span className="es-tab-label">{item.label}</span>
          </Link>;
        }
        return <Link key={item.href} href={item.href} aria-current={current ? "page" : undefined} className="es-tab focus-visible:outline-dashed">
          <span className="es-pill"><Icon name={item.icon} size={22} /></span><span className="es-tab-label">{item.label}</span>
        </Link>;
      })}
    </nav>

    {open && <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="قائمة التنقل">
      <button type="button" aria-label="إغلاق قائمة التنقل" className="es-fade absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <aside className="es-drawer absolute inset-y-0 right-0 flex w-[min(88vw,360px)] flex-col overflow-y-auto bg-gradient-to-b from-[#0d3a40] to-[#0b1d20] p-4 text-white shadow-2xl sm:p-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div><Logo variant="lockup" tone="onDark" markSize={36} /><div className="mt-1 text-xs text-white/60">كل أقسام النظام</div></div>
          <button type="button" aria-label="إغلاق القائمة" onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 transition active:scale-95"><Icon name="x" size={20} /></button>
        </div>
        <nav aria-label="التنقل الرئيسي" className="es-nav mt-4 flex flex-col gap-1">
          {items.map((item, k) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} data-on={isOn(item.href) ? "1" : undefined} style={{ animationDelay: `${k * 30}ms` }} className={`es-link es-stagger ${isOn(item.href) ? "es-link-solid" : ""}`}><span className="es-ibox"><Icon name={item.icon} size={20} /></span><span className="es-label">{item.label}</span></Link>)}
        </nav>
        <div className="mt-auto border-t border-white/10 pt-4"><button type="button" disabled={loggingOut} onClick={() => void logout()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-red-500/90 px-4 text-sm font-extrabold text-white disabled:opacity-60">{loggingOut ? "جارٍ تسجيل الخروج…" : "تسجيل خروج"}<span aria-hidden="true">↪</span></button></div>
      </aside>
    </div>}
  </>;
}
