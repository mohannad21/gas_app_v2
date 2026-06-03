/**
 * Ledger smoke test — frontend transformation layer
 *
 * Verifies that:
 * 1. getDailyReport correctly converts monetary fields from minor units to
 *    major units while leaving inventory counts untouched.
 * 2. bankDepositToEvent emits canonical wallet_to_bank / bank_to_wallet events.
 * 3. Event cards receive the right wallet_before/wallet_after and inventory
 *    transition values after the API transformation.
 *
 * All "minor unit" values are integers (e.g. 10_000 = ₪100.00).
 * All "major unit" values are decimals  (e.g. 100.00).
 */

import { api, getDailyReport } from "@/lib/api";
import { bankDepositToEvent } from "@/lib/activityAdapter";
import type { DailyReportEvent } from "@/types/domain";

// ── mock axios instance ───────────────────────────────────────────────────────

const mockGet = jest.fn();
beforeEach(() => {
  mockGet.mockReset();
  (api as any).get = mockGet;
});

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal backend DailyReportDay payload in minor units. */
function makeBackendDayResponse(overrides: Record<string, unknown> = {}) {
  return {
    date: "2025-03-01",
    wallet_end: 10_100,
    company_start: 700,
    company_end: 700,
    company_give_start: null,
    company_give_end: null,
    company_receive_start: null,
    company_receive_end: null,
    inventory_end: { full12: 53, empty12: 13, full48: 20, empty48: 5 },
    audit_summary: { wallet_in: 0, cash_in: 0, new_debt: 0, inv_delta_12: 0, inv_delta_48: 0 },
    recalculated: false,
    events: [],
    ...overrides,
  };
}

/** Build a minimal backend event in minor units. */
function makeBackendEvent(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    event_type: "order",
    source_id: "evt-1",
    effective_at: "2025-03-01T09:00:00Z",
    created_at: "2025-03-01T09:00:00Z",
    gas_type: "12kg",
    wallet_before: 10_000,
    wallet_after: 10_300,
    bank_before: null,
    bank_after: null,
    customer_money_before: null,
    customer_money_after: null,
    inventory_before: { full12: 50, empty12: 10, full48: 20, empty48: 5 },
    inventory_after: { full12: 48, empty12: 12, full48: 20, empty48: 5 },
    money_amount: null,
    money_delta: null,
    total_cost: null,
    paid_amount: null,
    order_total: 600,
    order_paid: 300,
    notes: [],
    open_actions: [],
    remaining_actions: [],
    action_pills: [],
    balance_transitions: [],
    ...overrides,
  };
}

// ── getDailyReport: money field conversions ───────────────────────────────────

describe("getDailyReport — money field conversion (minor → major units)", () => {
  it("converts wallet_end from minor to major units", async () => {
    mockGet.mockResolvedValue({ data: makeBackendDayResponse() });
    const result = await getDailyReport("2025-03-01");

    // 10_100 minor = 101.00 major
    expect(result.wallet_end).toBeCloseTo(101.0);
  });

  it("converts event wallet_before and wallet_after from minor to major units", async () => {
    const event = makeBackendEvent({ wallet_before: 10_000, wallet_after: 10_300 });
    mockGet.mockResolvedValue({
      data: makeBackendDayResponse({ events: [event] }),
    });
    const result = await getDailyReport("2025-03-01");
    const ev = result.events[0];

    expect(ev.wallet_before).toBeCloseTo(100.0); // 10_000 / 100
    expect(ev.wallet_after).toBeCloseTo(103.0);  // 10_300 / 100
  });

  it("leaves null wallet_before/wallet_after as null", async () => {
    const event = makeBackendEvent({ wallet_before: null, wallet_after: null });
    mockGet.mockResolvedValue({
      data: makeBackendDayResponse({ events: [event] }),
    });
    const result = await getDailyReport("2025-03-01");
    const ev = result.events[0];

    expect(ev.wallet_before).toBeNull();
    expect(ev.wallet_after).toBeNull();
  });

  it("converts customer_money_before and customer_money_after", async () => {
    const event = makeBackendEvent({
      customer_money_before: 30_000,
      customer_money_after: 10_000,
    });
    mockGet.mockResolvedValue({
      data: makeBackendDayResponse({ events: [event] }),
    });
    const result = await getDailyReport("2025-03-01");
    const ev = result.events[0];

    expect(ev.customer_money_before).toBeCloseTo(300.0);
    expect(ev.customer_money_after).toBeCloseTo(100.0);
  });

  it("does NOT convert inventory_before / inventory_after (they are counts)", async () => {
    const event = makeBackendEvent({
      inventory_before: { full12: 50, empty12: 10, full48: 20, empty48: 5 },
      inventory_after: { full12: 48, empty12: 12, full48: 20, empty48: 5 },
    });
    mockGet.mockResolvedValue({
      data: makeBackendDayResponse({ events: [event] }),
    });
    const result = await getDailyReport("2025-03-01");
    const ev = result.events[0];

    // Counts pass through unchanged — do NOT divide by 100
    expect(ev.inventory_before?.full12).toBe(50);
    expect(ev.inventory_before?.empty12).toBe(10);
    expect(ev.inventory_after?.full12).toBe(48);
    expect(ev.inventory_after?.empty12).toBe(12);
    expect(ev.inventory_after?.full48).toBe(20);
    expect(ev.inventory_after?.empty48).toBe(5);
  });

  it("converts order_total and order_paid", async () => {
    const event = makeBackendEvent({ order_total: 60_000, order_paid: 30_000 });
    mockGet.mockResolvedValue({
      data: makeBackendDayResponse({ events: [event] }),
    });
    const result = await getDailyReport("2025-03-01");
    const ev = result.events[0];

    expect(ev.order_total).toBeCloseTo(600.0);
    expect(ev.order_paid).toBeCloseTo(300.0);
  });

  it("converts money_amount for non-bank-deposit events", async () => {
    const event = makeBackendEvent({ money_amount: 50_000 });
    mockGet.mockResolvedValue({
      data: makeBackendDayResponse({ events: [event] }),
    });
    const result = await getDailyReport("2025-03-01");
    const ev = result.events[0];

    expect(ev.money_amount).toBeCloseTo(500.0);
  });
});

// ── getDailyReport: inventory counts ─────────────────────────────────────────

describe("getDailyReport — inventory count fields (no conversion)", () => {
  it("passes through inventory_end counts unchanged", async () => {
    mockGet.mockResolvedValue({
      data: makeBackendDayResponse({
        inventory_end: { full12: 53, empty12: 13, full48: 20, empty48: 5 },
      }),
    });
    const result = await getDailyReport("2025-03-01");

    expect(result.inventory_end?.full12).toBe(53);
    expect(result.inventory_end?.empty12).toBe(13);
    expect(result.inventory_end?.full48).toBe(20);
    expect(result.inventory_end?.empty48).toBe(5);
  });
});

// ── bankDepositToEvent ───────────────────────────────────────────────────────

/** Build a minimal bank transfer input for the add-screen adapter. */
function makeBankDeposit(overrides: Record<string, unknown> = {}) {
  return {
    id: "dep-1",
    happened_at: "2025-03-01T14:00:00Z",
    created_at: "2025-03-01T14:00:00Z",
    direction: "wallet_to_bank",
    amount: 30,
    note: null,
    ...overrides,
  } as Parameters<typeof bankDepositToEvent>[0];
}

describe("bankDepositToEvent", () => {
  it("emits canonical wallet_to_bank events", () => {
    const result = bankDepositToEvent(makeBankDeposit({ direction: "wallet_to_bank", amount: 30 }));

    expect(result.event_type).toBe("wallet_to_bank");
    expect(result.label).toBe("Wallet → Bank");
    expect(result.display_name).toBe("Wallet → Bank");
    expect(result.money_direction).toBe("out");
    expect(result.money_amount).toBe(30);
    expect(result.money_delta).toBe(30);
  });

  it("emits canonical bank_to_wallet events", () => {
    const result = bankDepositToEvent(makeBankDeposit({ direction: "bank_to_wallet", amount: 10 }));

    expect(result.event_type).toBe("bank_to_wallet");
    expect(result.label).toBe("Bank → Wallet");
    expect(result.display_name).toBe("Bank → Wallet");
    expect(result.money_direction).toBe("in");
    expect(result.money_amount).toBe(10);
  });

  it("sets display fields from canonical direction", () => {
    const result = bankDepositToEvent(makeBankDeposit({ direction: "wallet_to_bank", amount: 30 }));

    expect(result.context_line).toBe("Wallet → Bank");
    expect(result.hero_text).toContain("to bank");
  });
});

// ── event chain: balance transitions match scenario ──────────────────────────

describe("getDailyReport — full scenario event chain", () => {
  /**
   * Mirrors the backend smoke test scenario (MAIN_DAY = 2025-03-01).
   * Values are already in minor units as the backend would return them.
   * After getDailyReport() transforms them, they should be in major units.
   *
   * Physical wallet chain (minor units from backend):
   *   T1 order 12kg:         10_000 → 10_300
   *   T2 order 48kg:         10_300 → 10_700
   *   T3 collection payment: 10_700 → 10_900
   *   T4 collection return:  10_900 → 10_900 (no cash change)
   *   T5 expense:            10_900 → 10_400
   *   T6 cash adjustment:    10_400 → 11_400
   *   T7 refill (company):   11_400 → 10_600
   *   T8 company payment:    10_600 → 10_100
   */

  const backendEvents = [
    makeBackendEvent({ event_type: "replacement", gas_type: "12kg",
      wallet_before: 10_000, wallet_after: 10_300,
      inventory_before: { full12: 50, empty12: 10, full48: 20, empty48: 5 },
      inventory_after:  { full12: 48, empty12: 12, full48: 20, empty48: 5 },
    }),
    makeBackendEvent({ event_type: "sell_full", gas_type: "48kg",
      wallet_before: 10_300, wallet_after: 10_700,
      inventory_before: { full12: 48, empty12: 12, full48: 20, empty48: 5 },
      inventory_after:  { full12: 48, empty12: 12, full48: 19, empty48: 5 },
    }),
    makeBackendEvent({ event_type: "payment_from_customer",
      wallet_before: 10_700, wallet_after: 10_900,
      customer_money_before: 30_000, customer_money_after: 10_000,
    }),
    makeBackendEvent({ event_type: "customer_return_empties",
      wallet_before: 10_900, wallet_after: 10_900,
      inventory_before: { full12: 48, empty12: 12, full48: 19, empty48: 5 },
      inventory_after:  { full12: 48, empty12: 15, full48: 19, empty48: 5 },
    }),
    makeBackendEvent({ event_type: "expense",
      wallet_before: 10_900, wallet_after: 10_400,
    }),
    makeBackendEvent({ event_type: "adjust_wallet",
      wallet_before: 10_400, wallet_after: 11_400,
    }),
    makeBackendEvent({ event_type: "refill",
      wallet_before: 11_400, wallet_after: 10_600,
      inventory_before: { full12: 48, empty12: 15, full48: 19, empty48: 5 },
      inventory_after:  { full12: 53, empty12: 13, full48: 20, empty48: 5 },
      total_cost: 200_000, paid_amount: 80_000,
    }),
    makeBackendEvent({ event_type: "payment_to_company",
      wallet_before: 10_600, wallet_after: 10_100,
      money_amount: 50_000,
    }),
  ];

  beforeEach(() => {
    mockGet.mockResolvedValue({
      data: makeBackendDayResponse({ events: backendEvents }),
    });
  });

  it("converts all wallet_before/wallet_after values from minor to major units", async () => {
    const result = await getDailyReport("2025-03-01");
    const evs = result.events;

    const cases: [string, number, number][] = [
      ["replacement 12kg",        100.0, 103.0],
      ["sell_full 48kg",          103.0, 107.0],
      ["payment_from_customer",   107.0, 109.0],
      ["customer_return_empties", 109.0, 109.0],
      ["expense",                 109.0, 104.0],
      ["adjust_wallet",           104.0, 114.0],
      ["refill",                  114.0, 106.0],
      ["payment_to_company",      106.0, 101.0],
    ];

    cases.forEach(([label, expectedBefore, expectedAfter], i) => {
      expect(evs[i].wallet_before).toBeCloseTo(expectedBefore, 1);
      expect(evs[i].wallet_after).toBeCloseTo(expectedAfter, 1);
    });
  });

  it("does NOT convert inventory transition counts for any event type", async () => {
    const result = await getDailyReport("2025-03-01");
    const evs = result.events;

    // T1 (order 12kg)
    expect(evs[0].inventory_before?.full12).toBe(50);
    expect(evs[0].inventory_after?.full12).toBe(48);
    expect(evs[0].inventory_before?.empty12).toBe(10);
    expect(evs[0].inventory_after?.empty12).toBe(12);

    // T4 (collection_empty) — inventory changes, cash unchanged
    expect(evs[3].inventory_before?.empty12).toBe(12);
    expect(evs[3].inventory_after?.empty12).toBe(15);
    expect(evs[3].wallet_before).toBeCloseTo(109.0);
    expect(evs[3].wallet_after).toBeCloseTo(109.0);

    // T7 (refill)
    expect(evs[6].inventory_before?.full12).toBe(48);
    expect(evs[6].inventory_after?.full12).toBe(53);
    expect(evs[6].inventory_before?.empty12).toBe(15);
    expect(evs[6].inventory_after?.empty12).toBe(13);
    expect(evs[6].inventory_before?.full48).toBe(19);
    expect(evs[6].inventory_after?.full48).toBe(20);
  });

  it("converts customer_money_before/after for payment_from_customer event", async () => {
    const result = await getDailyReport("2025-03-01");
    const ev = result.events[2]; // payment_from_customer (T3)

    expect(ev.customer_money_before).toBeCloseTo(300.0); // 30_000 / 100
    expect(ev.customer_money_after).toBeCloseTo(100.0);  // 10_000 / 100
  });

  it("converts total_cost and paid_amount for refill event", async () => {
    const result = await getDailyReport("2025-03-01");
    const ev = result.events[6]; // refill (T7)

    expect(ev.total_cost).toBeCloseTo(2000.0); // 200_000 / 100
    expect(ev.paid_amount).toBeCloseTo(800.0); // 80_000 / 100
  });

  it("converts money_amount for payment_to_company event", async () => {
    const result = await getDailyReport("2025-03-01");
    const ev = result.events[7]; // payment_to_company (T8)

    expect(ev.money_amount).toBeCloseTo(500.0); // 50_000 / 100
  });
});
