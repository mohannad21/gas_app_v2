import {
  formatBalanceTransitions,
  formatCurrentBalanceState,
  makeBalanceTransition,
} from "@/lib/balanceTransitions";
import { formatEventType } from "@/lib/reports/utils";

describe("payment direction wording", () => {
  const formatMoney = (value: number) => String(value);

  it("formats customer and company balance directions clearly", () => {
    expect(formatCurrentBalanceState("customer", "money", 150, { formatMoney })).toBe(
      "Customer owes you EUR 150"
    );
    expect(formatCurrentBalanceState("customer", "money", -150, { formatMoney })).toBe(
      "You owe customer EUR 150"
    );
    expect(formatCurrentBalanceState("company", "money", 150, { formatMoney })).toBe(
      "You owe company EUR 150"
    );
    expect(formatCurrentBalanceState("company", "money", -150, { formatMoney })).toBe(
      "Company owes you EUR 150"
    );
  });

  it("shows direction when a balance flips from debt to credit", () => {
    expect(
      formatBalanceTransitions([makeBalanceTransition("customer", "money", 100, -50)], {
        formatMoney,
      })
    ).toEqual(["You owe customer EUR 50 (was Customer owes you EUR 100)"]);
  });

  it("uses updated report shorthand labels for payment directions", () => {
    expect(formatEventType("collection_money")).toBe("From Customer");
    expect(formatEventType("collection_payout")).toBe("To Customer");
    expect(formatEventType("company_payment")).toBe("Company Payment");
  });
});
