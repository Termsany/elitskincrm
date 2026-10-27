import {expect,it} from "vitest";
import {summarizeDay} from "@/lib/daily-workspace";
it("counts completed plans once and picks the first unfinished doctor",()=>{
 const result=summarizeDay([{id:"1",done:true},{id:"2",done:false},{id:"3",done:false}]);
 expect(result).toEqual({planned:3,completed:1,remaining:2,nextId:"2",adherence:33});
});
it("handles an empty day without inventing a completion percentage",()=>{
 expect(summarizeDay([])).toEqual({planned:0,completed:0,remaining:0,nextId:null,adherence:null});
});
