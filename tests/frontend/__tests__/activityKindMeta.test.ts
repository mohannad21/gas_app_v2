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

  it('returns null for legacy "order" (alias removed)', () => {
    expect(normalizeEventType("order")).toBeNull();
    expect(normalizeEventType("order", { order_mode: "replacement" })).toBeNull();
    expect(normalizeEventType("order", { order_mode: "sell_iron" })).toBeNull();
    expect(normalizeEventType("order", { order_mode: "buy_iron" })).toBeNull();
  });

  it("returns null for legacy collection aliases (removed)", () => {
    expect(normalizeEventType("collection_money")).toBeNull();
    expect(normalizeEventType("collection_payout")).toBeNull();
    expect(normalizeEventType("collection_empty")).toBeNull();
  });

  it('returns null for legacy "customer_adjust" (alias removed)', () => {
    expect(normalizeEventType("customer_adjust")).toBeNull();
  });

  it('returns null for legacy company buy aliases (removed)', () => {
    expect(normalizeEventType("company_buy_full")).toBeNull();
    expect(normalizeEventType("company_buy_iron")).toBeNull();
  });

  it('returns null for legacy "buy_iron" (alias removed)', () => {
    expect(normalizeEventType("buy_iron")).toBeNull();
  });

  it('returns null for legacy "company_payment" (alias removed)', () => {
    expect(normalizeEventType("company_payment", { money_direction: "in" })).toBeNull();
    expect(normalizeEventType("company_payment", { money_direction: "out" })).toBeNull();
    expect(normalizeEventType("company_payment")).toBeNull();
  });

  it('returns null for legacy "company_adjustment" (alias removed)', () => {
    expect(normalizeEventType("company_adjustment")).toBeNull();
  });

  it('returns null for legacy "company_return_empties" (alias removed)', () => {
    expect(normalizeEventType("company_return_empties")).toBeNull();
  });

  it('returns null for legacy "cash_adjust" (alias removed)', () => {
    expect(normalizeEventType("cash_adjust")).toBeNull();
  });

  it('returns null for legacy "adjust" (alias removed)', () => {
    expect(normalizeEventType("adjust")).toBeNull();
  });

  it('returns null for legacy "bank_deposit" (alias removed)', () => {
    expect(normalizeEventType("bank_deposit")).toBeNull();
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
