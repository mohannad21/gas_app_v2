import {
  ACTIVITY_KIND_META,
  ACTIVITY_SUBFILTER_META,
  ALL_ACTIVITY_KINDS,
} from "@/lib/activityKindMeta";
import {
  FILTER_HIERARCHY,
  getGroupOptions,
  getKindOptions,
  getSubFilterOptions,
  resolveFilterKind,
  resolveFilterLabel,
} from "@/lib/filterOptions";

describe("filterOptions registry derivation", () => {
  it("FILTER_HIERARCHY has exactly 4 groups in canonical order", () => {
    expect(FILTER_HIERARCHY.map((group) => group.id)).toEqual([
      "customer",
      "company",
      "expenses",
      "ledger",
    ]);
  });

  it("getGroupOptions returns FILTER_HIERARCHY", () => {
    expect(getGroupOptions()).toBe(FILTER_HIERARCHY);
  });

  it("includes every addEntry-visible kind exactly once across all groups", () => {
    const expectedKinds = ALL_ACTIVITY_KINDS.filter(
      (kind) => ACTIVITY_KIND_META[kind].surfaces.addEntry
    ).sort();

    const actualKinds = FILTER_HIERARCHY.flatMap((group) =>
      group.kinds.map((kind) => kind.id)
    ).sort();

    expect(actualKinds).toEqual(expectedKinds);
  });

  it("every kind belongs to its registry filterGroup", () => {
    for (const group of FILTER_HIERARCHY) {
      for (const kind of group.kinds) {
        expect(ACTIVITY_KIND_META[kind.id].filterGroup).toBe(group.id);
      }
    }
  });

  it("kinds within each group are sorted by registry order", () => {
    for (const group of FILTER_HIERARCHY) {
      const orders = group.kinds.map((kind) => ACTIVITY_KIND_META[kind.id].order);
      for (let index = 1; index < orders.length; index += 1) {
        expect(orders[index]).toBeGreaterThanOrEqual(orders[index - 1]);
      }
    }
  });

  it("kind labels come from ACTIVITY_KIND_META", () => {
    for (const group of FILTER_HIERARCHY) {
      for (const kind of group.kinds) {
        expect(kind.label).toBe(ACTIVITY_KIND_META[kind.id].label);
      }
    }
  });

  it("subfilter IDs and labels come from registry sources", () => {
    for (const group of FILTER_HIERARCHY) {
      for (const kind of group.kinds) {
        expect(kind.subFilters.map((subFilter) => subFilter.id)).toEqual(
          [...ACTIVITY_KIND_META[kind.id].subFilters]
        );

        for (const subFilter of kind.subFilters) {
          expect(subFilter.label).toBe(
            ACTIVITY_SUBFILTER_META[subFilter.id as keyof typeof ACTIVITY_SUBFILTER_META].label
          );
        }
      }
    }
  });

  it("getKindOptions returns an empty array for unknown groups", () => {
    expect(getKindOptions("unknown")).toEqual([]);
  });

  it("getSubFilterOptions returns an empty array for unknown groups or kinds", () => {
    expect(getSubFilterOptions("unknown", "replacement")).toEqual([]);
    expect(getSubFilterOptions("customer", "unknown")).toEqual([]);
  });

  it("resolves legacy filter aliases to canonical kinds", () => {
    expect(resolveFilterKind("late_payment")).toBe("payment_from_customer");
    expect(resolveFilterKind("payout")).toBe("payment_to_customer");
    expect(resolveFilterKind("return_empties")).toBe("customer_return_empties");
    expect(resolveFilterKind("buy_empty")).toBe("buy_empty_from_customer");
    expect(resolveFilterKind("buy_full")).toBe("buy_full_from_company");
    expect(resolveFilterKind("company_return")).toBe("dist_return_empties");
    expect(resolveFilterKind("inventory_adjustment")).toBe("adjust_inventory");
  });

  it("resolves adjustment aliases by tab", () => {
    expect(resolveFilterKind("adjustment", "customer")).toBe("adjust_customer_balance");
    expect(resolveFilterKind("adjustment", "company")).toBe("adjust_company_balance");
  });

  it("resolves labels through canonical activity metadata", () => {
    expect(resolveFilterLabel("late_payment")).toBe(ACTIVITY_KIND_META.payment_from_customer.label);
    expect(resolveFilterLabel("adjustment", "customer")).toBe(ACTIVITY_KIND_META.adjust_customer_balance.label);
    expect(resolveFilterLabel("adjustment", "company")).toBe(ACTIVITY_KIND_META.adjust_company_balance.label);
  });

  it("returns raw filter ID when no canonical kind exists", () => {
    expect(resolveFilterKind("unknown")).toBeNull();
    expect(resolveFilterLabel("unknown")).toBe("unknown");
  });
});

describe("surface visibility registry", () => {
  it("Daily Report excludes only the registry-disabled kinds", () => {
    const excluded = ALL_ACTIVITY_KINDS.filter(
      (kind) => !ACTIVITY_KIND_META[kind].surfaces.dailyReport
    );

    expect(excluded.sort()).toEqual([
      "adjust_company_balance",
      "adjust_customer_balance",
    ]);
  });

  it("Customer Review uses the same 7 customer kinds as the registry surface", () => {
    const customerReviewKinds = ALL_ACTIVITY_KINDS.filter(
      (kind) => ACTIVITY_KIND_META[kind].surfaces.customerReview
    );

    expect(customerReviewKinds.sort()).toEqual([
      "adjust_customer_balance",
      "buy_empty_from_customer",
      "customer_return_empties",
      "payment_from_customer",
      "payment_to_customer",
      "replacement",
      "sell_full",
    ]);
  });
});
