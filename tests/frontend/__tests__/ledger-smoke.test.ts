/**
 * Ledger smoke test — frontend transformation layer
 *
 * Verifies that:
 * 1. getDailyReport correctly converts monetary fields from minor units to
 *    major units while leaving inventory counts untouched.
 * 2. normalizeBankDepositDisplayEvent produces the correct amount, direction,
 *    hero_text, and context_line for bank_deposit events coming from the
 *    backend.
 * 3. Event cards receive the right cash_before/cash_after and inventory
 *    transition values after the API transformation.
 *
 * All "minor unit" values are integers (e.g. 10_000 = ₪100.00).
 * All "major unit" values are decimals  (e.g. 100.00).
 */

import { api, getDailyReport } from "@/lib/api";
import { normalizeBankDepositDisplayEvent } from "@/lib/activityAdapter";
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
    cash_start: 10_000,
    cash_end: 10_100,
    company_start: 700,
    company_end: 700,
    company_give_start: null,
    company_give_end: null,
    company_receive_start: null,
    company_receive_end: null,
    inventory_start: { full12: 50, empty12: 10, full48: 20, empty48: 5 },
    inventory_end: { full12: 53, empty12: 13, full48: 20, empty48: 5 },
    audit_summary: { cash_in: 0, new_debt: 0, inv_delta_12: 0, inv_delta_48: 0 },
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
    cash_before: 10_000,
    cash_after: 10_300,
    bank_before: null,
    bank_after: null,
    customer_money_before: null,
    customer_money_after: null,
    inventory_before: { full12: 50, empty12: 10, full48: 20, empty48: 5 },
    inventory_after: { full12: 48, empty12: 12, full48: 20, empty48: 5 },
    money_amount: null,
    money_delta: null,
    total_cost: null,
    paid_now: null,
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
  it("converts cash_start and cash_end from minor to major units", async () => {
    mockGet.mockResolvedValue({ data: makeBackendDayResponse() });
    const result = await getDailyReport("2025-03-01");

    // 10_000 minor = 100.00 major
    expect(result.cash_start).toBeCloseTo(100.0);
    expect(result.cash_end).toBeCloseTo(101.0);
  });

  it("converts event cash_before and cash_after from minor to major units", async () => {
    const event = makeBackendEvent({ cash_before: 10_000, cash_after: 10_300 });
    mockGet.mockResolvedValue({
      data: makeBackendDayResponse({ events: [event] }),
    });
    const result = await getDailyReport("2025-03-01");
    const ev = result.events[0];

    expect(ev.cash_before).toBeCloseTo(100.0); // 10_000 / 100
    expect(ev.cash_after).toBeCloseTo(103.0);  // 10_300 / 100
  });

  it("leaves null cash_before/cash_after as null", async () => {
    const event = makeBackendEvent({ cash_before: null, cash_after: null });
    mockGet.mockResolvedValue({
      data: makeBackendDayResponse({ events: [event] }),
    });
    const result = await getDailyReport("2025-03-01");
    const ev = result.events[0];

    expect(ev.cash_before).toBeNull();
    expect(ev.cash_after).toBeNull();
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
  it("passes through inventory_start and inventory_end counts unchanged", async () => {
    mockGet.mockResolvedValue({
      data: makeBackendDayResponse({
        inventory_start: { full12: 50, empty12: 10, full48: 20, empty48: 5 },
        inventory_end: { full12: 53, empty12: 13, full48: 20, empty48: 5 },
      }),
    });
    const result = await getDailyReport("2025-03-01");

    expect(result.inventory_start?.full12).toBe(50);
    expect(result.inventory_start?.empty12).toBe(10);
    expect(result.inventory_end?.full12).toBe(53);
    expect(result.inventory_end?.empty12).toBe(13);
    expect(result.inventory_end?.full48).toBe(20);
    expect(result.inventory_end?.empty48).toBe(5);
  });
});

// ── normalizeBankDepositDisplayEvent ─────────────────────────────────────────

/** Build a minimal DailyReportEvent in MAJOR units (already converted by getDailyReport). */
function makeBankDepositEvent(overrides: Partial<DailyReportEvent> = {}): DailyReportEvent {
  return {
    event_type: "bank_deposit",
    source_id: "dep-1",
    effective_at: "2025-03-01T14:00:00Z",
    created_at: "2025-03-01T14:00:00Z",
    transfer_direction: "wallet_to_bank",
    money_amount: 30,     // major units (e.g. ₪30.00)
    money_delta: 30,
    cash_before: 114,     // major units
    cash_after: 84,
    notes: [],
    open_actions: [],
    remaining_actions: [],
    action_pills: [],
    balance_transitions: [],
    ...overrides,
  } as unknown as DailyReportEvent;
}

describe("normalizeBankDepositDisplayEvent", () => {
  it("returns non-bank-deposit events unchanged", () => {
    const ev = { event_type: "order" } as DailyReportEvent;
    expect(normalizeBankDepositDisplayEvent(ev)).toBe(ev);
  });

  it("sets label, display_name, and money_direction for wallet_to_bank", () => {
    const ev = makeBankDepositEvent({ transfer_direction: "wallet_to_bank", money_amount: 30 });
    const result = normalizeBankDepositDisplayEvent(ev);

    expect(result.label).toBe("Wallet → Bank");
    expect(result.display_name).toBe("Wallet → Bank");
    expect(result.money_direction).toBe("out");
    expect(result.transfer_direction).toBe("wallet_to_bank");
  });

  it("sets label, display_name, and money_direction for bank_to_wallet", () => {
    const ev = makeBankDepositEvent({
      transfer_direction: "bank_to_wallet",
      money_amount: 10,
      money_delta: 10,
    });
    const result = normalizeBankDepositDisplayEvent(ev);

    expect(result.label).toBe("Bank → Wallet");
    expect(result.money_direction).toBe("in");
  });

  it("uses money_amount as the amount source when non-zero", () => {
    const ev = makeBankDepositEvent({
      transfer_direction: "wallet_to_bank",
      money_amount: 80,
      money_delta: 0,
      total_cost: 0,
    });
    const result = normalizeBankDepositDisplayEvent(ev);

    expect(result.money_amount).toBe(80);
  });

  it("falls back to money_delta when money_amount is 0", () => {
    const ev = makeBankDepositEvent({
      transfer_direction: "wallet_to_bank",
      money_amount: 0,
      money_delta: 55,
      total_cost: 0,
    });
    const result = normalizeBankDepositDisplayEvent(ev);

    expect(result.money_amount).toBe(55);
  });

  it("preserves backend context_line that contains embedded time", () => {
    // Backend sends "Wallet → Bank · 14:30:00" — the time is embedded in context_line
    const ev = makeBankDepositEvent({
      transfer_direction: "wallet_to_bank",
      context_line: "Wallet → Bank · 14:30:00",
    });
    const result = normalizeBankDepositDisplayEvent(ev);

    // Must keep the full string (time must not be stripped)
    expect(result.context_line).toBe("Wallet → Bank · 14:30:00");
  });

  it("fills in context_line from label when backend sends empty string", () => {
    const ev = makeBankDepositEvent({
      transfer_direction: "wallet_to_bank",
      context_line: "",
    });
    const result = normalizeBankDepositDisplayEvent(ev);

    expect(result.context_line).toBe("Wallet → Bank");
  });

  it("preserves non-empty hero_text from backend", () => {
    const ev = makeBankDepositEvent({
      transfer_direction: "wallet_to_bank",
      money_amount: 30,
      hero_text: "Transferred ₪30.00 to bank",
    });
    const result = normalizeBankDepositDisplayEvent(ev);

    expect(result.hero_text).toBe("Transferred ₪30.00 to bank");
  });

  it("resolves direction from money_direction when transfer_direction is missing", () => {
    const ev = makeBankDepositEvent({
      transfer_direction: undefined,
      money_direction: "out",
      money_amount: 20,
    });
    const result = normalizeBankDepositDisplayEvent(ev);

    expect(result.transfer_direction).toBe("wallet_to_bank");
    expect(result.money_direction).toBe("out");
  });

  it("resolves direction from label text when both direction fields are missing", () => {
    const ev = makeBankDepositEvent({
      transfer_direction: undefined,
      money_direction: undefined,
      label: "Wallet → Bank",
      money_amount: 15,
    });
    const result = normalizeBankDepositDisplayEvent(ev);

    expect(result.transfer_direction).toBe("wallet_to_bank");
  });

  it("does not alter cash_before / cash_after (these are pre-converted by getDailyReport)", () => {
    const ev = makeBankDepositEvent({ cash_before: 114, cash_after: 84 });
    const result = normalizeBankDepositDisplayEvent(ev);

    // cash_before/cash_after are set before normalization and must not change
    expect(result.cash_before).toBe(114);
    expect(result.cash_after).toBe(84);
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
    makeBackendEvent({ event_type: "order", gas_type: "12kg",
      cash_before: 10_000, cash_after: 10_300,
      inventory_before: { full12: 50, empty12: 10, full48: 20, empty48: 5 },
      inventory_after:  { full12: 48, empty12: 12, full48: 20, empty48: 5 },
    }),
    makeBackendEvent({ event_type: "order", gas_type: "48kg",
      cash_before: 10_300, cash_after: 10_700,
      inventory_before: { full12: 48, empty12: 12, full48: 20, empty48: 5 },
      inventory_after:  { full12: 48, empty12: 12, full48: 19, empty48: 5 },
    }),
    makeBackendEvent({ event_type: "collection_money",
      cash_before: 10_700, cash_after: 10_900,
      customer_money_before: 30_000, customer_money_after: 10_000,
    }),
    makeBackendEvent({ event_type: "collection_empty",
      cash_before: 10_900, cash_after: 10_900,
      inventory_before: { full12: 48, empty12: 12, full48: 19, empty48: 5 },
      inventory_after:  { full12: 48, empty12: 15, full48: 19, empty48: 5 },
    }),
    makeBackendEvent({ event_type: "expense",
      cash_before: 10_900, cash_after: 10_400,
    }),
    makeBackendEvent({ event_type: "cash_adjust",
      cash_before: 10_400, cash_after: 11_400,
    }),
    makeBackendEvent({ event_type: "refill",
      cash_before: 11_400, cash_after: 10_600,
      inventory_before: { full12: 48, empty12: 15, full48: 19, empty48: 5 },
      inventory_after:  { full12: 53, empty12: 13, full48: 20, empty48: 5 },
      total_cost: 200_000, paid_now: 80_000,
    }),
    makeBackendEvent({ event_type: "company_payment",
      cash_before: 10_600, cash_after: 10_100,
      money_amount: 50_000,
    }),
  ];

  beforeEach(() => {
    mockGet.mockResolvedValue({
      data: makeBackendDayResponse({ events: backendEvents }),
    });
  });

  it("converts all cash_before/cash_after values from minor to major units", async () => {
    const result = await getDailyReport("2025-03-01");
    const evs = result.events;

    const cases: [string, number, number][] = [
      ["order 12kg",        100.0, 103.0],
      ["order 48kg",        103.0, 107.0],
      ["collection_money",  107.0, 109.0],
      ["collection_empty",  109.0, 109.0],
      ["expense",           109.0, 104.0],
      ["cash_adjust",       104.0, 114.0],
      ["refill",            114.0, 106.0],
      ["company_payment",   106.0, 101.0],
    ];

    cases.forEach(([label, expectedBefore, expectedAfter], i) => {
      expect(evs[i].cash_before).toBeCloseTo(expectedBefore, 1);
      expect(evs[i].cash_after).toBeCloseTo(expectedAfter, 1);
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
    expect(evs[3].cash_before).toBeCloseTo(109.0);
    expect(evs[3].cash_after).toBeCloseTo(109.0);

    // T7 (refill)
    expect(evs[6].inventory_before?.full12).toBe(48);
    expect(evs[6].inventory_after?.full12).toBe(53);
    expect(evs[6].inventory_before?.empty12).toBe(15);
    expect(evs[6].inventory_after?.empty12).toBe(13);
    expect(evs[6].inventory_before?.full48).toBe(19);
    expect(evs[6].inventory_after?.full48).toBe(20);
  });

  it("converts customer_money_before/after for collection_money event", async () => {
    const result = await getDailyReport("2025-03-01");
    const ev = result.events[2]; // collection_money (T3)

    expect(ev.customer_money_before).toBeCloseTo(300.0); // 30_000 / 100
    expect(ev.customer_money_after).toBeCloseTo(100.0);  // 10_000 / 100
  });

  it("converts total_cost and paid_now for refill event", async () => {
    const result = await getDailyReport("2025-03-01");
    const ev = result.events[6]; // refill (T7)

    expect(ev.total_cost).toBeCloseTo(2000.0); // 200_000 / 100
    expect(ev.paid_now).toBeCloseTo(800.0);    // 80_000 / 100
  });

  it("converts money_amount for company_payment event", async () => {
    const result = await getDailyReport("2025-03-01");
    const ev = result.events[7]; // company_payment (T8)

    expect(ev.money_amount).toBeCloseTo(500.0); // 50_000 / 100
  });
});
