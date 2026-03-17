import { formatBalanceTransitionLines, makeBalanceTransition } from "@/lib/balanceTransitions";

describe("balance transition wording", () => {
  it("uses now wording for new debt", () => {
    expect(
      formatBalanceTransitionLines([makeBalanceTransition("customer", "money", 0, 130)], {
        mode: "transition",
      })
    ).toEqual([{ text: "Customer now owes you EUR 130", tone: "debt" }]);
  });

  it("uses still wording for same-side debt", () => {
    expect(
      formatBalanceTransitionLines([makeBalanceTransition("customer", "cyl_12", 3, 2)], {
        mode: "transition",
      })
    ).toEqual([{ text: "Customer still owes you 2x12kg empties (was 3)", tone: "debt" }]);
  });

  it("renders cross-zero as settled plus now", () => {
    expect(
      formatBalanceTransitionLines([makeBalanceTransition("customer", "money", 120, -20)], {
        mode: "transition",
      })
    ).toEqual([
      { text: "Money settled", tone: "settled" },
      { text: "You now owe customer EUR 20", tone: "credit" },
    ]);
  });

  it("renders customer cylinder credit as fulls", () => {
    expect(
      formatBalanceTransitionLines([makeBalanceTransition("customer", "cyl_48", 0, -1)], {
        mode: "transition",
      })
    ).toEqual([{ text: "You now owe customer 1x48kg full", tone: "credit" }]);
  });
});
