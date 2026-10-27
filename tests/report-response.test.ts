import {describe,it,expect} from "vitest";
import {readReportResponse} from "../src/lib/report-response";
const data={totals:{visits:0,active_reps:0,doctors:0,samples:0,orders:0},repPerformance:[],visits:[],products:[],samples:[],sampleDoctors:[],coverage:[],sales:[],compliance:[]};
describe("report response integrity",()=>{
 it("accepts legitimate empty totals",async()=>expect(await readReportResponse(new Response(JSON.stringify(data),{status:200,headers:{"content-type":"application/json"}}))).toEqual(data));
 it("rejects auth failure rather than treating it as zero",async()=>await expect(readReportResponse(new Response(JSON.stringify({error:"Forbidden"}),{status:403}))).rejects.toThrow());
 it("rejects malformed success payload",async()=>await expect(readReportResponse(new Response(JSON.stringify({error:"oops"}),{status:200}))).rejects.toThrow());
 it("rejects HTML redirects",async()=>await expect(readReportResponse(new Response("<html>login</html>",{status:200,headers:{"content-type":"text/html"}}))).rejects.toThrow());
});
