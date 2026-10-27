import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getDetailedReportData } from "@/lib/report-data";

export async function GET(req:Request){
  const user=await getCurrentUser();
  if(!user||user.role!=="admin")return NextResponse.json({error:"Forbidden"},{status:403});
  const {searchParams}=new URL(req.url);
  return NextResponse.json(await getDetailedReportData(searchParams));
}
