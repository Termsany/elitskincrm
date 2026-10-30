import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { periodRange } from "@/lib/visit-intel";
import { reportData, buildWorkbook, reportFileName, saveReportToLibrary } from "@/lib/visit-report";

const params = (req: Request) => { const sp = new URL(req.url).searchParams; return { ...periodRange(sp.get("period") || "week", sp.get("from"), sp.get("to")), repId: sp.get("repId") || "" }; };
/** Download the Excel report. */
export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const p = params(req); const d = await reportData(p.from, p.to, p.repId || undefined);
  const buf = await buildWorkbook(d);
  return new NextResponse(new Uint8Array(buf), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(reportFileName(p.from, p.to, d.repName))}`, "cache-control": "no-store" } });
}
/** Save the Excel report into the document library. */
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const p = params(req); const d = await reportData(p.from, p.to, p.repId || undefined);
  const id = await saveReportToLibrary(u.id, await buildWorkbook(d), reportFileName(p.from, p.to, d.repName), `manual:${p.from}:${p.to}:${p.repId}`);
  return NextResponse.json({ id }, { status: 201 });
}
