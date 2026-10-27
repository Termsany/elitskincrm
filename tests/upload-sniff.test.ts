import { describe, expect, it } from "vitest";
import { sniffUpload } from "../src/lib/upload-sniff";

describe("upload type sniffing", () => {
  it("accepts real JPEG, PNG, PDF, WEBP and HEIC bytes", () => {
    expect(sniffUpload(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))?.mime).toBe("image/jpeg");
    expect(sniffUpload(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.mime).toBe("image/png");
    expect(sniffUpload(Buffer.from("%PDF-1.7 ..."))?.mime).toBe("application/pdf");
    expect(sniffUpload(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))?.mime).toBe("image/webp");
    expect(sniffUpload(Buffer.from("\0\0\0\x18ftypheic\0\0\0\0"))?.mime).toBe("image/heic");
  });

  it("rejects scripts, html and files lying about their type", () => {
    expect(sniffUpload(Buffer.from("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffUpload(Buffer.from("#!/bin/sh\nrm -rf /"))).toBeNull();
    expect(sniffUpload(Buffer.from("MZ\x90\0\x03"))).toBeNull();
    expect(sniffUpload(Buffer.alloc(0))).toBeNull();
    expect(sniffUpload(Buffer.from("\0\0\0\x18ftypmp42\0\0\0\0"))).toBeNull();
  });
});
