import {
  bankDepositToEvent,
  cashAdjustmentToEvent,
  collectionToEvent,
  companyBalanceAdjustmentToEvent,
  companyPaymentToEvent,
  customerAdjustmentToEvent,
  inventoryAdjustmentGroupToEvent,
  inventoryAdjustmentToEvent,
  orderToEvent,
} from "@/lib/activityAdapter";
import type { BankDeposit, CompanyBalanceAdjustment, CustomerAdjustment, Order } from "@/types/domain";
import type { InventoryAdjustment } from "@/types/inventory";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    customer_id: "cust-1",
    system_id: "sys-1",
    order_mode: "replacement",
    gas_type: "12kg",
    cylinders_installed: 1,
    cylinders_received: 0,
    price_total: 100,
    paid_amount: 0,
    debt_cash: 0,
    debt_cylinders_12: 0,
    debt_cylinders_48: 0,
    delivered_at: "2026-05-14T09:00:00Z",
    created_at: "2026-05-14T09:00:00Z",
    updated_at: null,
    note: null,
    is_deleted: false,
    ...overrides,
  } as Order;
}

function makeCustomerAdjustment(overrides: Partial<CustomerAdjustment> = {}): CustomerAdjustment {
  return {
    id: "customer-adj-1",
    customer_id: "cust-1",
    amount_money: 50,
    count_12kg: 0,
    count_48kg: 0,
    effective_at: "2026-05-14T10:00:00Z",
    created_at: "2026-05-14T10:00:00Z",
    debt_cash: 100,
    debt_cylinders_12: 0,
    debt_cylinders_48: 0,
    ...overrides,
  } as CustomerAdjustment;
}

function makeCompanyAdjustment(overrides: Partial<CompanyBalanceAdjustment> = {}): CompanyBalanceAdjustment {
  return {
    id: "company-adj-1",
    happened_at: "2026-05-14T11:00:00Z",
    created_at: "2026-05-14T11:00:00Z",
    money_balance: 120,
    cylinder_balance_12: 3,
    cylinder_balance_48: -1,
    delta_money: 20,
    delta_cylinder_12: -2,
    delta_cylinder_48: 1,
    live_debt_cash: 120,
    live_debt_cylinders_12: 3,
    live_debt_cylinders_48: -1,
    note: null,
    is_deleted: false,
    ...overrides,
  } as CompanyBalanceAdjustment;
}

function makeBankDeposit(overrides: Partial<BankDeposit> = {}): BankDeposit {
  return {
    id: "bank-deposit-1",
    happened_at: "2026-05-14T12:00:00Z",
    amount: 200,
    direction: "wallet_to_bank",
    note: null,
    ...overrides,
  } as BankDeposit;
}

function makeInventoryAdjustment(overrides: Partial<InventoryAdjustment> = {}): InventoryAdjustment {
  return {
    id: "inventory-adj-1",
    gas_type: "12kg",
    delta_full: 2,
    delta_empty: -1,
    reason: null,
    effective_at: "2026-05-14T10:00:00Z",
    created_at: "2026-05-14T10:00:00Z",
    is_deleted: false,
    ...overrides,
  };
}

// PRE-MIGRATION BASELINES: legacy event_type values below intentionally document T7 state.
// T8 migrates adapter output to canonical ActivityKind values.
describe("adapter event_type baselines - pre-T8", () => {
  describe("orderToEvent", () => {
    it('emits legacy "order" for replacement mode (T8 -> "replacement")', () => {
      expect(orderToEvent(makeOrder({ order_mode: "replacement" })).event_type).toBe("order");
    });

    it('emits legacy "order" for sell_iron mode (T8 -> "sell_full")', () => {
      expect(orderToEvent(makeOrder({ order_mode: "sell_iron" })).event_type).toBe("order");
    });

    it('emits legacy "order" for buy_iron mode (T8 -> "buy_empty_from_customer")', () => {
      expect(orderToEvent(makeOrder({ order_mode: "buy_iron" })).event_type).toBe("order");
    });
  });

  describe("collectionToEvent", () => {
    it('emits legacy "collection_money" for payment action (T8 -> "payment_from_customer")', () => {
      const event = collectionToEvent({
        id: "col-1",
        customer_id: "cust-1",
        action_type: "payment",
        amount_money: 50,
        debt_cash: 0,
        debt_cylinders_12: 0,
        debt_cylinders_48: 0,
        effective_at: "2026-05-14T10:00:00Z",
        created_at: "2026-05-14T10:00:00Z",
      } as any);
      expect(event.event_type).toBe("collection_money");
    });

    it('emits legacy "collection_payout" for payout action (T8 -> "payment_to_customer")', () => {
      const event = collectionToEvent({
        id: "col-2",
        customer_id: "cust-1",
        action_type: "payout",
        amount_money: 30,
        debt_cash: 0,
        debt_cylinders_12: 0,
        debt_cylinders_48: 0,
        effective_at: "2026-05-14T10:00:00Z",
        created_at: "2026-05-14T10:00:00Z",
      } as any);
      expect(event.event_type).toBe("collection_payout");
    });

    it('emits legacy "collection_empty" for return action (T8 -> "customer_return_empties")', () => {
      const event = collectionToEvent({
        id: "col-3",
        customer_id: "cust-1",
        action_type: "return",
        qty_12kg: 2,
        qty_48kg: 0,
        debt_cash: 0,
        debt_cylinders_12: 2,
        debt_cylinders_48: 0,
        effective_at: "2026-05-14T10:00:00Z",
        created_at: "2026-05-14T10:00:00Z",
      } as any);
      expect(event.event_type).toBe("collection_empty");
    });
  });

  describe("customerAdjustmentToEvent", () => {
    it('emits legacy "customer_adjust" (T8 -> "adjust_customer_balance")', () => {
      expect(customerAdjustmentToEvent(makeCustomerAdjustment()).event_type).toBe("customer_adjust");
    });
  });

  describe("companyPaymentToEvent - highest-risk path", () => {
    it('emits legacy "company_payment" when paying TO company (T8 -> "payment_to_company")', () => {
      const event = companyPaymentToEvent({
        id: "pay-1",
        amount: 50,
        live_debt_cash: 100,
        happened_at: "2026-05-14T10:00:00Z",
        note: null,
      } as any);
      expect(event.event_type).toBe("company_payment");
      expect(event.money_direction).toBe("out");
    });

    it('emits legacy "company_payment" when receiving FROM company (T8 -> "payment_from_company")', () => {
      const event = companyPaymentToEvent({
        id: "pay-2",
        amount: -30,
        live_debt_cash: 70,
        happened_at: "2026-05-14T10:00:00Z",
        note: null,
      } as any);
      expect(event.event_type).toBe("company_payment");
      expect(event.money_direction).toBe("in");
    });
  });

  describe("companyBalanceAdjustmentToEvent", () => {
    it('emits legacy "company_adjustment" (T8 -> "adjust_company_balance")', () => {
      expect(companyBalanceAdjustmentToEvent(makeCompanyAdjustment()).event_type).toBe("company_adjustment");
    });
  });

  describe("bankDepositToEvent", () => {
    it('emits legacy "bank_deposit" for wallet_to_bank direction (T8 -> "wallet_to_bank")', () => {
      const event = bankDepositToEvent(makeBankDeposit({ direction: "wallet_to_bank" }));
      expect(event.event_type).toBe("bank_deposit");
      expect(event.transfer_direction).toBe("wallet_to_bank");
    });

    it('emits legacy "bank_deposit" for bank_to_wallet direction (T8 -> "bank_to_wallet")', () => {
      const event = bankDepositToEvent(makeBankDeposit({ direction: "bank_to_wallet" }));
      expect(event.event_type).toBe("bank_deposit");
      expect(event.transfer_direction).toBe("bank_to_wallet");
    });
  });

  describe("inventoryAdjustmentToEvent", () => {
    it('emits legacy "adjust" for a single inventory adjustment (T8 -> "adjust_inventory")', () => {
      expect(inventoryAdjustmentToEvent(makeInventoryAdjustment()).event_type).toBe("adjust");
    });

    it("hero_text is '<gas>: full +<n> | empty <n>' format", () => {
      const event = inventoryAdjustmentToEvent(
        makeInventoryAdjustment({ delta_full: 3, delta_empty: -2, gas_type: "12kg" })
      );
      expect(event.hero_text).toBe("12kg: full +3 | empty -2");
    });
  });

  describe("inventoryAdjustmentGroupToEvent - already canonical", () => {
    it('emits canonical "adjust_inventory" for grouped inventory adjustments', () => {
      expect(inventoryAdjustmentGroupToEvent([makeInventoryAdjustment()]).event_type).toBe("adjust_inventory");
    });
  });

  describe("cashAdjustmentToEvent - already canonical", () => {
    it('already emits canonical "adjust_wallet" - no migration needed in T8', () => {
      const event = cashAdjustmentToEvent({
        id: "cash-1",
        delta_cash: 25,
        reason: null,
        effective_at: "2026-05-14T10:00:00Z",
        created_at: "2026-05-14T10:00:00Z",
      } as any);
      expect(event.event_type).toBe("adjust_wallet");
    });
  });
});
