import { refillSummaryToEvent } from "@/lib/activityAdapter";
import { InventoryRefillSummary } from "@/types/domain";

function makeRefill(overrides: Partial<InventoryRefillSummary> = {}): InventoryRefillSummary {
  return {
    refill_id: "refill-1",
    date: "2026-05-05",
    effective_at: "2026-05-05T16:16:00Z",
    created_at: "2026-05-05T16:16:00Z",
    buy12: 0,
    return12: 0,
    buy48: 0,
    return48: 0,
    new12: 0,
    new48: 0,
    total_cost: 0,
    paid_now: 0,
    debt_cash: 0,
    debt_cylinders_12: 0,
    debt_cylinders_48: 0,
    is_deleted: false,
    ...overrides,
  };
}

describe("activityAdapter company balance pills", () => {
  it("keeps the company money transition on refill cards when money is unchanged but non-zero", () => {
    const event = refillSummaryToEvent(
      makeRefill({
        buy12: 3,
        return12: 3,
        buy48: 4,
        return48: 4,
        total_cost: 2090,
        paid_now: 2090,
        live_debt_cash: -200,
        live_debt_cylinders_12: -6,
        live_debt_cylinders_48: -10,
      })
    );

    expect(event.event_type).toBe("refill");
    expect(event.company_before).toBe(-200);
    expect(event.company_after).toBe(-200);
    expect(event.balance_transitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: "company", component: "money", before: -200, after: -200 }),
        expect.objectContaining({ scope: "company", component: "cyl_12", before: -6, after: -6 }),
        expect.objectContaining({ scope: "company", component: "cyl_48", before: -10, after: -10 }),
      ])
    );
  });

  it("renders company money and unchanged cylinder transitions for buy-full cards", () => {
    const event = refillSummaryToEvent(
      makeRefill({
        kind: "buy_iron",
        buy12: 2,
        buy48: 1,
        new12: 2,
        new48: 1,
        total_cost: 300,
        paid_now: 100,
        live_debt_cash: 50,
        live_debt_cylinders_12: -6,
        live_debt_cylinders_48: 4,
      })
    );

    expect(event.event_type).toBe("company_buy_iron");
    expect(event.company_before).toBe(-150);
    expect(event.company_after).toBe(50);
    expect(event.company_12kg_before).toBe(-6);
    expect(event.company_12kg_after).toBe(-6);
    expect(event.company_48kg_before).toBe(4);
    expect(event.company_48kg_after).toBe(4);
    expect(event.balance_transitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: "company", component: "money", before: -150, after: 50 }),
        expect.objectContaining({ scope: "company", component: "cyl_12", before: -6, after: -6 }),
        expect.objectContaining({ scope: "company", component: "cyl_48", before: 4, after: 4 }),
      ])
    );
  });
});
