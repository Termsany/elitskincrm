import { describe, expect, it } from "vitest";
import { HTML_MAX, checkHtmlUpload, htmlServeHeaders } from "@/lib/product-html";

const b = (s: string) => Buffer.from(s, "utf8");
const page = `<!doctype html><html><head><title> عرض  المنتج </title></head><body><h1>مرحبا</h1></body></html>`;

describe("checkHtmlUpload", () => {
  it("accepts .html and .htm with real HTML", () => {
    const r = checkHtmlUpload("offer.html", b(page));
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.title).toBe("عرض المنتج"); expect(r.warnings).toEqual([]); expect(r.sha256).toHaveLength(64); }
    expect(checkHtmlUpload("OLD.HTM", b("<p>hi</p>")).ok).toBe(true);
  });
  it("rejects wrong extensions, empty, oversize", () => {
    expect(checkHtmlUpload("x.php", b(page))).toMatchObject({ ok: false });
    expect(checkHtmlUpload("x.html.exe", b(page))).toMatchObject({ ok: false });
    expect(checkHtmlUpload("x.html", Buffer.alloc(0))).toMatchObject({ ok: false, error: "الملف فاضي" });
    expect(checkHtmlUpload("x.html", Buffer.alloc(HTML_MAX + 1, 0x61))).toMatchObject({ ok: false });
  });
  it("rejects renamed binaries and non-HTML text", () => {
    expect(checkHtmlUpload("x.html", Buffer.from("%PDF-1.7 ..."))).toMatchObject({ ok: false });
    expect(checkHtmlUpload("x.html", Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]))).toMatchObject({ ok: false });
    expect(checkHtmlUpload("x.html", Buffer.from([0x3c, 0x70, 0x3e, 0xff, 0xfe]))).toMatchObject({ ok: false });
    expect(checkHtmlUpload("x.html", b("just some plain text"))).toMatchObject({ ok: false });
  });
  it("flags risky content without rejecting it", () => {
    const r = checkHtmlUpload("x.html", b(`<div onclick="x()"><script>alert(1)</script><iframe src="https://e.com"></iframe><form></form><img src="//cdn.x/a.png"></div>`));
    expect(r.ok && r.warnings.sort()).toEqual(["embeds", "external", "forms", "scripts"]);
  });
  it("sanitizes the stored file name", () => {
    const r = checkHtmlUpload("../../etc/a.html", b(page));
    expect(r.ok && r.fileName).toBe(".._.._etc_a.html");
  });
});

describe("htmlServeHeaders", () => {
  it("sandboxes the document and blocks scripts", () => {
    const h = htmlServeHeaders("ملف.html", false);
    expect(h["content-security-policy"]).toMatch(/^sandbox;/);
    expect(h["content-security-policy"]).toContain("script-src 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["content-disposition"]).toMatch(/^inline/);
    expect(htmlServeHeaders("a.html", true)["content-disposition"]).toMatch(/^attachment/);
  });
});
