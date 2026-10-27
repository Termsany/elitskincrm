import {describe,it,expect} from "vitest";
import {riyadhDate,riyadhDateTime,calendarRange,shiftCalendarEvent,monthCalendarDays,eventOverlapsRiyadhDay} from "../src/lib/calendar-riyadh";

describe("Riyadh calendar independent of device timezone",()=>{
 it("attributes a late UTC event to the following Riyadh date",()=>{
  expect(riyadhDate(new Date("2026-10-26T22:30:00Z"))).toBe("2026-10-27");
  expect(riyadhDateTime("2026-10-27","09:00")).toBe("2026-10-27T06:00:00.000Z");
 });
 it("queries exactly the selected Riyadh day and calendar month",()=>{
  expect(calendarRange("2026-10-27","day")).toEqual({from:"2026-10-26T21:00:00.000Z",to:"2026-10-27T21:00:00.000Z"});
  expect(calendarRange("2026-10-27","month")).toEqual({from:"2026-09-26T21:00:00.000Z",to:"2026-11-07T21:00:00.000Z"});
  expect(calendarRange("2026-10-27","week")).toEqual({from:"2026-10-24T21:00:00.000Z",to:"2026-10-31T21:00:00.000Z"});
 });
 it("keeps the event wall-clock time and duration on reschedule",()=>{
  expect(shiftCalendarEvent("2026-10-26T22:30:00Z","2026-10-26T23:30:00Z","2026-11-03")).toEqual({starts_at:"2026-11-02T22:30:00.000Z",ends_at:"2026-11-02T23:30:00.000Z"});
 });
 it("includes an event crossing midnight on both Riyadh dates",()=>{
  expect(eventOverlapsRiyadhDay("2026-10-27T20:30:00Z","2026-10-27T22:30:00Z","2026-10-27")).toBe(true);
  expect(eventOverlapsRiyadhDay("2026-10-27T20:30:00Z","2026-10-27T22:30:00Z","2026-10-28")).toBe(true);
  expect(eventOverlapsRiyadhDay("2026-10-27T20:30:00Z","2026-10-27T22:30:00Z","2026-10-29")).toBe(false);
 });
 it("pads the month with Sunday-first calendar days",()=>{
  const days=monthCalendarDays("2026-10-27");
  expect(days).toHaveLength(42);expect(days[0]).toBe("2026-09-27");expect(days[4]).toBe("2026-10-01");
 });
});
