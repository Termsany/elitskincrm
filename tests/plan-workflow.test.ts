import {describe,expect,it} from "vitest";
import {dateRangesOverlap,findFiveDayDuplicate,shiftPlanItems,distributeSuggestionsByArea} from "@/lib/plan-workflow";
describe("weekly plan workflow",()=>{
 it("detects overlapping approved date ranges",()=>{expect(dateRangesOverlap("2026-10-25","2026-10-31","2026-10-31","2026-11-06")).toBe(true);expect(dateRangesOverlap("2026-10-25","2026-10-31","2026-11-01","2026-11-07")).toBe(false)});
 it("shifts copied plan doctors to a new week",()=>{expect(shiftPlanItems([{doctor_id:"d1",planned_date:"2026-10-25"},{doctor_id:"d2",planned_date:"2026-10-27"}],"2026-10-25","2026-11-01")).toEqual([{doctor_id:"d1",planned_date:"2026-11-01"},{doctor_id:"d2",planned_date:"2026-11-03"}])});
 it("warns when the same doctor is planned within five days",()=>{expect(findFiveDayDuplicate("d1","2026-10-29",[{doctor_id:"d1",planned_date:"2026-10-25"}])).toBe("2026-10-25");expect(findFiveDayDuplicate("d1","2026-11-01",[{doctor_id:"d1",planned_date:"2026-10-25"}])).toBeNull()});
 it("keeps doctors from the same city together and prioritizes class A then B then C",()=>{const days=["2026-10-25","2026-10-26"];const result=distributeSuggestionsByArea([{id:"c",city:"جدة",classification:"C"},{id:"a",city:"الرياض",classification:"A"},{id:"b",city:"الرياض",classification:"B"}],days);expect(result[days[0]].map(x=>x.id)).toEqual(["a","b"]);expect(result[days[1]].map(x=>x.id)).toEqual(["c"])});
});
