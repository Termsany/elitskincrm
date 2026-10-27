import { describe, expect, it, vi } from "vitest";
import { isReminderHour, sendTaskReminders } from "../scripts/plan-reminder-worker.mjs";

describe("reminder worker", () => {
  it("runs the daily task reminders at 08:00 Riyadh time", () => {
    expect(isReminderHour(new Date("2026-10-25T05:00:00.000Z"))).toBe(true);
    expect(isReminderHour(new Date("2026-10-25T04:59:00.000Z"))).toBe(false);
  });

  it("calls the protected task reminder endpoint with the configured bearer secret", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ created: 3 }), { status: 200 }));
    const created = await sendTaskReminders({ secret: "unit-test-secret", baseUrl: "http://app:3100", fetchImpl });
    expect(created).toBe(3);
    expect(fetchImpl).toHaveBeenCalledWith(new URL("/api/tasks/reminders", "http://app:3100"), expect.objectContaining({
      method: "GET",
      headers: { authorization: "Bearer unit-test-secret" },
      cache: "no-store",
    }));
  });

  it("does not make unauthenticated requests", async () => {
    const fetchImpl = vi.fn();
    await expect(sendTaskReminders({ secret: "", fetchImpl })).rejects.toThrow("CRON_SECRET is not configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
