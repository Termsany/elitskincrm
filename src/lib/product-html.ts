import { createHash } from "node:crypto";
import { sniffUpload } from "@/lib/upload-sniff";

export const HTML_MAX = 2 * 1024 * 1024;
export const HTML_EXT_RE = /\.html?$/i;

export type HtmlWarning = "scripts" | "embeds" | "forms" | "external";
export const WARNING_LABELS: Record<HtmlWarning, string> = {
  scripts: "فيه JavaScript — متعطّل في المعاينة",
  embeds: "فيه iframe/embed — متعطّل في المعاينة",
  forms: "فيه نماذج إدخال — الإرسال متعطّل",
  external: "بيحمّل ملفات من مواقع خارجية",
};

export type HtmlCheck =
  | { ok: false; error: string }
  | { ok: true; fileName: string; title: string; size: number; sha256: string; data: Buffer; warnings: HtmlWarning[] };

/** Validates an uploaded HTML file from its name and real bytes (browser MIME is not trusted). */
export function checkHtmlUpload(name: string, buf: Buffer): HtmlCheck {
  const fileName = name.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 200);
  if (!fileName || !HTML_EXT_RE.test(fileName)) return { ok: false, error: "المسموح ملفات HTML أو HTM بس" };
  if (!buf.length) return { ok: false, error: "الملف فاضي" };
  if (buf.length > HTML_MAX) return { ok: false, error: "حجم الملف أكبر من 2 ميجابايت" };
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
 * Headers for serving an uploaded HTML file. The CSP `sandbox` directive gives the document an
 * opaque origin with scripts, forms, popups and top navigation disabled — even if opened directly
 * in a new tab — so it can never run code against the CRM session.
 */
export function htmlServeHeaders(fileName: string, download: boolean): Record<string, string> {
  const enc = encodeURIComponent(fileName || "file.html");
  return {
    "content-type": download ? "application/octet-stream" : "text/html; charset=utf-8",
    "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${enc}`,
    "content-security-policy": "sandbox; default-src 'none'; script-src 'none'; object-src 'none'; img-src data: blob: https:; style-src 'unsafe-inline' https:; font-src data: https:; media-src data: https:; form-action 'none'; base-uri 'none'; frame-ancestors 'self'",
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
    "referrer-policy": "no-referrer",
    "cross-origin-resource-policy": "same-origin",
    "cache-control": "private, no-store",
  };
}
