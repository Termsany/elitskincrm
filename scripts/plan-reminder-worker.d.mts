export function isReminderHour(now?: Date): boolean;
export function sendTaskReminders(options?: { secret?: string; baseUrl?: string; fetchImpl?: typeof fetch }): Promise<number>;
