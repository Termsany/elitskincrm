"use client";
import { useEffect } from "react";

/**
 * App-wide micro-interaction: a soft ripple from the tap point on any button / button-like link.
 * Drawn in a fixed overlay clipped to the element's box, so it never changes layout, overflow or stacking of the element itself.
 */
const SEL = 'button:not(:disabled), [role="button"], a.rounded-xl, a.rounded-lg, a.rounded-full, a.rounded-2xl, summary';
export default function GlobalFx() {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const el = (e.target as Element | null)?.closest?.(SEL) as HTMLElement | null;
      if (!el || el.closest("[data-no-ripple]")) return;
      const r = el.getBoundingClientRect(); if (r.width < 16 || r.height < 16 || r.width * r.height > 260000) return;
      const cs = getComputedStyle(el);
      const box = document.createElement("span");
      box.className = "es-ripple-box";
      Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: cs.borderRadius });
      const d = Math.hypot(Math.max(e.clientX - r.left, r.right - e.clientX), Math.max(e.clientY - r.top, r.bottom - e.clientY)) * 2;
      const dot = document.createElement("span");
      dot.className = "es-ripple";
      Object.assign(dot.style, { width: `${d}px`, height: `${d}px`, left: `${e.clientX - r.left - d / 2}px`, top: `${e.clientY - r.top - d / 2}px`, background: cs.color });
      box.appendChild(dot); document.body.appendChild(box);
      setTimeout(() => box.remove(), 650);
    };
    document.addEventListener("pointerdown", down, { passive: true });
    return () => document.removeEventListener("pointerdown", down);
  }, []);
  return null;
}
