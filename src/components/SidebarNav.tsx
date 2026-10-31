"use client";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";

type Item = { href: string; label: string; icon: string };
type Ind = { top: number; h: number; on: boolean; anim: boolean };

/** Desktop sidebar navigation: duotone icons, a sliding active pill, hover micro-animations and tooltips when collapsed. */
export default function SidebarNav({ primary, more, active }: { primary: Item[]; more: Item[]; active?: string }) {
  const isOn = (href: string) => active === href || (!!active && href !== "/" && href !== "/admin" && active.startsWith(href));
  const nav = useRef<HTMLElement>(null);
  const [ind, setInd] = useState<Ind>({ top: 0, h: 0, on: false, anim: false });
  const [moreOpen, setMoreOpen] = useState(more.some((n) => isOn(n.href)));

  useLayoutEffect(() => {
    const place = (animate: boolean) => {
      const el = nav.current?.querySelector<HTMLElement>('[data-on="1"]');
      if (!el || el.offsetParent === null) { setInd((s) => ({ ...s, on: false })); return; }
      const next = { top: el.offsetTop, h: el.offsetHeight };
      let prev: { top: number; h: number } | null = null;
      try { prev = JSON.parse(sessionStorage.getItem("es-nav-ind") || "null"); } catch { /* ignore */ }
      if (animate && prev && prev.top !== next.top) {
        setInd({ ...prev, on: true, anim: false });
        requestAnimationFrame(() => requestAnimationFrame(() => setInd({ ...next, on: true, anim: true })));
      } else setInd({ ...next, on: true, anim: false });
      try { sessionStorage.setItem("es-nav-ind", JSON.stringify(next)); } catch { /* ignore */ }
    };
    place(true);
    const onResize = () => place(false);
    window.addEventListener("es-sidebar-toggle", onResize); window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("es-sidebar-toggle", onResize); window.removeEventListener("resize", onResize); };
  }, [active, moreOpen]);

  const link = (n: Item) => {
    const on = isOn(n.href);
    return <Link key={n.href} href={n.href} data-on={on ? "1" : undefined} data-tip={n.label} aria-current={on ? "page" : undefined} className="es-link">
      <span className="es-ibox"><Icon name={n.icon} size={20} /></span>
      <span className="es-hide es-label">{n.label}</span>
    </Link>;
  };

  return <nav ref={nav} className="es-nav relative mt-1 flex flex-col gap-1">
    <span aria-hidden="true" className={`es-ind ${ind.anim ? "es-ind-anim" : ""}`} style={{ transform: `translateY(${ind.top}px)`, height: ind.h, opacity: ind.on ? 1 : 0 }} />
    <div className="es-hide px-3 pb-1 text-[11px] font-semibold text-white/40">القائمة</div>
    {primary.map(link)}
    {more.length > 0 && <>
      <div className="my-1.5 h-px bg-white/10" />
      <button type="button" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} data-tip="المزيد" className="es-link">
        <span className="es-ibox"><Icon name="more" size={20} /></span>
        <span className="es-hide es-label">المزيد</span>
        <span className={`es-hide mr-auto text-[10px] text-white/50 transition-transform duration-300 ${moreOpen ? "rotate-180" : ""}`}>▾</span>
      </button>
      <div className={`es-more grid transition-[grid-template-rows] duration-300 ${moreOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="flex flex-col gap-1 overflow-hidden">{more.map(link)}</div>
      </div>
    </>}
  </nav>;
}

/** Collapse / expand the desktop sidebar (persisted per browser). */
export function SidebarToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const collapsed = root.dataset.sb !== "c";
    if (collapsed) root.dataset.sb = "c"; else delete root.dataset.sb;
    try { localStorage.setItem("es-sb", collapsed ? "c" : "o"); } catch { /* ignore */ }
    setTimeout(() => window.dispatchEvent(new Event("es-sidebar-toggle")), 280);
  };
  return <button type="button" onClick={toggle} aria-label="طي/فتح القائمة الجانبية" title="طي/فتح القائمة" className="es-toggle flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/10 text-white/80 transition hover:bg-white/15 hover:text-white">
    <Icon name="collapse" size={18} />
  </button>;
}
