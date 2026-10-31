import MyAlertsBadge from "./MyAlertsBadge";
import NotificationsBell from "./NotificationsBell";
import MobileNav from "./MobileNav";
import SidebarNav, { SidebarToggle } from "./SidebarNav";
import { Logo } from "@/components/Logo";
import CommandPalette, { PaletteButton } from "@/components/CommandPalette";

type NavItem = { href: string; label: string; icon: string; show: boolean; group: "primary" | "more" };

// Applies the saved collapsed state before first paint (no layout jump).
const SB_BOOT = `try{if(localStorage.getItem('es-sb')==='c')document.documentElement.dataset.sb='c'}catch(e){}`;

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
  const strip = ({ href, label, icon }: NavItem) => ({ href, label, icon });
  const primary = items.filter((n) => n.group === "primary").map(strip);
  const more = items.filter((n) => n.group === "more").map(strip);
  const initials = name.split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();

  return <div className="min-h-screen flex flex-col lg:flex-row" dir="rtl">
    <script dangerouslySetInnerHTML={{ __html: SB_BOOT }} />
    <div className="fixed top-3 left-3 z-50 hidden lg:block"><NotificationsBell role={role}/></div>
    <aside className="es-sidebar hidden lg:flex shrink-0 flex-col text-white sticky top-0 h-screen">
      <div className="es-head flex items-center justify-between gap-2">
        <div className="es-hide"><Logo variant="lockup" tone="onDark" markSize={38} tagline="نظام إدارة الزيارات الطبية" /></div>
        <div className="es-show-c"><Logo variant="mark" tone="onDark" markSize={40} /></div>
        <SidebarToggle />
      </div>
      {isAdmin && <PaletteButton />}
      <SidebarNav primary={primary} more={more} active={active} />
      <div className="es-hide px-1"><MyAlertsBadge role={role}/></div>
      <div className="es-user mt-auto rounded-2xl bg-white/[0.07] p-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--sky)] text-xs font-extrabold text-[#0b1d20]" title={name}>{initials || "ES"}</div>
          <div className="es-hide min-w-0 flex-1"><div className="truncate text-sm font-bold">{name}</div><div className="truncate text-[11px] text-[var(--sky)]">{isAdmin?"مدير النظام":(jobTitle||"مندوب")}</div>{!isAdmin&&productName&&<div className="truncate text-[10px] text-white/55">{productName}</div>}</div>
        </div>
        <div className="es-hide mt-1 truncate px-1 text-[10px] text-white/45" dir="ltr">{email}</div>
        <form action="/api/auth/logout" method="post" className="es-hide mt-2"><button formAction={async()=>{"use server";const{destroySession}=await import("@/lib/session");await destroySession();}} className="w-full rounded-full bg-white/10 py-2 text-xs font-bold transition hover:bg-white/20">تسجيل خروج</button></form>
      </div>
    </aside>
    <div className="flex min-w-0 flex-1 flex-col"><MobileNav items={items} active={active} name={name} role={role}/><main className="flex-1 p-4 pb-28 sm:p-5 sm:pb-28 lg:p-8 lg:pb-8">{children}</main></div>
    {isAdmin && <CommandPalette />}
  </div>;
}
