import {
  ACTIVITY_KIND_META,
  ACTIVITY_SUBFILTER_META,
  ALL_ACTIVITY_KINDS,
} from "@/lib/activityKindMeta";

const EXPECTED_KINDS = [
  "replacement",
  "sell_full",
  "buy_empty_from_customer",
  "payment_from_customer",
  "payment_to_customer",
  "customer_return_empties",
  "adjust_customer_balance",
  "refill",
  "dist_return_empties",
  "buy_full_from_company",
  "payment_to_company",
  "payment_from_company",
  "adjust_company_balance",
  "expense",
  "bank_to_wallet",
  "wallet_to_bank",
  "adjust_inventory",
  "adjust_wallet",
] as const;

const VALID_BADGE_MODES = ["ratio", "money", "none"] as const;
const VALID_LEDGER_MODES = [
  "selectedGas",
  "selectedGasEmptyOnly",
  "bothEmpties",
  "bothFullsAndWallet",
  "allGas",
  "walletOnly",
  "none",
] as const;
const VALID_DIRECTIONS = ["in", "out"] as const;
const VALID_WALLET_POLICIES = ["whenPresent", "whenChanged", "never"] as const;
const VALID_SELECTED_GAS_BOXES = ["full", "empty", "wallet"] as const;

describe("activity kind registry", () => {
  it("ACTIVITY_KIND_META has exactly 18 kinds", () => {
    expect(Object.keys(ACTIVITY_KIND_META)).toHaveLength(18);
  });

  it("ALL_ACTIVITY_KINDS has exactly 18 entries", () => {
    expect(ALL_ACTIVITY_KINDS).toHaveLength(18);
  });

  it("ACTIVITY_SUBFILTER_META has exactly 13 entries", () => {
    expect(Object.keys(ACTIVITY_SUBFILTER_META)).toHaveLength(13);
  });

  it.each(EXPECTED_KINDS)("%s is present in ACTIVITY_KIND_META", (kind) => {
    expect(ACTIVITY_KIND_META).toHaveProperty(kind);
  });

  it.each(EXPECTED_KINDS)("%s has required scalar fields", (kind) => {
    const meta = ACTIVITY_KIND_META[kind];
    expect(typeof meta.label).toBe("string");
    expect(meta.label.length).toBeGreaterThan(0);
    expect(typeof meta.order).toBe("number");
    expect(typeof meta.filterGroup).toBe("string");
  });

  it.each(EXPECTED_KINDS)("%s surfaces has three boolean fields", (kind) => {
    const { surfaces } = ACTIVITY_KIND_META[kind];
    expect(typeof surfaces.addEntry).toBe("boolean");
    expect(typeof surfaces.dailyReport).toBe("boolean");
    expect(typeof surfaces.customerReview).toBe("boolean");
  });

  it.each(EXPECTED_KINDS)("%s card.paidBadge has a valid mode and direction", (kind) => {
    const { paidBadge } = ACTIVITY_KIND_META[kind].card;
    expect(VALID_BADGE_MODES).toContain(paidBadge.mode);
    if (paidBadge.mode !== "none") {
      expect(VALID_DIRECTIONS).toContain((paidBadge as { direction: string }).direction);
    }
  });

  it.each(EXPECTED_KINDS)("%s card.ledgerBoxes has a valid mode", (kind) => {
    const { ledgerBoxes } = ACTIVITY_KIND_META[kind].card;
    expect(VALID_LEDGER_MODES).toContain(ledgerBoxes.mode);
  });

  it.each(EXPECTED_KINDS)(
    "%s selectedGas boxes only contain full, empty, or wallet",
    (kind) => {
      const { ledgerBoxes } = ACTIVITY_KIND_META[kind].card;
      if (ledgerBoxes.mode === "selectedGas") {
        for (const box of ledgerBoxes.boxes) {
          expect(VALID_SELECTED_GAS_BOXES).toContain(box);
        }
      }
    }
  );

  it.each(EXPECTED_KINDS)("%s allGas has a valid wallet policy", (kind) => {
    const { ledgerBoxes } = ACTIVITY_KIND_META[kind].card;
    if (ledgerBoxes.mode === "allGas") {
      expect(VALID_WALLET_POLICIES).toContain(ledgerBoxes.wallet);
    }
  });

  it.each(EXPECTED_KINDS)(
    "%s subFilters is an array and all entries exist in ACTIVITY_SUBFILTER_META",
    (kind) => {
      const { subFilters } = ACTIVITY_KIND_META[kind];
      expect(Array.isArray(subFilters)).toBe(true);
      for (const subId of subFilters) {
        expect(ACTIVITY_SUBFILTER_META).toHaveProperty(subId);
      }
    }
  );

  it("all 18 kinds have addEntry: true", () => {
    for (const kind of EXPECTED_KINDS) {
      expect(ACTIVITY_KIND_META[kind].surfaces.addEntry).toBe(true);
    }
  });

  it("only adjust_customer_balance and adjust_company_balance have dailyReport: false", () => {
    const excluded = EXPECTED_KINDS.filter(
      (kind) => !ACTIVITY_KIND_META[kind].surfaces.dailyReport
    );
    expect(excluded.sort()).toEqual(
      ["adjust_company_balance", "adjust_customer_balance"].sort()
    );
  });

  it("customerReview is true only for the 7 customer-group kinds", () => {
    const crKinds = EXPECTED_KINDS.filter(
      (kind) => ACTIVITY_KIND_META[kind].surfaces.customerReview
    );
    expect(crKinds.sort()).toEqual(
      [
        "adjust_customer_balance",
        "buy_empty_from_customer",
        "customer_return_empties",
        "payment_from_customer",
        "payment_to_customer",
        "replacement",
        "sell_full",
      ].sort()
    );
  });

  it("ALL_ACTIVITY_KINDS contains every expected kind", () => {
    for (const kind of EXPECTED_KINDS) {
      expect(ALL_ACTIVITY_KINDS).toContain(kind);
    }
  });

  it("refill uses allGas with wallet: whenPresent", () => {
    const { ledgerBoxes } = ACTIVITY_KIND_META.refill.card;
    expect(ledgerBoxes.mode).toBe("allGas");
    if (ledgerBoxes.mode === "allGas") {
      expect(ledgerBoxes.wallet).toBe("whenPresent");
    }
  });

  it("adjust_inventory uses allGas with wallet: whenChanged", () => {
    const { ledgerBoxes } = ACTIVITY_KIND_META.adjust_inventory.card;
    expect(ledgerBoxes.mode).toBe("allGas");
    if (ledgerBoxes.mode === "allGas") {
      expect(ledgerBoxes.wallet).toBe("whenChanged");
    }
  });
});
