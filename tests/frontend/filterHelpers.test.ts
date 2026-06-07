import { ACTIVITY_KIND_META, FILTER_GROUP_LABELS, type ActivityKind } from "@/lib/activityKindMeta";
import {
  activityMatchesFilter,
  isCompanyTabFiltered,
  isCustomerReviewFiltered,
  isCustomerTabFiltered,
  isLedgerTabFiltered,
  isMoneyTabFiltered,
  resolveFilterLabel,
} from "@/lib/filterHelpers";

const CANONICAL_LABELS: Record<ActivityKind, string> = {
  replacement: "Replace",
  sell_full: "Sell full",
  buy_empty_from_customer: "Buy empties",
  payment_from_customer: "Payment from customer",
  payment_to_customer: "Payment to customer",
  customer_return_empties: "Empties from customer",
  adjust_customer_balance: "Adjust customer balance",
  refill: "Refill",
  buy_full_from_company: "Buy fulls",
  payment_to_company: "Payment to company",
  payment_from_company: "Payment from company",
  dist_return_empties: "Empties to company",
  adjust_company_balance: "Adjust company balance",
  expense: "Expense",
  bank_to_wallet: "Bank to wallet",
  wallet_to_bank: "Wallet to bank",
  adjust_wallet: "Adjust wallet",
  adjust_inventory: "Adjust inventory",
};

describe("filter labels", () => {
  it("returns the canonical label for each activity kind", () => {
    for (const [kind, label] of Object.entries(CANONICAL_LABELS) as [ActivityKind, string][]) {
      expect(ACTIVITY_KIND_META[kind].label).toBe(label);
    }
  });

  it("returns the canonical label for each filter group", () => {
    expect(FILTER_GROUP_LABELS.customer).toBe("Customer");
    expect(FILTER_GROUP_LABELS.company).toBe("Company");
    expect(FILTER_GROUP_LABELS.expenses).toBe("Money");
    expect(FILTER_GROUP_LABELS.ledger).toBe("Ledger");
  });

  it("resolves non-canonical filter IDs to canonical labels", () => {
    expect(resolveFilterLabel("late_payment")).toBe("Payment from customer");
    expect(resolveFilterLabel("payout")).toBe("Payment to customer");
    expect(resolveFilterLabel("return_empties")).toBe("Empties from customer");
    expect(resolveFilterLabel("buy_empty")).toBe("Buy empties");
    expect(resolveFilterLabel("buy_full")).toBe("Buy fulls");
    expect(resolveFilterLabel("company_return")).toBe("Empties to company");
    expect(resolveFilterLabel("inventory_adjustment")).toBe("Adjust inventory");
  });

  it("resolves adjustment labels by tab", () => {
    expect(resolveFilterLabel("adjustment", "customer")).toBe("Adjust customer balance");
    expect(resolveFilterLabel("adjustment", "company")).toBe("Adjust company balance");
  });
});

describe("activityMatchesFilter", () => {
  const activity = { filterGroup: "customer", kind: "replacement", subFilterId: "money_debt" };

  it("returns true for any activity when all filter fields are null", () => {
    expect(activityMatchesFilter(activity, { groupId: null, kindId: null, subFilterId: null })).toBe(true);
  });

  it("returns true when activity filterGroup matches groupId", () => {
    expect(activityMatchesFilter(activity, { groupId: "customer", kindId: null, subFilterId: null })).toBe(true);
  });

  it("returns false when activity filterGroup does not match groupId", () => {
    expect(activityMatchesFilter(activity, { groupId: "company", kindId: null, subFilterId: null })).toBe(false);
  });

  it("returns true when activity kind matches kindId and group also matches", () => {
    expect(activityMatchesFilter(activity, { groupId: "customer", kindId: "replacement", subFilterId: null })).toBe(true);
  });

  it("returns false when activity kind does not match kindId", () => {
    expect(activityMatchesFilter(activity, { groupId: "customer", kindId: "sell_full", subFilterId: null })).toBe(false);
  });

  it("returns true when subFilterId matches and group/kind also match", () => {
    expect(activityMatchesFilter(activity, { groupId: "customer", kindId: "replacement", subFilterId: "money_debt" })).toBe(true);
  });

  it("returns false when activity subFilterId does not match filter subFilterId", () => {
    expect(activityMatchesFilter(activity, { groupId: "customer", kindId: "replacement", subFilterId: "money_credit" })).toBe(false);
  });

  it("returns true for a matching kind regardless of subFilterId when no sub-filter is selected", () => {
    expect(activityMatchesFilter(activity, { groupId: "customer", kindId: "replacement", subFilterId: null })).toBe(true);
  });
});

describe("filter badge helpers", () => {
  it("returns true when at least one relevant filter field is active", () => {
    expect(isCustomerTabFiltered({ customerActivityFilter: "replacement", customerActivityLevel2: null, customerActivityLevel3: null })).toBe(true);
    expect(isCompanyTabFiltered({ companyActivityFilter: null, companyActivityLevel2: "12kg" })).toBe(true);
    expect(isMoneyTabFiltered({ expensePrimaryFilter: null, expenseCategoryFilter: "fuel" })).toBe(true);
    expect(isLedgerTabFiltered({ ledgerActivityFilter: "adjust_wallet" })).toBe(true);
    expect(isCustomerReviewFiltered({ selectedFilter: null, selectedLevel2: null, selectedLevel3: "money_debt" })).toBe(true);
  });

  it("returns false when all relevant filter fields are cleared", () => {
    expect(isCustomerTabFiltered({ customerActivityFilter: null, customerActivityLevel2: null, customerActivityLevel3: null })).toBe(false);
    expect(isCompanyTabFiltered({ companyActivityFilter: null, companyActivityLevel2: null })).toBe(false);
    expect(isMoneyTabFiltered({ expensePrimaryFilter: null, expenseCategoryFilter: null })).toBe(false);
    expect(isLedgerTabFiltered({ ledgerActivityFilter: null })).toBe(false);
    expect(isCustomerReviewFiltered({ selectedFilter: null, selectedLevel2: null, selectedLevel3: null })).toBe(false);
  });

  it("does not treat search text as an active filter", () => {
    expect(isCustomerTabFiltered({ customerActivityFilter: null, customerActivityLevel2: null, customerActivityLevel3: null, searchText: "ali" })).toBe(false);
    expect(isCompanyTabFiltered({ companyActivityFilter: null, companyActivityLevel2: null, searchText: "supplier" })).toBe(false);
    expect(isMoneyTabFiltered({ expensePrimaryFilter: null, expenseCategoryFilter: null, searchText: "fuel" })).toBe(false);
    expect(isLedgerTabFiltered({ ledgerActivityFilter: null, searchText: "wallet" })).toBe(false);
    expect(isCustomerReviewFiltered({ selectedFilter: null, selectedLevel2: null, selectedLevel3: null, searchText: "ali" })).toBe(false);
  });
});
