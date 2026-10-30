import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getDetailedReportData, AnnualReportFilterError, annualReportSelection } from "@/lib/report-data";

export async function GET(req:Request){
  const user=await getCurrentUser();
  if(!user||user.role!=="admin")return NextResponse.json({error:"Forbidden"},{status:403});
  const {searchParams}=new URL(req.url);
  try { if (searchParams.get("reportType") === "sales") annualReportSelection(searchParams); return NextResponse.json(await getDetailedReportData(searchParams)); }
  catch (error) { if (error instanceof AnnualReportFilterError) return NextResponse.json({error:error.message},{status:400}); throw error; }
}
