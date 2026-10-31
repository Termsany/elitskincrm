import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
import { mapInvoice, isoDate } from "@/lib/daftra";

describe("Daftra invoice mapping", () => {
  const inv = { id: "182", no: "00008D", date: "2026-09-15", due_after: "90", client_id: "17", client_business_name: "مستشفى المواساة", client_city: "dammam", payment_status: "1",
    currency_code: "SAR", summary_total: "27427.5", summary_paid: "10000", summary_unpaid: "17427.5", summary_refund: 0, modified: "2026-09-15 16:11:54",
    InvoiceTax: { 1: { invoice_value: 3577.5 } }, InvoiceCustomField: [{ label: "branch", value: "Dammam" }],
    InvoiceItem: [{ item: "DIVES AMI 200", unit_price: "900", quantity: "50", product_id: "15", subtotal: 27427.5, summary_tax1: 3577.5, calculated_discount: 21150 }] };
  it("recognises revenue net of VAT and keeps payment figures", () => {
    const { row, lines } = mapInvoice(inv);
    expect(row).toMatchObject({ id: 182, net: 23850, tax: 3577.5, total: 27427.5, paid: 10000, unpaid: 17427.5, branch: "dammam", due_days: 90, client_name: "مستشفى المواساة" });
    expect(lines).toEqual([{ line: 1, product_id: 15, item: "DIVES AMI 200", quantity: 50, unit_price: 900, discount: 21150, net: 23850, tax: 3577.5 }]);
  });
  it("falls back to the contact name and tolerates missing taxes/items", () => {
    const { row, lines } = mapInvoice({ id: "1", date: "2026-01-02", client_first_name: "ayob", summary_total: "100" });
    expect(row.client_name).toBe("ayob"); expect(row.net).toBe(100); expect(lines).toEqual([]);
  });
  it("normalises Daftra date formats", () => { expect(isoDate("15/09/2026")).toBe("2026-09-15"); expect(isoDate("2026-09-15 10:00")).toBe("2026-09-15"); expect(isoDate("5/1/2026")).toBe("2026-01-05"); expect(isoDate("")).toBe(""); });
});
