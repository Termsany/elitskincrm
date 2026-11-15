"use client";
import { useEffect, useState } from "react";

/** Light / dark switch. The choice is per device (localStorage) and applied before first paint by THEME_BOOT. */
export const THEME_BOOT = `try{var t=localStorage.getItem('es-theme');if(t==='dark')document.documentElement.dataset.theme='dark'}catch(e){}`;

export function ThemeToggle({ className = "", label = true }: { className?: string; label?: boolean }) {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.dataset.theme === "dark"); }, []);
  const flip = () => {
    const next = !dark; setDark(next);
    if (next) document.documentElement.dataset.theme = "dark"; else delete document.documentElement.dataset.theme;
    try { localStorage.setItem("es-theme", next ? "dark" : "light"); } catch { /* private mode */ }
  };
  return <button type="button" onClick={flip} aria-pressed={dark} title={dark ? "الوضع الفاتح" : "الوضع الليلي"} className={className}>
    <span aria-hidden>{dark ? "☀" : "☾"}</span>{label && <span>{dark ? "فاتح" : "ليلي"}</span>}
  </button>;
}
