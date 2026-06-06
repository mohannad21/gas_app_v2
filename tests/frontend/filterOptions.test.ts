import { ACTIVITY_KIND_META } from "@/lib/activityKindMeta";
import {
  FILTER_HIERARCHY,
  getKindOptions,
  getSubFilterOptions,
} from "@/lib/filterOptions";

const ids = (items: { id: string }[]) => items.map((item) => item.id);
const replacementSubFilters = ["12kg_debt", "12kg_credit", "48kg_debt", "48kg_credit", "money_debt", "money_credit"];

describe("FILTER_HIERARCHY", () => {
  it("has exactly 4 groups in order", () => {
    expect(ids(FILTER_HIERARCHY)).toEqual(["customer", "company", "expenses", "ledger"]);
  });

  it("has customer kinds in canonical order", () => {
    expect(ids(getKindOptions("customer"))).toEqual([
      "replacement",
      "payment_from_customer",
      "customer_return_empties",
      "payment_to_customer",
      "sell_full",
      "buy_empty_from_customer",
      "adjust_customer_balance",
    ]);
  });

  it("has company kinds in canonical order", () => {
    expect(ids(getKindOptions("company"))).toEqual([
      "refill",
      "payment_to_company",
      "dist_return_empties",
      "payment_from_company",
      "buy_full_from_company",
      "adjust_company_balance",
    ]);
  });

  it("has expenses kinds in canonical order", () => {
    expect(ids(getKindOptions("expenses"))).toEqual(["expense", "bank_to_wallet", "wallet_to_bank"]);
  });

  it("has ledger kinds in canonical order", () => {
    expect(ids(getKindOptions("ledger"))).toEqual(["adjust_wallet", "adjust_inventory"]);
  });

  it("uses activity metadata labels for kind labels", () => {
    for (const group of FILTER_HIERARCHY) {
      for (const option of group.kinds) {
        expect(option.label).toBe(ACTIVITY_KIND_META[option.id].label);
      }
    }
  });
});

describe("sub-filter semantics", () => {
  it("replacement has 6 debt and credit sub-filters in order", () => {
    expect(ids(getSubFilterOptions("customer", "replacement"))).toEqual(replacementSubFilters);
  });

  it("sell_full has the same 6 sub-filters as replacement", () => {
    expect(ids(getSubFilterOptions("customer", "sell_full"))).toEqual(replacementSubFilters);
  });

  it("buy_empty_from_customer has gas sub-filters in order", () => {
    expect(ids(getSubFilterOptions("customer", "buy_empty_from_customer"))).toEqual(["12kg", "48kg"]);
  });

  it("customer_return_empties has gas sub-filters in order", () => {
    expect(ids(getSubFilterOptions("customer", "customer_return_empties"))).toEqual(["12kg", "48kg"]);
  });

  it("adjust_customer_balance has balance sub-filters in order", () => {
    expect(ids(getSubFilterOptions("customer", "adjust_customer_balance"))).toEqual(["12kg", "48kg", "money"]);
  });

  it("refill has the same 6 sub-filters as replacement", () => {
    expect(ids(getSubFilterOptions("company", "refill"))).toEqual(replacementSubFilters);
  });

  it("buy_full_from_company has money debt and credit sub-filters in order", () => {
    expect(ids(getSubFilterOptions("company", "buy_full_from_company"))).toEqual(["money_debt", "money_credit"]);
  });

  it("dist_return_empties has gas sub-filters in order", () => {
    expect(ids(getSubFilterOptions("company", "dist_return_empties"))).toEqual(["12kg", "48kg"]);
  });

  it("adjust_company_balance has balance sub-filters in order", () => {
    expect(ids(getSubFilterOptions("company", "adjust_company_balance"))).toEqual(["12kg", "48kg", "money"]);
  });

  it("kinds without sub-filters have none", () => {
    expect(getSubFilterOptions("customer", "payment_from_customer")).toEqual([]);
    expect(getSubFilterOptions("customer", "payment_to_customer")).toEqual([]);
    expect(getSubFilterOptions("company", "payment_to_company")).toEqual([]);
    expect(getSubFilterOptions("company", "payment_from_company")).toEqual([]);
    expect(getSubFilterOptions("expenses", "bank_to_wallet")).toEqual([]);
    expect(getSubFilterOptions("expenses", "wallet_to_bank")).toEqual([]);
    expect(getSubFilterOptions("ledger", "adjust_wallet")).toEqual([]);
  });

  it("expense has no static sub-filters", () => {
    expect(getSubFilterOptions("expenses", "expense")).toEqual([]);
  });

  it("adjust_inventory has inventory sub-filters in order", () => {
    expect(ids(getSubFilterOptions("ledger", "adjust_inventory"))).toEqual([
      "12kg_full",
      "12kg_empty",
      "48kg_full",
      "48kg_empty",
    ]);
  });
});

describe("filter option helpers", () => {
  it("getKindOptions returns customer kinds in order", () => {
    expect(ids(getKindOptions("customer"))).toEqual([
      "replacement",
      "payment_from_customer",
      "customer_return_empties",
      "payment_to_customer",
      "sell_full",
      "buy_empty_from_customer",
      "adjust_customer_balance",
    ]);
  });

  it("getKindOptions returns an empty array for unknown groups", () => {
    expect(getKindOptions("nonexistent")).toEqual([]);
  });

  it("getSubFilterOptions returns replacement sub-filters", () => {
    expect(ids(getSubFilterOptions("customer", "replacement"))).toEqual(replacementSubFilters);
  });

  it("getSubFilterOptions returns an empty array for kinds with no sub-filters", () => {
    expect(getSubFilterOptions("customer", "payment_from_customer")).toEqual([]);
  });

  it("getSubFilterOptions returns an empty array for unknown groups", () => {
    expect(getSubFilterOptions("nonexistent", "replacement")).toEqual([]);
  });

  it("replacement has no system-level option", () => {
    const options = getSubFilterOptions("customer", "replacement");
    expect(options.some((option) => option.id.includes("system"))).toBe(false);
    expect(options.some((option) => /system/i.test(option.label))).toBe(false);
  });
});
