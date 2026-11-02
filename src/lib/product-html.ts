import { createHash } from "node:crypto";
import { sniffUpload } from "@/lib/upload-sniff";

export const HTML_MAX = 2 * 1024 * 1024;
export const HTML_EXT_RE = /\.html?$/i;

export type HtmlWarning = "scripts" | "embeds" | "forms" | "external";
export const WARNING_LABELS: Record<HtmlWarning, string> = {
  scripts: "تفاعلي (JavaScript)",
  embeds: "فيه iframe/embed — متعطّل",
  forms: "فيه نماذج إدخال — الإرسال متعطّل",
  external: "بيحمّل ملفات من مواقع خارجية",
};

export type HtmlCheck =
  | { ok: false; error: string }
  | { ok: true; fileName: string; title: string; size: number; sha256: string; data: Buffer; warnings: HtmlWarning[] };

/** Validates an uploaded HTML file from its name and real bytes (browser MIME is not trusted). */
export function checkHtmlUpload(name: string, buf: Buffer, max = HTML_MAX): HtmlCheck {
  const fileName = name.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 200);
  if (!fileName || !HTML_EXT_RE.test(fileName)) return { ok: false, error: "المسموح ملفات HTML أو HTM بس" };
  if (!buf.length) return { ok: false, error: "الملف فاضي" };
  if (buf.length > max) return { ok: false, error: `حجم الملف أكبر من ${Math.round(max / 1048576)} ميجابايت` };
  if (sniffUpload(buf)) return { ok: false, error: "الملف ده مش HTML (امتداده متغيّر)" };
  if (buf.includes(0)) return { ok: false, error: "الملف ده مش HTML — فيه بيانات ثنائية" };
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return { ok: false, error: "الملف لازم يكون محفوظ بترميز UTF-8" }; }
  text = text.replace(/^﻿/, "");
  if (!/<\s*(!doctype\s+html|html|head|body|div|p|table|h[1-6]|span|section|article|main|style|img|ul|ol)\b/i.test(text))
    return { ok: false, error: "محتوى الملف مش HTML" };
  const warnings: HtmlWarning[] = [];
  if (/<\s*script\b|\son[a-z]+\s*=|javascript\s*:/i.test(text)) warnings.push("scripts");
  if (/<\s*(iframe|frame|embed|object|applet)\b/i.test(text)) warnings.push("embeds");
  if (/<\s*form\b/i.test(text)) warnings.push("forms");
  if (/\b(src|href|action)\s*=\s*["']?\s*(https?:)?\/\//i.test(text) || /url\(\s*["']?\s*(https?:)?\/\//i.test(text)) warnings.push("external");
  const title = (text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim().slice(0, 160);
  return { ok: true, fileName, title, size: buf.length, sha256: createHash("sha256").update(buf).digest("hex"), data: buf, warnings };
}

/**
 * Headers for serving an uploaded HTML brochure. The CSP `sandbox allow-scripts` directive (without
 * allow-same-origin) gives the document an opaque origin: its JavaScript runs so interactive
 * brochures work, but it cannot read CRM cookies/storage, call CRM APIs (connect-src 'none'),
 * submit forms, open popups or navigate the CRM page — even when opened directly in a tab.
 */
export function htmlServeHeaders(fileName: string, download = false): Record<string, string> {
  const enc = encodeURIComponent(fileName || "file.html");
  return {
    "content-type": download ? "application/octet-stream" : "text/html; charset=utf-8",
    "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${enc}`,
    "content-security-policy": [
      "sandbox allow-scripts allow-pointer-lock",
      "default-src 'none'",
      "script-src 'unsafe-inline' 'unsafe-eval' https: data: blob:",
      "style-src 'unsafe-inline' https: data:",
      "img-src data: blob: https:", "font-src data: https:", "media-src data: blob: https:", "worker-src blob:",
      "connect-src 'none'", "form-action 'none'", "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'self'",
    ].join("; "),
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
    "referrer-policy": "no-referrer",
    "cross-origin-resource-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  };
}

/**
 * In the sandbox, localStorage/sessionStorage/document.cookie throw; many exported interactive
 * pages use them and would stop working. Inject an in-memory stand-in (served copy only).
 */
const SHIM = `<script>(function(){function m(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}["localStorage","sessionStorage"].forEach(function(n){try{window[n].length}catch(e){try{Object.defineProperty(window,n,{value:m(),configurable:true})}catch(_){}}});try{document.cookie}catch(e){try{var c="";Object.defineProperty(document,"cookie",{get:function(){return c},set:function(){},configurable:true})}catch(_){}}})();</script>`;
export function withSandboxShim(buf: Buffer): Buffer {
  const text = buf.toString("utf8");
  const m = text.match(/<head\b[^>]*>/i) || text.match(/<html\b[^>]*>/i);
  const at = m && m.index !== undefined ? m.index + m[0].length : 0;
  return Buffer.from(text.slice(0, at) + SHIM + text.slice(at), "utf8");
}
