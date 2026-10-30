import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { readLibraryFile } from "@/lib/library";

const INLINE = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
export async function GET(req: Request, { params }: { params: Promise<{ src: string; id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { src, id } = await params;
  const f = await readLibraryFile(u, src, id);
  if (!f) return NextResponse.json({ error: "الملف غير موجود أو غير مسموح لك" }, { status: 404 });
  const download = new URL(req.url).searchParams.get("dl") === "1" || !INLINE.has(f.mime);
  const fn = encodeURIComponent(f.name).replace(/'/g, "%27");
  return new NextResponse(new Uint8Array(f.data), { headers: {
    "content-type": f.mime || "application/octet-stream", "content-length": String(f.data.byteLength),
    "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${fn}`,
    "x-content-type-options": "nosniff", "cache-control": "private, max-age=300",
  } });
}
