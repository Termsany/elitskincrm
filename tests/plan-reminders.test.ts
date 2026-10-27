import { describe, expect, it } from "vitest";
import { isRiyadhReminderHour, groupPlanItemsByDate, buildDailyReminderMessage, taskReminderDateWindow } from "@/lib/plan-reminders";

describe("plan reminders", () => {
  it("runs during 08:00 Riyadh hour", () => {
    expect(isRiyadhReminderHour(new Date("2026-10-23T05:15:00.000Z"))).toBe(true);
    expect(isRiyadhReminderHour(new Date("2026-10-23T04:59:00.000Z"))).toBe(false);
    expect(isRiyadhReminderHour(new Date("2026-10-23T06:00:00.000Z"))).toBe(false);
  });

  it("calculates task reminder dates at Riyadh midnight rather than UTC midnight", () => {
    expect(taskReminderDateWindow(new Date("2026-10-24T20:59:00.000Z"))).toEqual({ today: "2026-10-24", tomorrow: "2026-10-25" });
    expect(taskReminderDateWindow(new Date("2026-10-24T21:00:00.000Z"))).toEqual({ today: "2026-10-25", tomorrow: "2026-10-26" });
  });

  it("groups weekly plan items by planned date", () => {
    const grouped = groupPlanItemsByDate([
      { planned_date: "2026-10-25", doctor_name: "د. أحمد", clinic_name: "عيادة أ" },
      { planned_date: "2026-10-25", doctor_name: "د. سارة", clinic_name: "عيادة ب" },
      { planned_date: "2026-10-26", doctor_name: "د. محمد", clinic_name: "عيادة ج" },
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].date).toBe("2026-10-25");
    expect(grouped[0].items).toHaveLength(2);
  });

  it("builds a useful daily reminder", () => {
    expect(buildDailyReminderMessage(["د. أحمد", "د. سارة"])).toBe("لديك اليوم زيارتان: د. أحمد، د. سارة");
    expect(buildDailyReminderMessage(["د. أحمد"])).toBe("لديك اليوم زيارة واحدة: د. أحمد");
  });
});
