export type QueueResponseClass = "success" | "retry" | "quarantine";

export function classifyOfflineResponse(status: number): QueueResponseClass {
  if (status >= 200 && status < 300) return "success";
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return "quarantine";
  return "retry";
}

export function ensureIdempotencyKey(payload: Record<string, unknown>, makeKey: () => string): Record<string, unknown> {
  return payload.idempotencyKey ? payload : { ...payload, idempotencyKey: makeKey() };
}
