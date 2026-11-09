"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/** Popup: centered on tablet/desktop, bottom sheet on phones. Title, scrollable body, footer that stays reachable above the keyboard. */
export default function Sheet({ title, onClose, children, footer, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    box.current?.querySelector<HTMLElement>("textarea, input, select")?.focus({ preventScroll: true });
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [onClose]);
  return createPortal(<div className="fixed inset-0 z-[80] flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={title} dir="rtl">
    <button type="button" aria-label="إغلاق" onClick={onClose} className="sh-fade absolute inset-0 bg-[#0b1d20]/45 backdrop-blur-[2px]" />
    <div ref={box} className={`sh-pop relative flex max-h-[92dvh] w-full flex-col rounded-t-[24px] bg-white shadow-2xl md:rounded-[24px] ${wide ? "md:max-w-2xl" : "md:max-w-lg"}`} style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <span className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-[var(--border)] md:hidden" />
      <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3 md:pt-5">
        <h2 className="text-lg font-extrabold text-[var(--navy)]">{title}</h2>
        <button type="button" onClick={onClose} aria-label="إغلاق" className="grid h-11 w-11 place-items-center rounded-full text-xl text-[var(--muted)] hover:bg-[var(--bg)]">✕</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
      <div className="sticky bottom-0 flex gap-2 border-t border-[var(--border)] bg-white px-5 py-3">{footer}</div>
    </div>
    <style>{`@media (prefers-reduced-motion:no-preference){@keyframes sh-up{from{transform:translateY(100%)}to{transform:none}}@keyframes sh-in{from{opacity:0;transform:scale(.97) translateY(6px)}to{opacity:1;transform:none}}@keyframes sh-f{from{opacity:0}to{opacity:1}}
      .sh-pop{animation:sh-up .22s cubic-bezier(.2,.8,.2,1) both}@media (min-width:768px){.sh-pop{animation:sh-in .2s cubic-bezier(.2,.8,.2,1) both}}.sh-fade{animation:sh-f .18s ease-out both}}`}</style>
  </div>, document.body);
}

/** A labelled field with its error right under it. */
export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[13.5px] font-bold text-[var(--ink)]">{label}</span>{children}
    {error ? <span role="alert" className="mt-1 block text-[12.5px] font-bold text-[#c92f36]">{error}</span> : hint ? <span className="mt-1 block text-[12px] text-[var(--muted)]">{hint}</span> : null}</label>;
}
export const fieldCls = "w-full rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-3 text-[15px] outline-none transition-colors focus:border-[var(--sky)] focus:bg-white aria-[invalid=true]:border-[#c92f36]";
export const btnPrimary = "min-h-12 rounded-2xl bg-[var(--navy)] px-5 text-[15px] font-extrabold text-white transition active:scale-[.98] disabled:opacity-50";
export const btnSoft = "min-h-12 rounded-2xl bg-[var(--sky-soft)] px-5 text-[14.5px] font-bold text-[var(--navy)] transition hover:bg-[var(--sky-border)] active:scale-[.98] disabled:opacity-50";
export const btnGhost = "min-h-11 rounded-2xl px-4 text-[14px] font-bold text-[var(--muted)] transition hover:bg-[var(--bg)] hover:text-[var(--ink)]";
export function FailBox({ text }: { text: string }) {
  return text ? <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-[13.5px] font-bold text-[#c92f36]">⚠ {text}</div> : null;
}
