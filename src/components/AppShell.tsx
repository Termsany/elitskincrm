import Link from "next/link";
import MyAlertsBadge from "./MyAlertsBadge";
import NotificationsBell from "./NotificationsBell";
import MobileNav from "./MobileNav";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import CommandPalette, { PaletteButton } from "@/components/CommandPalette";

type NavItem = { href: string; label: string; icon: string; show: boolean; group: "primary" | "more" };

export function AppShell({ role, email, name, jobTitle, productName, children, active }: { role: string; email: string; name: string; jobTitle?: string; productName: string | null; children: React.ReactNode; active?: string }) {
  const isAdmin = role === "admin";
  const NAV: NavItem[] = [
    // ── primary (always visible) ──
    { href: isAdmin ? "/admin" : "/", label: "الرئيسية", icon: "dashboard", show: true, group: "primary" },
    { href: "/visits/new", label: "تسجيل زيارة", icon: "new-visit", show: !isAdmin, group: "primary" },
    { href: "/doctors", label: "الأطباء والعيادات", icon: "doctors", show: true, group: "primary" },
    { href: "/visits", label: "الزيارات", icon: "visits", show: true, group: "primary" },
    { href: "/calendar", label: "مخطط العمل", icon: "calendar", show: true, group: "primary" },
    { href: "/plans", label: "الخطط والاعتماد", icon: "plans", show: true, group: "primary" },
    { href: "/products", label: "المنتجات", icon: "products", show: !isAdmin, group: "primary" },
    { href: "/sales", label: "المبيعات والأهداف", icon: "sales", show: true, group: "primary" },
    { href: "/library", label: "مكتبة المستندات", icon: "library", show: true, group: "primary" },
    { href: "/admin/reps", label: "المناديب", icon: "reps", show: isAdmin, group: "primary" },
    { href: "/admin/reports", label: "التقارير", icon: "reports", show: isAdmin, group: "primary" },
    // ── more (secondary, collapsed) ──
    { href: "/work", label: "مركز العمل", icon: "work", show: !isAdmin, group: "more" },
    
    { href: "/admin/products", label: "المنتجات", icon: "products", show: isAdmin, group: "more" },
    { href: "/account", label: "حسابي", icon: "account", show: true, group: "more" },
  ];
  const items = NAV.filter((n) => n.show);
  const primary = items.filter((n) => n.group === "primary");
  const more = items.filter((n) => n.group === "more");
  const isOn = (href: string) => active === href || (!!active && href !== "/" && href !== "/admin" && active.startsWith(href));
  const linkCls = (href: string) => `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${isOn(href) ? "bg-[rgba(51,179,166,0.16)] text-[var(--sky)]" : "text-white/90 hover:bg-white/10"}`;

  return <div className="min-h-screen flex flex-col lg:flex-row" dir="rtl">
    <div className="fixed top-3 left-3 z-50 hidden lg:block"><NotificationsBell role={role}/></div>
    <aside className="hidden lg:flex w-[272px] shrink-0 flex-col bg-[var(--navy)] text-white p-7 gap-6 sticky top-0 h-screen overflow-auto">
      <div className="flex justify-center py-1"><Logo variant="stacked" tone="onDark" markSize={46} tagline="نظام إدارة الزيارات الطبية" /></div>
      {isAdmin && <PaletteButton />}
      <nav className="flex flex-col gap-1.5 mt-2">
        {primary.map((n) => <Link key={n.href} href={n.href} className={linkCls(n.href)}><Icon name={n.icon} size={18} className="shrink-0 opacity-90" /><span>{n.label}</span></Link>)}
        {more.length > 0 && <details open={more.some((n) => isOn(n.href))} className="group mt-1">
          <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/10">
            <Icon name="more" size={18} className="shrink-0 opacity-90" />
            <span>المزيد</span>
            <span className="mr-auto text-[10px] opacity-60 transition group-open:rotate-180">▾</span>
          </summary>
          <div className="mt-1 flex flex-col gap-1 border-r border-white/10 pr-2">
            {more.map((n) => <Link key={n.href} href={n.href} className={linkCls(n.href)}><Icon name={n.icon} size={18} className="shrink-0 opacity-90" /><span>{n.label}</span></Link>)}
          </div>
        </details>}
      </nav>
      <div className="px-1"><MyAlertsBadge role={role}/></div>
      <div className="mt-auto rounded-2xl bg-white/10 p-3"><div className="text-sm font-bold">{name}</div><div className="break-all text-xs text-[var(--sky)]">{email}</div><div className="mt-1 text-[11px] text-white/70">{isAdmin?"مدير النظام":(jobTitle||"مندوب")}</div>{!isAdmin&&productName&&<div className="mt-1 text-[10px] text-white/55">{productName}</div>}<form action="/api/auth/logout" method="post" className="mt-3"><button formAction={async()=>{"use server";const{destroySession}=await import("@/lib/session");await destroySession();}} className="w-full rounded-full bg-white/15 py-2 text-xs font-bold hover:bg-white/20">تسجيل خروج</button></form></div>
    </aside>
    <div className="flex min-w-0 flex-1 flex-col"><MobileNav items={items} active={active} name={name} role={role}/><main className="flex-1 p-4 pb-28 sm:p-5 sm:pb-28 lg:p-8 lg:pb-8">{children}</main></div>
    {isAdmin && <CommandPalette />}
  </div>;
}
