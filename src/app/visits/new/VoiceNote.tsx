"use client";
import { useEffect, useRef, useState } from "react";

type Rec = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
type RecCtor = new () => Rec;

/** Dictate the visit notes in Arabic (browser speech recognition; hidden where unsupported). */
export default function VoiceNote({ onText }: { onText: (t: string) => void }) {
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
  return <span className="inline-flex items-center gap-2">
    <button type="button" onClick={toggle} aria-pressed={on} title={on ? "إيقاف التسجيل" : "اتكلم وأنا أكتب"}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition ${on ? "bg-red-600 text-white shadow-lg" : "border border-[var(--border)] bg-white text-[var(--navy)] hover:border-[var(--navy)]"}`}>
      <span className={`relative flex h-2.5 w-2.5 ${on ? "" : "hidden"}`}><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" /></span>
      🎤 {on ? "بسمعك… اضغط للإيقاف" : "اتكلم"}</button>
    {err && <span className="text-[11px] font-bold text-red-700">{err}</span>}
  </span>;
}
