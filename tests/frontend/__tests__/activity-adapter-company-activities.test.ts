import {
  companyBalanceAdjustmentToEvent,
  companyPaymentToEvent,
  refillSummaryToEvent,
} from "@/lib/activityAdapter";
import type { BalanceTransition, CompanyBalanceAdjustment, CompanyPayment, InventoryRefillSummary } from "@/types/domain";

function transition(
  transitions: BalanceTransition[] | null | undefined,
  component: BalanceTransition["component"]
): BalanceTransition | undefined {
  return transitions?.find((item) => item.scope === "company" && item.component === component);
}

function makeRefill(overrides: Partial<InventoryRefillSummary> = {}): InventoryRefillSummary {
  return {
    refill_id: "refill-1",
    date: "2026-05-14",
    effective_at: "2026-05-14T09:00:00Z",
    created_at: "2026-05-14T09:00:00Z",
    buy12: 0,
    return12: 0,
    buy48: 0,
    return48: 0,
    new12: 0,
    new48: 0,
    total_cost: 0,
    paid_amount: 0,
    debt_cash: 0,
    debt_cylinders_12: 0,
    debt_cylinders_48: 0,
    is_deleted: false,
    ...overrides,
  };
}

function makeCompanyPayment(overrides: Partial<CompanyPayment> = {}): CompanyPayment {
  return {
    id: "company-payment-1",
    happened_at: "2026-05-14T10:00:00Z",
    created_at: "2026-05-14T10:00:00Z",
    amount: 50,
    note: null,
    is_deleted: false,
    live_debt_cash: 100,
    ...overrides,
  };
}

function makeCompanyAdjustment(overrides: Partial<CompanyBalanceAdjustment> = {}): CompanyBalanceAdjustment {
  return {
    id: "company-adjustment-1",
    happened_at: "2026-05-14T11:00:00Z",
    created_at: "2026-05-14T11:00:00Z",
    money_balance: 120,
    cylinder_balance_12: 3,
    cylinder_balance_48: -1,
    delta_money: 20,
    delta_cylinder_12: -2,
    delta_cylinder_48: 1,
    live_debt_cash: 120,
    live_debt_cylinders_12: 3,
    live_debt_cylinders_48: -1,
    note: null,
    is_deleted: false,
    ...overrides,
  };
}

describe("activityAdapter company activities", () => {
  it("maps refill into company balances and transitions", () => {
    const event = refillSummaryToEvent(
      makeRefill({
        buy12: 3,
        return12: 1,
        buy48: 1,
        return48: 0,
        total_cost: 300,
        paid_amount: 200,
        live_debt_cash: 60,
        live_debt_cylinders_12: 4,
        live_debt_cylinders_48: 2,
      })
    );

    expect(event.event_type).toBe("refill");
    expect(event.label).toBe("Refill");
    expect(event.hero_text).toBe("Buy 3x12kg | Buy 1x48kg | Return 1x12kg");
    expect(event.company_before).toBe(-40);
    expect(event.company_after).toBe(60);
    expect(event.company_12kg_before).toBe(6);
    expect(event.company_12kg_after).toBe(4);
    expect(event.company_48kg_before).toBe(3);
    expect(event.company_48kg_after).toBe(2);
    expect(transition(event.balance_transitions, "money")).toMatchObject({ before: -40, after: 60 });
    expect(transition(event.balance_transitions, "cyl_12")).toMatchObject({ before: 6, after: 4 });
    expect(transition(event.balance_transitions, "cyl_48")).toMatchObject({ before: 3, after: 2 });
  });

  it("maps payment_to_company and payment_from_company directions", () => {
    const paymentToCompany = companyPaymentToEvent(makeCompanyPayment({ amount: 50, live_debt_cash: 100 }));
    const paymentFromCompany = companyPaymentToEvent(
      makeCompanyPayment({
        id: "company-payment-from-1",
        amount: -30,
        live_debt_cash: 70,
      })
    );

    expect(paymentToCompany.label).toBe("Paid company");
    expect(paymentToCompany.money_direction).toBe("out");
    expect(paymentToCompany.money_amount).toBe(50);
    expect(paymentToCompany.company_before).toBe(150);
    expect(paymentToCompany.company_after).toBe(100);
    expect(transition(paymentToCompany.balance_transitions, "money")).toMatchObject({ before: 150, after: 100 });

    expect(paymentFromCompany.label).toBe("Company paid");
    expect(paymentFromCompany.money_direction).toBe("in");
    expect(paymentFromCompany.money_amount).toBe(30);
    expect(paymentFromCompany.company_before).toBe(40);
    expect(paymentFromCompany.company_after).toBe(70);
    expect(transition(paymentFromCompany.balance_transitions, "money")).toMatchObject({ before: 40, after: 70 });
  });

  it("maps buy_full_from_company into money-only company transitions", () => {
    const event = refillSummaryToEvent(
      makeRefill({
        kind: "buy_full_from_company",
        buy12: 2,
        buy48: 1,
        new12: 2,
        new48: 1,
        total_cost: 300,
        paid_amount: 100,
        live_debt_cash: 50,
        live_debt_cylinders_12: -6,
        live_debt_cylinders_48: 4,
      })
    );

    expect(event.event_type).toBe("buy_full_from_company");
    expect(event.label).toBe("Bought full");
    expect(event.company_before).toBe(-150);
    expect(event.company_after).toBe(50);
    expect(event.company_12kg_before).toBe(-6);
    expect(event.company_12kg_after).toBe(-6);
    expect(event.company_48kg_before).toBe(4);
    expect(event.company_48kg_after).toBe(4);
    expect(transition(event.balance_transitions, "money")).toMatchObject({ before: -150, after: 50 });
    expect(transition(event.balance_transitions, "cyl_12")).toBeUndefined();
    expect(transition(event.balance_transitions, "cyl_48")).toBeUndefined();
  });

  it("maps dist_return_empties into company cylinder transitions", () => {
    const event = refillSummaryToEvent(
      makeRefill({
        return12: 2,
        return48: 1,
        live_debt_cash: 0,
        live_debt_cylinders_12: 4,
        live_debt_cylinders_48: 2,
      })
    );

    expect(event.event_type).toBe("dist_return_empties");
    expect(event.label).toBe("Returned empties");
    expect(event.hero_text).toBe("Return 2x12kg | Return 1x48kg");
    expect(event.company_12kg_before).toBe(2);
    expect(event.company_12kg_after).toBe(4);
    expect(event.company_48kg_before).toBe(1);
    expect(event.company_48kg_after).toBe(2);
    expect(transition(event.balance_transitions, "money")).toBeUndefined();
    expect(transition(event.balance_transitions, "cyl_12")).toMatchObject({ before: 2, after: 4 });
    expect(transition(event.balance_transitions, "cyl_48")).toMatchObject({ before: 1, after: 2 });
  });

  it("maps adjust_company_balance into company balance transitions", () => {
    const event = companyBalanceAdjustmentToEvent(makeCompanyAdjustment());

    expect(event.event_type).toBe("company_adjustment");
    expect(event.label).toBe("Balance adjustment");
    expect(event.hero_text).toBe("Money 20.00 | 12kg 2 | 48kg 1");
    expect(event.company_before).toBe(100);
    expect(event.company_after).toBe(120);
    expect(event.company_12kg_before).toBe(5);
    expect(event.company_12kg_after).toBe(3);
    expect(event.company_48kg_before).toBe(-2);
    expect(event.company_48kg_after).toBe(-1);
    expect(transition(event.balance_transitions, "money")).toMatchObject({ before: 100, after: 120 });
    expect(transition(event.balance_transitions, "cyl_12")).toMatchObject({ before: 5, after: 3 });
    expect(transition(event.balance_transitions, "cyl_48")).toMatchObject({ before: -2, after: -1 });
  });
});
