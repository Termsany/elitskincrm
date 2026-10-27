import Link from "next/link";
import MyAlertsBadge from "./MyAlertsBadge";
import NotificationsBell from "./NotificationsBell";
import MobileNav from "./MobileNav";

type NavItem={href:string;label:string;icon:string;show:boolean};
export function AppShell({ role, email, name, jobTitle, productName, children, active }: { role: string; email: string; name: string; jobTitle?: string; productName: string | null; children: React.ReactNode; active?: string }) {
  const isAdmin = role === "admin";
  const NAV:NavItem[] = [
    { href: isAdmin ? "/admin" : "/", label: "لوحة التحكم", icon: "◈", show: true },
    { href: "/work", label: "مركز العمل", icon: "◉", show: true },
    { href: "/doctors", label: "الأطباء والعيادات", icon: "⌖", show: true },
    { href: "/visits", label: "الزيارات", icon: "✎", show: true },
    { href: "/visits/new", label: "تسجيل زيارة", icon: "+", show: !isAdmin },
    { href: "/products", label: "المنتجات", icon: "✦", show: !isAdmin },
    { href: "/sales", label: "المبيعات", icon: "▥", show: !isAdmin },
    { href: "/admin/reps", label: "المناديب", icon: "♙", show: isAdmin },
    { href: "/admin/reports", label: "التقارير", icon: "▦", show: isAdmin },
    { href: "/requests", label: "طلباتي", icon: "✉", show: false },
    { href: "/map", label: "الخريطة", icon: "⌖", show: isAdmin },
    { href: "/admin/doctor-stats", label: "أداء الأطباء", icon: "◎", show: isAdmin },
    { href: "/tasks", label: "المهام", icon: "☑", show: false },
    { href: "/calendar", label: "التقويم والتعاون", icon: "◷", show: true },
    { href: "/plans", label: "الخطط", icon: "🗓", show: true },
    { href: "/admin/products", label: "المنتجات", icon: "✦", show: isAdmin },
    { href: "/account", label: "حسابي", icon: "◐", show: true },
  ];
  const items=NAV.filter(n=>n.show);
  return <div className="min-h-screen flex flex-col lg:flex-row" dir="rtl">
    <div className="fixed top-3 left-3 z-50 hidden lg:block"><NotificationsBell role={role}/></div>
    <aside className="hidden lg:flex w-[272px] shrink-0 flex-col bg-[var(--navy)] text-white p-7 gap-6 sticky top-0 h-screen overflow-auto">
      <div className="text-center"><div className="text-[22px] font-extrabold tracking-widest">ELITE SKIN</div><div className="text-[11px] text-[var(--gold)] mt-1">نظام إدارة الزيارات الطبية</div></div>
      <nav className="flex flex-col gap-2 mt-2">{items.map(n=>{const on=active===n.href|| (!!active&&n.href!=="/"&&n.href!=="/admin"&&active.startsWith(n.href));return <Link key={n.href} href={n.href} className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${on?"bg-[rgba(196,154,60,0.18)] text-[var(--gold)]":"text-white/90 hover:bg-white/10"}`}><span className="text-xs opacity-80">{n.icon}</span><span>{n.label}</span></Link>})}</nav>
      <div className="px-1"><MyAlertsBadge role={role}/></div>
      <div className="mt-auto rounded-2xl bg-white/10 p-3"><div className="text-sm font-bold">{name}</div><div className="break-all text-xs text-[var(--gold)]">{email}</div><div className="mt-1 text-[11px] text-white/70">{isAdmin?"مدير النظام":(jobTitle||"مندوب")}</div>{!isAdmin&&productName&&<div className="mt-1 text-[10px] text-white/55">{productName}</div>}<form action="/api/auth/logout" method="post" className="mt-3"><button formAction={async()=>{"use server";const{destroySession}=await import("@/lib/session");await destroySession();}} className="w-full rounded-full bg-white/15 py-2 text-xs font-bold hover:bg-white/20">تسجيل خروج</button></form></div>
    </aside>
    <div className="flex min-w-0 flex-1 flex-col"><MobileNav items={items} active={active} name={name} role={role}/><main className="flex-1 p-4 pb-28 sm:p-5 sm:pb-28 lg:p-8 lg:pb-8">{children}</main></div>
  </div>;
}
