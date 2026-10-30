import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ user: vi.fn(), query: vi.fn(), connect: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mock.user }));
vi.mock("@/lib/db", () => ({ query: mock.query, pool: { connect: mock.connect } }));
import { PATCH } from "@/app/api/visits/[id]/route";

const id = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const rep = "33333333-3333-4333-8333-333333333333";
const visit = () => ({ sales_rep_id: rep, visited_at: new Date().toISOString() });
const patch = (body: Record<string, unknown>) => PATCH(new Request(`http://localhost/api/visits/${id}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

function database(status: "pending" | "approved" | "rejected" = "approved", gate?: { promise: Promise<void> }) {
  const sql: string[] = [];
  let release = vi.fn();
  const client = { query: vi.fn(async (statement: string) => {
    sql.push(statement);
    if (statement.includes("FROM visits WHERE id=$1 FOR UPDATE")) return { rows: [visit()] };
    if (statement.includes("INSERT INTO visit_items") && statement.includes("RETURNING id")) return { rows: [{ id: productId }], rowCount: 1 };
    if (statement.includes("FROM visit_items WHERE visit_id=$1 AND kind='order' FOR UPDATE")) {
      if (gate) await gate.promise;
      return { rows: [{ id: productId, approval_status: status }] };
    }
    return { rows: [], rowCount: 1 };
  }), release: () => release() };
  mock.connect.mockResolvedValue(client);
  return { sql, client, release };
}

beforeEach(() => {
  vi.resetAllMocks();
  mock.user.mockResolvedValue({ id: rep, role: "sales_rep", name: "مندوب" });
  mock.query.mockImplementation(async (sql: string) => sql.startsWith("SELECT sales_rep_id") ? { rows: [visit()] } : { rows: [] });
});

describe("visit item edits preserve order decisions", () => {
  it("can edit samples without deleting any pending or decided order", async () => {
    const db = database("approved");
    const response = await patch({ sampleItems: [{ productId, quantity: 1, purpose: "trial" }] });
    expect(response.status).toBe(200);
    expect(db.sql).toContain("DELETE FROM visit_items WHERE visit_id=$1 AND kind='sample'");
    expect(db.sql.some(q => q.includes("kind='order'"))).toBe(false);
    expect(db.sql.at(-1)).toBe("COMMIT");
    expect(db.release).toHaveBeenCalledOnce();
  });
  it("rejects replacement after an order was approved without touching the order or notes", async () => {
    const db = database("approved");
    const response = await patch({ orderItems: [], notes: "Some valid long notes" });
    expect(response.status).toBe(409);
    expect(db.sql.at(-1)).toBe("ROLLBACK");
    expect(db.sql.some(q => q.startsWith("DELETE FROM visit_items") || q.startsWith("UPDATE visits"))).toBe(false);
  });
  it("waits for a concurrent approval and rejects against its final status", async () => {
    let resolve!: () => void;
    const gate = { promise: new Promise<void>(r => { resolve = r; }) };
    const db = database("approved", gate);
    const promise = patch({ orderItems: [{ productId, quantity: 2 }] });
    await vi.waitFor(() => expect(db.sql.some(q => q.includes("FROM visit_items WHERE visit_id=$1 AND kind='order' FOR UPDATE"))).toBe(true));
    expect(db.sql.some(q => q.startsWith("DELETE FROM visit_items"))).toBe(false);
    resolve();
    expect((await promise).status).toBe(409);
    expect(db.sql.at(-1)).toBe("ROLLBACK");
  });
  it("replaces only pending orders in one transaction", async () => {
    const db = database("pending");
    const response = await patch({ orderItems: [{ productId, quantity: 2 }] });
    expect(response.status).toBe(200);
    expect(db.sql).toContain("DELETE FROM visit_items WHERE visit_id=$1 AND kind='order' AND approval_status='pending'");
    expect(db.sql.at(-1)).toBe("COMMIT");
  });
  it("rejects malformed arrays before opening a transaction", async () => {
    expect((await patch({ orderItems: [null] })).status).toBe(400);
    expect((await patch({ sampleItems: [{ productId, quantity: -1 }] })).status).toBe(400);
    expect(mock.connect).not.toHaveBeenCalled();
  });
});
