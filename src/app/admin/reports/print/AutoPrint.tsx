"use client";
import { useEffect } from "react";
export default function AutoPrint() {
  useEffect(() => { const t = setTimeout(() => window.print(), 600); return () => clearTimeout(t); }, []);
  return <button onClick={() => window.print()} className="no-print" style={{ position: "fixed", top: 12, left: 12, padding: "8px 14px", borderRadius: 10, background: "#10484f", color: "#fff", fontWeight: 700, border: 0, cursor: "pointer" }}>طباعة / حفظ PDF</button>;
}
