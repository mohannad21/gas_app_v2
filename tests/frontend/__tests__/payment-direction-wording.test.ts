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
      "Debts on customer 150 $"
    );
    expect(formatCurrentBalanceState("customer", "money", -150, { formatMoney })).toBe(
      "Credit for customer 150 $"
    );
    expect(formatCurrentBalanceState("company", "money", 150, { formatMoney })).toBe(
      "Debts on distributor 150 $"
    );
    expect(formatCurrentBalanceState("company", "money", -150, { formatMoney })).toBe(
      "Credit for distributor 150 $"
    );
  });

  it("shows direction when a balance flips from debt to credit", () => {
    expect(
      formatBalanceTransitions([makeBalanceTransition("customer", "money", 100, -50)], {
        formatMoney,
      })
    ).toEqual(["Credit for customer 50 $ (was Debts on customer 100 $)"]);
  });

  it("uses canonical ACTIVITY_KIND_META labels for activity kinds", () => {
    expect(formatEventType("collection_money")).toBe("Payment from customer");
    expect(formatEventType("collection_payout")).toBe("Payment to customer");
    expect(formatEventType("company_payment")).toBe("Payment to company");
    expect(formatEventType("company_buy_iron")).toBe("Buy fulls");
  });
});
