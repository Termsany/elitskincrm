"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastTone = "success" | "error" | "info";
type ToastFn = (message: string, tone?: ToastTone) => void;
type ToastItem = { id: number; message: string; tone: ToastTone };

const ToastContext = createContext<ToastFn | null>(null);

const toneClass: Record<ToastTone, string> = {
  success: "bg-emerald-600",
  error: "bg-red-600",
  info: "bg-[var(--navy)]",
};

/** Mounted once at the app root; shows brief, auto-dismissing messages instead of native alert(). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const toast = useCallback<ToastFn>((message, tone = "info") => {
    const id = ++idRef.current;
    setItems((cur) => [...cur, { id, message, tone }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 4500);
  }, []);

  return <ToastContext.Provider value={toast}>
    {children}
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-[200] flex flex-col items-center gap-2 px-4 sm:bottom-6">
      {items.map((t) => (
        <div key={t.id} className={`pointer-events-auto max-w-[92vw] whitespace-pre-line rounded-2xl px-4 py-2.5 text-center text-sm font-bold text-white shadow-lg sm:max-w-md ${toneClass[t.tone]}`}>
          {t.message}
        </div>
      ))}
    </div>
  </ToastContext.Provider>;
}

/** Call inside any client component under ToastProvider: toast("تم الحفظ", "success"). */
export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
