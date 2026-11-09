"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type T = { id: number; text: string; undo?: () => void | Promise<void>; err?: boolean };
const Ctx = createContext<(t: Omit<T, "id">) => void>(() => {});
export const useUndo = () => useContext(Ctx);

/** Confirmation toasts; when an action can be reversed the toast offers "تراجع" for 6 seconds. */
export function UndoProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<T[]>([]); const n = useRef(0);
  const [mounted, setMounted] = useState(false); useEffect(() => { setMounted(true); }, []);
  const push = useCallback((t: Omit<T, "id">) => { const id = ++n.current; setList(l => [...l.slice(-2), { ...t, id }]); setTimeout(() => setList(l => l.filter(x => x.id !== id)), t.undo ? 6000 : 3500); }, []);
  return <Ctx.Provider value={push}>{children}
    {mounted && createPortal(<div className="pointer-events-none fixed inset-x-0 bottom-24 z-[90] flex flex-col items-center gap-2 px-4 lg:bottom-6" role="status" aria-live="polite" dir="rtl">
      {list.map(t => <div key={t.id} className="ut-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-white shadow-xl" style={{ background: t.err ? "#c92f36" : "#10484f" }}>
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${t.err ? "bg-white/20" : "bg-[#33b3a6] text-[#0b1d20]"}`}>{t.err ? "!" : "✓"}</span>
        <span className="flex-1">{t.text}</span>
        {t.undo && <button type="button" onClick={() => { void t.undo!(); setList(l => l.filter(x => x.id !== t.id)); }} className="min-h-9 rounded-xl bg-white/10 px-3 text-[13px] text-[#c9e8e4] hover:bg-white/20">تراجع</button>}
      </div>)}
      <style>{`@media (prefers-reduced-motion:no-preference){@keyframes ut{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}.ut-in{animation:ut .18s ease-out both}}`}</style>
    </div>, document.body)}
  </Ctx.Provider>;
}
