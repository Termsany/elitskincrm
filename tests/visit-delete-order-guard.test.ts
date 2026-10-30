import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ user: vi.fn(), connect: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mock.user }));
vi.mock("@/lib/db", () => ({ query: mock.query, pool: { connect: mock.connect } }));
import { DELETE } from "@/app/api/visits/[id]/route";

const id = "11111111-1111-4111-8111-111111111111";
const admin = "22222222-2222-4222-8222-222222222222";
const call = (target = id) => DELETE(new Request(`http://localhost/api/visits/${target}`, { method: "DELETE" }), { params: Promise.resolve({ id: target }) });
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
function database(status: "pending" | "approved" | "rejected" = "approved", gate?: ReturnType<typeof deferred>) {
  const queries: string[] = [];
  const release = vi.fn();
  let removed = false;
  const client = { query: vi.fn(async (sql: string) => {
    queries.push(sql);
    if (sql === "SELECT id FROM visits WHERE id=$1 FOR UPDATE") return { rows: [{ id }] };
    if (sql === "SELECT id, approval_status FROM visit_items WHERE visit_id=$1 AND kind='order' FOR UPDATE") {
      if (gate) await gate.promise;
      return { rows: [{ id: admin, approval_status: status }] };
    }
    if (sql === "DELETE FROM visits WHERE id=$1") removed = true;
    return { rows: [] };
  }), release };
  mock.connect.mockResolvedValue(client);
  return { queries, release, get removed() { return removed; } };
}
beforeEach(() => { vi.resetAllMocks(); mock.user.mockResolvedValue({ id: admin, role: "admin" }); });

describe("visit deletion preserves adjudicated orders", () => {
  it("refuses to cascade-delete an approved order and releases the lock", async () => {
    const db = database("approved");
    expect((await call()).status).toBe(409);
    expect(db.queries).toEqual(["BEGIN", "SELECT id FROM visits WHERE id=$1 FOR UPDATE", "SELECT id, approval_status FROM visit_items WHERE visit_id=$1 AND kind='order' FOR UPDATE", "ROLLBACK"]);
    expect(db.removed).toBe(false);
    expect(db.release).toHaveBeenCalledOnce();
  });
  it("waits on a concurrent decision and rejects the now-decided order", async () => {
    const gate = deferred();
    const db = database("rejected", gate);
    const response = call();
    await vi.waitFor(() => expect(db.queries).toContain("SELECT id, approval_status FROM visit_items WHERE visit_id=$1 AND kind='order' FOR UPDATE"));
    expect(db.removed).toBe(false);
    gate.resolve();
    expect((await response).status).toBe(409);
    expect(db.removed).toBe(false);
  });
  it("allows a pending-only visit to be deleted and audits in the same transaction", async () => {
    const db = database("pending");
    expect((await call()).status).toBe(200);
    expect(db.queries).toContain("DELETE FROM visits WHERE id=$1");
    expect(db.queries.some(q => q.startsWith("INSERT INTO audit_logs"))).toBe(true);
    expect(db.queries.at(-1)).toBe("COMMIT");
    expect(db.removed).toBe(true);
  });
  it("rejects non-admin and malformed IDs before opening a transaction", async () => {
    database();
    mock.user.mockResolvedValueOnce({ id: id, role: "sales_rep" });
    expect((await call()).status).toBe(403);
    expect((await call("bad-id")).status).toBe(400);
    expect(mock.connect).not.toHaveBeenCalled();
  });
});
