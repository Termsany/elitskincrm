import Anthropic from "@anthropic-ai/sdk";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { query } from "@/lib/db";

/**
 * The AI behind the financial advisor, chosen from the app: Claude through the Anthropic SDK,
 * or any provider that speaks the OpenAI chat-completions protocol (OpenAI, Gemini, DeepSeek, OpenRouter, Groq, a custom URL).
 */
export const PROVIDERS = [
  { id: "anthropic", name: "Claude (Anthropic)", base_url: "", keys: "console.anthropic.com" },
  { id: "openai", name: "ChatGPT (OpenAI)", base_url: "https://api.openai.com/v1", keys: "platform.openai.com" },
  { id: "gemini", name: "Gemini (Google)", base_url: "https://generativelanguage.googleapis.com/v1beta/openai", keys: "aistudio.google.com" },
  { id: "deepseek", name: "DeepSeek", base_url: "https://api.deepseek.com", keys: "platform.deepseek.com" },
  { id: "openrouter", name: "OpenRouter", base_url: "https://openrouter.ai/api/v1", keys: "openrouter.ai" },
  { id: "groq", name: "Groq", base_url: "https://api.groq.com/openai/v1", keys: "console.groq.com" },
  { id: "custom", name: "مزوّد تاني (متوافق مع OpenAI)", base_url: "", keys: "" },
] as const;
export type ProviderId = typeof PROVIDERS[number]["id"];
export type AiConfig = { provider: ProviderId; base_url: string; model: string; api_key: string };
export type ChatMsg = { role: "user" | "assistant"; content: string };
export class AiError extends Error {}

const secret = () => createHash("sha256").update(process.env.AI_SETTINGS_SECRET || process.env.CRON_SECRET || process.env.DATABASE_URL || "elite-crm").digest();
export function encryptKey(plain: string) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", secret(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map(b => b.toString("base64")).join(".");
}
export function decryptKey(stored: string) {
  const [iv, tag, enc] = stored.split(".").map(x => Buffer.from(x, "base64"));
  const d = createDecipheriv("aes-256-gcm", secret(), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

/** https only, and never a local or private address (the server would be calling into its own network). */
export function safeBaseUrl(raw: string): string | null {
  let u: URL; try { u = new URL(raw.trim()); } catch { return null; }
  const h = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || u.username || u.password) return null;
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".") || h.includes(":")) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return null;
  return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
}
export function resolveBase(provider: ProviderId, custom: string): string | null {
  if (provider === "anthropic") return "";
  if (provider === "custom") return safeBaseUrl(custom);
  return PROVIDERS.find(p => p.id === provider)?.base_url ?? null;
}

/** Saved settings first; an ANTHROPIC_API_KEY set on the server is the fallback. */
export async function loadAi(): Promise<AiConfig | null> {
  const r = (await query<{ provider: ProviderId; base_url: string; model: string; api_key_enc: string }>("SELECT provider, base_url, model, api_key_enc FROM ai_settings WHERE id=1").catch(() => ({ rows: [] }))).rows[0];
  if (r) { try { return { provider: r.provider, base_url: r.base_url, model: r.model, api_key: decryptKey(r.api_key_enc) }; } catch { return null; } }
  const env = process.env.ANTHROPIC_API_KEY?.trim();
  return env ? { provider: "anthropic", base_url: "", model: process.env.ANTHROPIC_ADVISOR_MODEL?.trim() || "claude-opus-5-5", api_key: env } : null;
}
export async function aiStatus() {
  const r = (await query<{ provider: string; base_url: string; model: string; key_hint: string }>("SELECT provider, base_url, model, key_hint FROM ai_settings WHERE id=1").catch(() => ({ rows: [] }))).rows[0];
  if (r) return { configured: true, source: "app" as const, ...r };
  return process.env.ANTHROPIC_API_KEY?.trim() ? { configured: true, source: "server" as const, provider: "anthropic", base_url: "", model: process.env.ANTHROPIC_ADVISOR_MODEL?.trim() || "claude-opus-5-5", key_hint: "" } : { configured: false as const };
}

const say = async (r: Response) => { const t = await r.text().catch(() => ""); try { const j = JSON.parse(t); return String(j?.error?.message || j?.message || t).slice(0, 200); } catch { return t.slice(0, 200); } };
const httpError = async (r: Response) => new AiError(r.status === 401 || r.status === 403 ? "المفتاح مش صحيح أو مالوش صلاحية" : r.status === 429 ? "المزوّد بيقول إن الحد أو الرصيد خلص — جرّب بعد شوية أو راجع حسابك عنده"
  : r.status === 404 ? "الموديل أو العنوان مش موجود عند المزوّد" : `المزوّد رجّع خطأ (${r.status}): ${await say(r)}`);

/** Model ids the key can use (also proves the key works). */
export async function listModels(cfg: Omit<AiConfig, "model">): Promise<string[]> {
  if (cfg.provider === "anthropic") {
    const client = new Anthropic({ apiKey: cfg.api_key });
    const out: string[] = [];
    try { for await (const m of client.models.list({ limit: 100 })) { out.push(m.id); if (out.length >= 200) break; } }
    catch (e) { throw anthropicError(e); }
    return out;
  }
  const r = await fetch(`${cfg.base_url}/models`, { headers: { authorization: `Bearer ${cfg.api_key}` }, signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!r) throw new AiError("السيرفر مش قادر يوصل للمزوّد");
  if (!r.ok) throw await httpError(r);
  const j = await r.json().catch(() => null) as { data?: Array<{ id?: string }> } | null;
  return (j?.data || []).map(m => String(m.id || "").replace(/^models\//, "")).filter(Boolean).sort().slice(0, 400);
}

function anthropicError(e: unknown) {
  return new AiError(e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError ? "المفتاح مش صحيح أو مالوش صلاحية"
    : e instanceof Anthropic.RateLimitError ? "خدمة Claude مشغولة أو الحد خلص — جرّب بعد دقيقة"
    : e instanceof Anthropic.NotFoundError ? "الموديل مش موجود في حسابك"
    : e instanceof Anthropic.APIConnectionError ? "السيرفر مش قادر يوصل لخدمة Claude"
    : e instanceof Anthropic.APIError ? `خدمة Claude رجّعت خطأ (${e.status ?? "?"})` : "حصل خطأ في المستشار الذكي");
}

/** Streams the answer as text chunks. `system` is the stable instructions, `data` the numbers (cached on Claude). */
export async function streamAnswer(cfg: AiConfig, system: string, data: string, messages: ChatMsg[], onText: (t: string) => void, signal: AbortSignal) {
  if (cfg.provider === "anthropic") {
    const client = new Anthropic({ apiKey: cfg.api_key });
    try {
      const stream = client.beta.messages.stream({
        model: cfg.model, max_tokens: 16000,
        output_config: { effort: "medium" },
        // a declined request is retried on a fallback model inside the same call instead of failing
        betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
        system: [{ type: "text", text: system }, { type: "text", text: data, cache_control: { type: "ephemeral" } }],
        messages,
      }, { signal });
      stream.on("text", onText);
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") onText("\nمش قادر أجاوب على السؤال ده. جرّب تصيغه بشكل تاني.");
      else if (final.stop_reason === "max_tokens") onText("\n(الرد اتقطع عشان طويل — اطلب مني أكمّل)");
    } catch (e) { if (e instanceof Anthropic.APIUserAbortError) return; throw anthropicError(e); }
    return;
  }
  const r = await fetch(`${cfg.base_url}/chat/completions`, {
    method: "POST", signal, headers: { authorization: `Bearer ${cfg.api_key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: cfg.model, stream: true, messages: [{ role: "system", content: `${system}\n\n${data}` }, ...messages] }),
  }).catch(e => { if ((e as Error).name === "AbortError") return null; throw new AiError("السيرفر مش قادر يوصل للمزوّد"); });
  if (!r) return;
  if (!r.ok || !r.body) throw await httpError(r);
  const reader = r.body.getReader(), dec = new TextDecoder(); let buf = "";
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim(); if (!payload || payload === "[DONE]") continue;
      try { const t = (JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string | null } }> }).choices?.[0]?.delta?.content; if (t) onText(t); } catch { /* partial or non-JSON keep-alive line */ }
    }
  }
}
