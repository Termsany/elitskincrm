"use client";
import { useEffect, useRef, useState } from "react";

type Rec = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
type RecCtor = new () => Rec;

/** Dictate the visit notes in Arabic (browser speech recognition; hidden where unsupported). */
export default function VoiceNote({ onText, compact = false }: { onText: (t: string) => void; compact?: boolean }) {
  const [ok, setOk] = useState(false); const [on, setOn] = useState(false); const [err, setErr] = useState("");
  const rec = useRef<Rec | null>(null);
  useEffect(() => { const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor }; setOk(!!(w.SpeechRecognition || w.webkitSpeechRecognition)); return () => rec.current?.stop(); }, []);
  if (!ok) return null;
  function toggle() {
    if (on) { rec.current?.stop(); return; }
    const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
    const C = (w.SpeechRecognition || w.webkitSpeechRecognition)!; const r = new C();
    r.lang = "ar-SA"; r.continuous = true; r.interimResults = false;
    r.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) { const t = e.results[i][0].transcript.trim(); if (t) onText(t); } };
    r.onend = () => setOn(false);
    r.onerror = e => { setOn(false); setErr(e.error === "not-allowed" ? "اسمح للمايك من إعدادات المتصفح" : "ما قدرتش أسمع — جرب تاني"); setTimeout(() => setErr(""), 3500); };
    rec.current = r; setErr(""); r.start(); setOn(true);
  }
  if (compact) return <span className="relative inline-flex">
    <button type="button" onClick={toggle} aria-pressed={on} aria-label={on ? "إيقاف التسجيل" : "اتكلم وأنا أكتب"} title={on ? "إيقاف التسجيل" : "اتكلم وأنا أكتب"}
      className={`grid h-11 w-11 place-items-center rounded-xl text-lg transition ${on ? "animate-pulse bg-red-600 text-white shadow-lg" : "bg-teal-50 text-[var(--navy)] hover:bg-teal-100"}`}>🎤</button>
    {on && <span className="absolute -top-7 left-0 whitespace-nowrap rounded-lg bg-red-600 px-2 py-0.5 text-[10.5px] font-bold text-white">بسمعك…</span>}
    {err && <span className="absolute -top-7 left-0 whitespace-nowrap rounded-lg bg-white px-2 py-0.5 text-[10.5px] font-bold text-red-700 shadow">{err}</span>}
  </span>;
  return <span className="inline-flex items-center gap-2">
    <button type="button" onClick={toggle} aria-pressed={on} title={on ? "إيقاف التسجيل" : "اتكلم وأنا أكتب"}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition ${on ? "bg-red-600 text-white shadow-lg" : "border border-[var(--border)] bg-white text-[var(--navy)] hover:border-[var(--navy)]"}`}>
      <span className={`relative flex h-2.5 w-2.5 ${on ? "" : "hidden"}`}><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" /></span>
      🎤 {on ? "بسمعك… اضغط للإيقاف" : "اتكلم"}</button>
    {err && <span className="text-[11px] font-bold text-red-700">{err}</span>}
  </span>;
}
