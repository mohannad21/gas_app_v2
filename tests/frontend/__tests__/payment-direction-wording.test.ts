import {
  formatBalanceTransitions,
  makeBalanceTransition,
} from "@/lib/balanceTransitions";
import { formatEventType } from "@/lib/reports/utils";

describe("payment direction wording", () => {
  const formatMoney = (value: number) => String(value);

  it("formats customer and company balance directions clearly", () => {
    expect(
      formatBalanceTransitions([makeBalanceTransition("customer", "money", 0, 150)], {
        mode: "current",
        formatMoney,
      })
    ).toEqual(["Debts on customer 150 $"]);

    expect(
      formatBalanceTransitions([makeBalanceTransition("customer", "money", 0, -150)], {
        mode: "current",
        formatMoney,
      })
    ).toEqual(["Credit for customer 150 $"]);

    expect(
      formatBalanceTransitions([makeBalanceTransition("company", "money", 0, 150)], {
        mode: "current",
        formatMoney,
      })
    ).toEqual(["Debts on distributor 150 $"]);

    expect(
      formatBalanceTransitions([makeBalanceTransition("company", "money", 0, -150)], {
        mode: "current",
        formatMoney,
      })
    ).toEqual(["Credit for distributor 150 $"]);
  });

  it("shows direction when a balance flips from debt to credit", () => {
    expect(
      formatBalanceTransitions([makeBalanceTransition("customer", "money", 100, -50)], {
        formatMoney,
      })
    ).toEqual(["Credit for customer 50 $ (was Debts on customer 100 $)"]);
  });

  it("uses canonical ACTIVITY_KIND_META labels for activity kinds", () => {
    expect(formatEventType("payment_from_customer")).toBe("Payment from customer");
    expect(formatEventType("payment_to_customer")).toBe("Payment to customer");
    expect(formatEventType("payment_to_company")).toBe("Payment to company");
    expect(formatEventType("buy_full_from_company")).toBe("Buy fulls");
  });
});

describe("cylinder balance wording (balance_row layout)", () => {
  it("singular debt: before=0, after=1 on customer", () => {
    const result = formatBalanceTransitions(
      [makeBalanceTransition("customer", "cyl_12", 0, 1)],
      { layout: "balance_row" }
    );
    expect(result).toEqual(["12kg balance: Settled → 1 debt (on customer)"]);
  });

  it("plural debts: before=0, after=2 on customer", () => {
    const result = formatBalanceTransitions(
      [makeBalanceTransition("customer", "cyl_12", 0, 2)],
      { layout: "balance_row" }
    );
    expect(result).toEqual(["12kg balance: Settled → 2 debts (on customer)"]);
  });

  it("singular credit: before=0, after=-1 on customer", () => {
    const result = formatBalanceTransitions(
      [makeBalanceTransition("customer", "cyl_12", 0, -1)],
      { layout: "balance_row" }
    );
    expect(result).toEqual(["12kg balance: Settled → 1 credit (for customer)"]);
  });

  it("plural credits: before=0, after=-2 on customer", () => {
    const result = formatBalanceTransitions(
      [makeBalanceTransition("customer", "cyl_12", 0, -2)],
      { layout: "balance_row" }
    );
    expect(result).toEqual(["12kg balance: Settled → 2 credits (for customer)"]);
  });

  it("company scope: positive after is credits for distributor", () => {
    const result = formatBalanceTransitions(
      [makeBalanceTransition("company", "cyl_12", 0, 2)],
      { layout: "balance_row" }
    );
    expect(result).toEqual(["12kg balance: Settled → 2 credits (for distributor)"]);
  });

  it("company scope: negative after is debts on distributor", () => {
    const result = formatBalanceTransitions(
      [makeBalanceTransition("company", "cyl_12", 0, -2)],
      { layout: "balance_row" }
    );
    expect(result).toEqual(["12kg balance: Settled → 2 debts (on distributor)"]);
  });

  it("unchanged non-zero balance shows current state, not a transition", () => {
    const result = formatBalanceTransitions(
      [makeBalanceTransition("customer", "cyl_12", 3, 3)],
      { layout: "balance_row" }
    );
    expect(result).toEqual(["12kg balance: unchanged — debts 3 (on customer)"]);
  });
});
