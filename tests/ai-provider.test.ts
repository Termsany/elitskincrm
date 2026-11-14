import { describe, expect, it } from "vitest";
import { decryptKey, encryptKey, resolveBase, safeBaseUrl } from "@/lib/ai-provider";

describe("AI provider settings", () => {
  it("encrypts the key and reads it back", () => {
    const enc = encryptKey("sk-test-1234567890");
    expect(enc).not.toContain("sk-test");
    expect(decryptKey(enc)).toBe("sk-test-1234567890");
    expect(encryptKey("sk-test-1234567890")).not.toBe(enc);
  });
  it("accepts only public https provider addresses", () => {
    expect(safeBaseUrl("https://api.example.com/v1/")).toBe("https://api.example.com/v1");
    for (const bad of ["http://api.example.com/v1", "https://localhost/v1", "https://10.0.0.5/v1", "https://db/v1", "https://[::1]/v1", "https://user:pw@api.example.com", "nonsense"])
      expect(safeBaseUrl(bad)).toBeNull();
  });
  it("uses the preset address for known providers", () => {
    expect(resolveBase("anthropic", "https://evil.example.com")).toBe("");
    expect(resolveBase("openai", "https://evil.example.com")).toBe("https://api.openai.com/v1");
    expect(resolveBase("custom", "http://x.example.com")).toBeNull();
  });
});
