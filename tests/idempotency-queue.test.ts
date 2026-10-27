import { describe, expect, it } from "vitest";
import { classifyOfflineResponse, ensureIdempotencyKey } from "../src/lib/idempotency-queue";

describe("offline visit queue safety", () => {
  it("retries transient failures but quarantines permanent client errors", () => {
    expect(classifyOfflineResponse(201)).toBe("success");
    expect(classifyOfflineResponse(408)).toBe("retry");
    expect(classifyOfflineResponse(429)).toBe("retry");
    expect(classifyOfflineResponse(400)).toBe("quarantine");
    expect(classifyOfflineResponse(422)).toBe("quarantine");
    expect(classifyOfflineResponse(500)).toBe("retry");
  });
  it("keeps an existing key and creates one only for new payloads", () => {
    const make = () => "new-key";
    expect(ensureIdempotencyKey({ idempotencyKey: "old-key" }, make).idempotencyKey).toBe("old-key");
    expect(ensureIdempotencyKey({ doctorId: "d" }, make).idempotencyKey).toBe("new-key");
  });
});
