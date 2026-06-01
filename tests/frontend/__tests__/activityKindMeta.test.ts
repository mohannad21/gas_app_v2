import { ACTIVITY_KIND_META, getReportSubtype, normalizeEventType } from "@/lib/activityKindMeta";
import type { ActivityKind } from "@/lib/activityKinds";

const ALL_KINDS: ActivityKind[] = [
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
  "wallet_to_bank",
  "bank_to_wallet",
  "adjust_wallet",
  "adjust_inventory",
];

describe("ACTIVITY_KIND_META", () => {
  it("has an entry for all 18 canonical kinds", () => {
    for (const kind of ALL_KINDS) {
      expect(ACTIVITY_KIND_META[kind]).toBeDefined();
    }
    expect(Object.keys(ACTIVITY_KIND_META)).toHaveLength(18);
  });

  it("has a valid scope for every kind", () => {
    for (const kind of ALL_KINDS) {
      const meta = ACTIVITY_KIND_META[kind];
      expect(["customer", "company", "wallet", "inventory"]).toContain(meta.scope);
    }
  });

  it("has a non-empty label for every kind", () => {
    for (const kind of ALL_KINDS) {
      const meta = ACTIVITY_KIND_META[kind];
      expect(typeof meta.label).toBe("string");
      expect(meta.label.length).toBeGreaterThan(0);
    }
  });
});

describe("normalizeEventType", () => {
  it("passes through canonical kinds unchanged", () => {
    for (const kind of ALL_KINDS) {
      expect(normalizeEventType(kind)).toBe(kind);
    }
  });

  it('maps legacy "order" to "replacement" with no order_mode', () => {
    expect(normalizeEventType("order")).toBe("replacement");
  });

  it('maps legacy "order" using order_mode context', () => {
    expect(normalizeEventType("order", { order_mode: "replacement" })).toBe("replacement");
    expect(normalizeEventType("order", { order_mode: "sell_iron" })).toBe("sell_full");
    expect(normalizeEventType("order", { order_mode: "buy_iron" })).toBe("buy_empty_from_customer");
  });

  it("maps legacy collection aliases", () => {
    expect(normalizeEventType("collection_money")).toBe("payment_from_customer");
    expect(normalizeEventType("collection_payout")).toBe("payment_to_customer");
    expect(normalizeEventType("collection_empty")).toBe("customer_return_empties");
  });

  it('maps legacy "customer_adjust" to "adjust_customer_balance"', () => {
    expect(normalizeEventType("customer_adjust")).toBe("adjust_customer_balance");
  });

  it('maps legacy "company_buy_full" and "company_buy_iron" to "buy_full_from_company"', () => {
    expect(normalizeEventType("company_buy_full")).toBe("buy_full_from_company");
    expect(normalizeEventType("company_buy_iron")).toBe("buy_full_from_company");
  });

  it('maps legacy "buy_iron" to "buy_empty_from_customer"', () => {
    expect(normalizeEventType("buy_iron")).toBe("buy_empty_from_customer");
  });

  it('maps legacy "company_payment" using money_direction', () => {
    expect(normalizeEventType("company_payment", { money_direction: "in" })).toBe("payment_from_company");
    expect(normalizeEventType("company_payment", { money_direction: "out" })).toBe("payment_to_company");
    expect(normalizeEventType("company_payment")).toBe("payment_to_company");
  });

  it('maps legacy "company_adjustment" to "adjust_company_balance"', () => {
    expect(normalizeEventType("company_adjustment")).toBe("adjust_company_balance");
  });

  it('maps legacy "company_return_empties" to "dist_return_empties"', () => {
    expect(normalizeEventType("company_return_empties")).toBe("dist_return_empties");
  });

  it('maps legacy "cash_adjust" to "adjust_wallet"', () => {
    expect(normalizeEventType("cash_adjust")).toBe("adjust_wallet");
  });

  it('maps legacy "adjust" to "adjust_inventory"', () => {
    expect(normalizeEventType("adjust")).toBe("adjust_inventory");
  });

  it('maps legacy "bank_deposit" using transfer_direction', () => {
    expect(normalizeEventType("bank_deposit", { transfer_direction: "wallet_to_bank" })).toBe("wallet_to_bank");
    expect(normalizeEventType("bank_deposit", { transfer_direction: "bank_to_wallet" })).toBe("bank_to_wallet");
    expect(normalizeEventType("bank_deposit")).toBe("wallet_to_bank");
  });

  it("returns null for unknown strings", () => {
    expect(normalizeEventType("unknown_xyz")).toBeNull();
    expect(normalizeEventType("")).toBeNull();
    expect(normalizeEventType("ORDER")).toBeNull();
  });
});

describe("getReportSubtype", () => {
  it('returns "refill" for a refill event', () => {
    expect(getReportSubtype({ event_type: "refill" })).toBe("refill");
  });

  it("returns null for an unknown event_type", () => {
    expect(getReportSubtype({ event_type: "unknown_xyz" })).toBeNull();
  });

  it("does not return UI display strings like 'company_refill'", () => {
    const result = getReportSubtype({ event_type: "refill" });
    expect(result).not.toBe("company_refill");
    expect(result).not.toBe("company_return");
  });
});
