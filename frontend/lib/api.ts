import axios from "axios";
import {
  Customer,
  CustomerCreateInput,
  CustomerAdjustment,
  CustomerAdjustmentCreateInput,
  CustomerAdjustmentSchema,
  CustomerBalance,
  CustomerBalanceSchema,
  CustomerSchema,
  CustomerUpdateInput,
  DailyReportV2Card,
  DailyReportV2CardSchema,
  DailyReportV2Day,
  DailyReportV2DaySchema,
  CompanyBalances,
  CompanyBalancesSchema,
  CompanyBalanceAdjustment,
  CompanyBalanceAdjustmentCreateInput,
  CompanyBalanceAdjustmentSchema,
  CompanyBuyIron,
  CompanyBuyIronCreateInput,
  CompanyBuyIronSchema,
  CompanyPayment,
  CompanyPaymentCreateInput,
  CompanyPaymentSchema,
  CashAdjustment,
  CashAdjustmentCreate,
  CashAdjustmentSchema,
  CashAdjustmentUpdate,
  InventoryRefillSummary,
  InventoryRefillSummarySchema,
  InventoryRefillDetails,
  InventoryRefillDetailsSchema,
  InventorySnapshot,
  InventorySnapshotSchema,
  InventoryAdjustment,
  InventoryAdjustmentSchema,
  InventoryAdjustmentUpdate,
  CollectionCreateInput,
  CollectionUpdateInput,
  CollectionEvent,
  CollectionEventSchema,
  Order,
  OrderCreateInput,
  OrderImpact,
  OrderImpactSchema,
  OrderSchema,
  OrderUpdateInput,
  PriceSetting,
  PriceSettingSchema,
  WhatsappLink,
  WhatsappLinkSchema,
  Expense,
  ExpenseCreateInput,
  ExpenseSchema,
  BankDeposit,
  BankDepositSchema,
  System,
  SystemCreateInput,
  SystemSchema,
  SystemSettings,
  SystemSettingsSchema,
  SystemInitializeInput,
  SystemHealthCheck,
  SystemHealthCheckSchema,
  SystemTypeOption,
  SystemTypeOptionSchema,
  SystemUpdateInput,
} from "@/types/domain";
import { buildHappenedAt } from "@/lib/date";
import { fromMinorUnits, setCurrencyCode, setMoneyDecimals, toMinorUnits } from "@/lib/money";
import { z } from "zod";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 8000,
});

const healthClient = axios.create({
  baseURL: BASE_URL,
  timeout: 2000,
});

let lastHealthCheckAt = 0;
let lastHealthOk = true;

async function ensureBackendHealthy() {
  const now = Date.now();
  if (lastHealthOk && now - lastHealthCheckAt < 5000) {
    return;
  }
  lastHealthCheckAt = now;
  try {
    await healthClient.get("/health");
    lastHealthOk = true;
  } catch {
    lastHealthOk = false;
    throw new Error("Backend unavailable");
  }
}

api.interceptors.request.use(async (config) => {
  (config as any).metadata = { start: Date.now() };
  await ensureBackendHealthy();
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error)
);

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

function parseArray<T>(schema: z.ZodType<T>, data: unknown): T[] {
  return schema.array().parse(data);
}

function mapBalanceTransitionAmounts<T extends { component: string; before: number; after: number }>(items: T[] | null | undefined) {
  if (!Array.isArray(items)) return items;
  return items.map((item) =>
    item.component === "money"
      ? {
          ...item,
          before: fromMinorUnits(item.before),
          after: fromMinorUnits(item.after),
        }
      : item
  );
}


// Customers
export async function listCustomers(): Promise<Customer[]> {
  const { data } = await api.get("/customers");
  return parseArray(CustomerSchema, data).map((c) => ({
    ...c,
    money_balance: fromMinorUnits(c.money_balance),
    money_to_receive: c.money_to_receive != null ? fromMinorUnits(c.money_to_receive) : c.money_to_receive,
    money_to_give: c.money_to_give != null ? fromMinorUnits(c.money_to_give) : c.money_to_give,
  }));
}

export async function getCustomerBalance(customerId: string): Promise<CustomerBalance> {
  const { data } = await api.get(`/customers/${customerId}/balances`);
  const parsed = parse(CustomerBalanceSchema, data);
  return {
    ...parsed,
    money_balance: fromMinorUnits(parsed.money_balance),
  };
}

export async function createCustomer(payload: CustomerCreateInput): Promise<Customer> {
  const { data } = await api.post("/customers", payload);
  const parsed = parse(CustomerSchema, data);
  return { ...parsed, money_balance: fromMinorUnits(parsed.money_balance) };
}

export async function createCustomerAdjustment(
  payload: CustomerAdjustmentCreateInput
): Promise<CustomerAdjustment> {
  const { data } = await api.post("/customer-adjustments", {
    ...payload,
    amount_money: payload.amount_money != null ? toMinorUnits(payload.amount_money) : payload.amount_money,
    happened_at: payload.happened_at,
  });
  const parsed = parse(CustomerAdjustmentSchema, data);
  return {
    ...parsed,
    amount_money: fromMinorUnits(parsed.amount_money),
    debt_cash: parsed.debt_cash != null ? fromMinorUnits(parsed.debt_cash) : parsed.debt_cash,
  };
}

export async function listCustomerAdjustments(customerId: string): Promise<CustomerAdjustment[]> {
  const { data } = await api.get(`/customer-adjustments/${customerId}`);
  return parseArray(CustomerAdjustmentSchema, data).map((item) => ({
    ...item,
    amount_money: fromMinorUnits(item.amount_money),
    debt_cash: item.debt_cash != null ? fromMinorUnits(item.debt_cash) : item.debt_cash,
  }));
}

export async function updateCustomer(id: string, payload: CustomerUpdateInput): Promise<Customer> {
  const { data } = await api.put(`/customers/${id}`, payload);
  const parsed = parse(CustomerSchema, data);
  return { ...parsed, money_balance: fromMinorUnits(parsed.money_balance) };
}

export async function deleteCustomer(id: string): Promise<void> {
  await api.delete(`/customers/${id}`);
}

// System
export async function getSystemSettings(): Promise<SystemSettings> {
  const { data } = await api.get("/system/settings");
  const parsed = parse(SystemSettingsSchema, data);
  setMoneyDecimals(parsed.money_decimals);
  setCurrencyCode(parsed.currency_code);
  return parsed;
}

export async function getCompanyBalances(): Promise<CompanyBalances> {
  const { data } = await api.get("/company/balances");
  const parsed = parse(CompanyBalancesSchema, data);
  return {
    ...parsed,
    company_money: fromMinorUnits(parsed.company_money),
  };
}

export async function createCompanyBalanceAdjustment(
  payload: CompanyBalanceAdjustmentCreateInput
): Promise<CompanyBalanceAdjustment> {
  const happened_at =
    payload.happened_at ??
    buildHappenedAt({ date: payload.date, time: payload.time, time_of_day: payload.time_of_day });
  const { data } = await api.post("/company/balances/adjust", {
    happened_at,
    money_balance: toMinorUnits(payload.money_balance),
    cylinder_balance_12: payload.cylinder_balance_12,
    cylinder_balance_48: payload.cylinder_balance_48,
    note: payload.note,
    request_id: payload.request_id,
  });
  const parsed = parse(CompanyBalanceAdjustmentSchema, data);
  return {
    ...parsed,
    money_balance: fromMinorUnits(parsed.money_balance),
  };
}

export async function createCompanyPayment(payload: CompanyPaymentCreateInput): Promise<CompanyPayment> {
  const happened_at =
    payload.happened_at ?? buildHappenedAt({ date: payload.date, time: payload.time });
  const { data } = await api.post("/company/payments", {
    amount: toMinorUnits(payload.amount),
    note: payload.note,
    request_id: payload.request_id,
    happened_at,
  });
  const parsed = parse(CompanyPaymentSchema, data);
  return { ...parsed, amount: fromMinorUnits(parsed.amount) };
}

export async function listCompanyPayments(): Promise<CompanyPayment[]> {
  const { data } = await api.get("/company/payments");
  return parseArray(CompanyPaymentSchema, data).map((row) => ({
    ...row,
    amount: fromMinorUnits(row.amount),
  }));
}

export async function createCompanyBuyIron(payload: CompanyBuyIronCreateInput): Promise<CompanyBuyIron> {
  const happened_at =
    payload.happened_at ??
    buildHappenedAt({ date: payload.date, time: payload.time, time_of_day: payload.time_of_day });
  const { data } = await api.post("/company/buy_iron", {
    happened_at,
    new12: payload.new12,
    new48: payload.new48,
    total_cost: toMinorUnits(payload.total_cost),
    paid_now: toMinorUnits(payload.paid_now),
    note: payload.note,
    request_id: payload.request_id,
  });
  const parsed = parse(CompanyBuyIronSchema, data);
  return {
    ...parsed,
    total_cost: fromMinorUnits(parsed.total_cost),
    paid_now: fromMinorUnits(parsed.paid_now),
  };
}

export async function initializeSystem(payload: SystemInitializeInput): Promise<SystemSettings> {
  const { data } = await api.post("/system/initialize", {
    ...payload,
    sell_price_12: toMinorUnits(payload.sell_price_12),
    sell_price_48: toMinorUnits(payload.sell_price_48),
    buy_price_12: toMinorUnits(payload.buy_price_12 ?? 0),
    buy_price_48: toMinorUnits(payload.buy_price_48 ?? 0),
    sell_iron_price_12: toMinorUnits(payload.sell_iron_price_12 ?? 0),
    sell_iron_price_48: toMinorUnits(payload.sell_iron_price_48 ?? 0),
    buy_iron_price_12: toMinorUnits(payload.buy_iron_price_12 ?? 0),
    buy_iron_price_48: toMinorUnits(payload.buy_iron_price_48 ?? 0),
    cash_start: toMinorUnits(payload.cash_start),
    company_payable_money: toMinorUnits(payload.company_payable_money ?? 0),
    customer_debts: payload.customer_debts?.map((entry) => ({
      ...entry,
      money: toMinorUnits(entry.money ?? 0),
    })),
  });
  const parsed = parse(SystemSettingsSchema, data);
  setMoneyDecimals(parsed.money_decimals);
  setCurrencyCode(parsed.currency_code);
  return parsed;
}

export async function getSystemHealthCheck(): Promise<SystemHealthCheck> {
  const { data } = await api.get("/system/health-check");
  return parse(SystemHealthCheckSchema, data);
}

// Systems
export async function listSystems(customerId?: string): Promise<System[]> {
  const { data } = await api.get("/systems", {
    params: customerId ? { customerId } : undefined,
  });
  return parseArray(SystemSchema, data);
}

export async function createSystem(payload: SystemCreateInput): Promise<System> {
  const { data } = await api.post("/systems", payload);
  return parse(SystemSchema, data);
}

export async function updateSystem(id: string, payload: SystemUpdateInput): Promise<System> {
  const { data } = await api.put(`/systems/${id}`, payload);
  return parse(SystemSchema, data);
}

export async function deleteSystem(id: string): Promise<void> {
  await api.delete(`/systems/${id}`);
}

// System types
export async function listSystemTypes(): Promise<SystemTypeOption[]> {
  const { data } = await api.get("/system/types");
  return parseArray(SystemTypeOptionSchema, data);
}

export async function createSystemType(name: string): Promise<SystemTypeOption> {
  const { data } = await api.post("/system/types", { name });
  return parse(SystemTypeOptionSchema, data);
}

export async function updateSystemType(
  id: string,
  payload: Partial<Pick<SystemTypeOption, "name" | "is_active">>
): Promise<SystemTypeOption> {
  const { data } = await api.put(`/system/types/${id}`, payload);
  return parse(SystemTypeOptionSchema, data);
}

// Inventory adjustments
export async function listInventoryAdjustments(
  date?: string,
  includeDeleted?: boolean
): Promise<InventoryAdjustment[]> {
  const { data } = await api.get("/inventory/adjustments", {
    params: { date, include_deleted: includeDeleted ?? false },
  });
  return parseArray(InventoryAdjustmentSchema, data);
}

export async function updateInventoryAdjustment(
  deltaId: string,
  payload: InventoryAdjustmentUpdate
): Promise<InventoryAdjustment> {
  const { data } = await api.put(`/inventory/adjust/${deltaId}`, payload);
  return parse(InventoryAdjustmentSchema, data);
}

export async function deleteInventoryAdjustment(deltaId: string): Promise<void> {
  await api.delete(`/inventory/adjust/${deltaId}`);
}

// Cash adjustments
export async function listCashAdjustments(
  date?: string,
  includeDeleted?: boolean
): Promise<CashAdjustment[]> {
  const { data } = await api.get("/cash/adjustments", {
    params: { date, include_deleted: includeDeleted ?? false },
  });
  return parseArray(CashAdjustmentSchema, data).map((c) => ({
    ...c,
    delta_cash: fromMinorUnits(c.delta_cash),
  }));
}

export async function createCashAdjustment(payload: CashAdjustmentCreate): Promise<CashAdjustment> {
  const happened_at =
    payload.happened_at ?? buildHappenedAt({ date: payload.date, time: payload.time });
  const { data } = await api.post("/cash/adjust", {
    ...payload,
    delta_cash: toMinorUnits(payload.delta_cash),
    happened_at,
  });
  const parsed = parse(CashAdjustmentSchema, data);
  return { ...parsed, delta_cash: fromMinorUnits(parsed.delta_cash) };
}

export async function updateCashAdjustment(
  deltaId: string,
  payload: CashAdjustmentUpdate
): Promise<CashAdjustment> {
  const { data } = await api.put(`/cash/adjust/${deltaId}`, {
    ...payload,
    delta_cash: payload.delta_cash != null ? toMinorUnits(payload.delta_cash) : payload.delta_cash,
  });
  const parsed = parse(CashAdjustmentSchema, data);
  return { ...parsed, delta_cash: fromMinorUnits(parsed.delta_cash) };
}

export async function deleteCashAdjustment(deltaId: string): Promise<void> {
  await api.delete(`/cash/adjust/${deltaId}`);
}

// Orders
export async function listOrders(): Promise<Order[]> {
  const { data } = await api.get("/orders");
  return parseArray(OrderSchema, data).map((o) => ({
    ...o,
    price_total: fromMinorUnits(o.price_total),
    paid_amount: fromMinorUnits(o.paid_amount ?? 0),
    debt_cash: o.debt_cash != null ? fromMinorUnits(o.debt_cash) : o.debt_cash,
    applied_credit: o.applied_credit != null ? fromMinorUnits(o.applied_credit) : o.applied_credit,
    money_balance_before: o.money_balance_before != null ? fromMinorUnits(o.money_balance_before) : o.money_balance_before,
    money_balance_after: o.money_balance_after != null ? fromMinorUnits(o.money_balance_after) : o.money_balance_after,
  }));
}

export async function listOrdersByDate(date: string): Promise<Order[]> {
  const { data } = await api.get("/orders", { params: { date } });
  return parseArray(OrderSchema, data).map((o) => ({
    ...o,
    price_total: fromMinorUnits(o.price_total),
    paid_amount: fromMinorUnits(o.paid_amount ?? 0),
    debt_cash: o.debt_cash != null ? fromMinorUnits(o.debt_cash) : o.debt_cash,
    applied_credit: o.applied_credit != null ? fromMinorUnits(o.applied_credit) : o.applied_credit,
    money_balance_before: o.money_balance_before != null ? fromMinorUnits(o.money_balance_before) : o.money_balance_before,
    money_balance_after: o.money_balance_after != null ? fromMinorUnits(o.money_balance_after) : o.money_balance_after,
  }));
}

export async function createOrder(payload: OrderCreateInput): Promise<Order> {
  const { data } = await api.post("/orders", {
    ...payload,
    happened_at: payload.delivered_at,
    price_total: toMinorUnits(payload.price_total),
    paid_amount: toMinorUnits(payload.paid_amount ?? 0),
    debt_cash: payload.debt_cash != null ? toMinorUnits(payload.debt_cash) : payload.debt_cash,
  });
  const parsed = parse(OrderSchema, data);
  return {
    ...parsed,
    price_total: fromMinorUnits(parsed.price_total),
    paid_amount: fromMinorUnits(parsed.paid_amount ?? 0),
    debt_cash: parsed.debt_cash != null ? fromMinorUnits(parsed.debt_cash) : parsed.debt_cash,
    applied_credit: parsed.applied_credit != null ? fromMinorUnits(parsed.applied_credit) : parsed.applied_credit,
    money_balance_before:
      parsed.money_balance_before != null ? fromMinorUnits(parsed.money_balance_before) : parsed.money_balance_before,
    money_balance_after:
      parsed.money_balance_after != null ? fromMinorUnits(parsed.money_balance_after) : parsed.money_balance_after,
  };
}

export async function updateOrder(id: string, payload: OrderUpdateInput): Promise<Order> {
  const { data } = await api.put(`/orders/${id}`, {
    ...payload,
    happened_at: payload.delivered_at,
    price_total: payload.price_total != null ? toMinorUnits(payload.price_total) : payload.price_total,
    paid_amount: payload.paid_amount != null ? toMinorUnits(payload.paid_amount) : payload.paid_amount,
    debt_cash: payload.debt_cash != null ? toMinorUnits(payload.debt_cash) : payload.debt_cash,
  });
  const parsed = parse(OrderSchema, data);
  return {
    ...parsed,
    price_total: fromMinorUnits(parsed.price_total),
    paid_amount: fromMinorUnits(parsed.paid_amount ?? 0),
    debt_cash: parsed.debt_cash != null ? fromMinorUnits(parsed.debt_cash) : parsed.debt_cash,
    applied_credit: parsed.applied_credit != null ? fromMinorUnits(parsed.applied_credit) : parsed.applied_credit,
    money_balance_before:
      parsed.money_balance_before != null ? fromMinorUnits(parsed.money_balance_before) : parsed.money_balance_before,
    money_balance_after:
      parsed.money_balance_after != null ? fromMinorUnits(parsed.money_balance_after) : parsed.money_balance_after,
  };
}

export async function deleteOrder(id: string): Promise<void> {
  await api.delete(`/orders/${id}`);
}

// Collections
export async function createCollection(payload: CollectionCreateInput): Promise<any> {
  const { data } = await api.post("/collections", {
    ...payload,
    happened_at: payload.effective_at,
    amount_money: payload.amount_money != null ? toMinorUnits(payload.amount_money) : payload.amount_money,
    debt_cash: payload.debt_cash != null ? toMinorUnits(payload.debt_cash) : payload.debt_cash,
  });
  const parsed = CollectionEventSchema.parse(data);
  return {
    ...parsed,
    amount_money: parsed.amount_money != null ? fromMinorUnits(parsed.amount_money) : parsed.amount_money,
    debt_cash: parsed.debt_cash != null ? fromMinorUnits(parsed.debt_cash) : parsed.debt_cash,
  };
}

export async function listCollections(): Promise<CollectionEvent[]> {
  const { data } = await api.get("/collections");
  return parseArray(CollectionEventSchema, data).map((ev) => ({
    ...ev,
    amount_money: ev.amount_money != null ? fromMinorUnits(ev.amount_money) : ev.amount_money,
    debt_cash: ev.debt_cash != null ? fromMinorUnits(ev.debt_cash) : ev.debt_cash,
  }));
}

export async function updateCollection(id: string, payload: CollectionUpdateInput): Promise<CollectionEvent> {
  const { data } = await api.put(`/collections/${id}`, {
    ...payload,
    happened_at: payload.effective_at,
    amount_money: payload.amount_money != null ? toMinorUnits(payload.amount_money) : payload.amount_money,
    debt_cash: payload.debt_cash != null ? toMinorUnits(payload.debt_cash) : payload.debt_cash,
  });
  const parsed = parse(CollectionEventSchema, data);
  return {
    ...parsed,
    amount_money: parsed.amount_money != null ? fromMinorUnits(parsed.amount_money) : parsed.amount_money,
    debt_cash: parsed.debt_cash != null ? fromMinorUnits(parsed.debt_cash) : parsed.debt_cash,
  };
}

export async function deleteCollection(id: string): Promise<void> {
  await api.delete(`/collections/${id}`);
}

export async function validateOrderImpact(params: {
  customer_id: string;
  system_id: string;
  gas_type: "12kg" | "48kg";
  cylinders_installed: number;
  cylinders_received: number;
  price_total: number;
  paid_amount: number;
  delivered_at?: string;
}): Promise<OrderImpact> {
  const { data } = await api.get("/orders/validate_order_impact", {
    params: {
      ...params,
      happened_at: params.delivered_at,
      price_total: toMinorUnits(params.price_total),
      paid_amount: toMinorUnits(params.paid_amount),
    },
  });
  const parsed = parse(OrderImpactSchema, data);
  return {
    ...parsed,
    gross_paid: fromMinorUnits(parsed.gross_paid),
    applied_credit: fromMinorUnits(parsed.applied_credit),
    unpaid: fromMinorUnits(parsed.unpaid),
    new_balance: fromMinorUnits(parsed.new_balance),
  };
}

export async function getOrderWhatsappLink(orderId: string): Promise<WhatsappLink> {
  const { data } = await api.get(`/orders/whatsapp_link/${orderId}`);
  return parse(WhatsappLinkSchema, data);
}

// Daily reports
export async function listDailyReportsV2(params: { from: string; to: string }): Promise<DailyReportV2Card[]> {
  const { data } = await api.get("/reports/daily_v2", { params });
  return parseArray(DailyReportV2CardSchema, data).map((row) => ({
    ...row,
    cash_start: fromMinorUnits(row.cash_start),
    cash_end: fromMinorUnits(row.cash_end),
    net_today: fromMinorUnits(row.net_today),
    cash_math: {
      ...row.cash_math,
      sales: fromMinorUnits(row.cash_math.sales),
      late: fromMinorUnits(row.cash_math.late),
      expenses: fromMinorUnits(row.cash_math.expenses),
      company: fromMinorUnits(row.cash_math.company),
      adjust: fromMinorUnits(row.cash_math.adjust),
      other: row.cash_math.other != null ? fromMinorUnits(row.cash_math.other) : row.cash_math.other,
    },
    company_start: row.company_start != null ? fromMinorUnits(row.company_start) : row.company_start,
    company_end: row.company_end != null ? fromMinorUnits(row.company_end) : row.company_end,
    company_give_start: row.company_give_start != null ? fromMinorUnits(row.company_give_start) : row.company_give_start,
    company_give_end: row.company_give_end != null ? fromMinorUnits(row.company_give_end) : row.company_give_end,
    company_receive_start: row.company_receive_start != null ? fromMinorUnits(row.company_receive_start) : row.company_receive_start,
    company_receive_end: row.company_receive_end != null ? fromMinorUnits(row.company_receive_end) : row.company_receive_end,
    problem_transitions: mapBalanceTransitionAmounts(row.problem_transitions) ?? row.problem_transitions,
  }));
}

export async function getDailyReportV2(date: string): Promise<DailyReportV2Day> {
  const { data } = await api.get("/reports/day_v2", { params: { date } });
  const parsed = parse(DailyReportV2DaySchema, data);
  return {
    ...parsed,
    cash_start: fromMinorUnits(parsed.cash_start),
    cash_end: fromMinorUnits(parsed.cash_end),
    company_start: parsed.company_start != null ? fromMinorUnits(parsed.company_start) : parsed.company_start,
    company_end: parsed.company_end != null ? fromMinorUnits(parsed.company_end) : parsed.company_end,
    company_give_start: parsed.company_give_start != null ? fromMinorUnits(parsed.company_give_start) : parsed.company_give_start,
    company_give_end: parsed.company_give_end != null ? fromMinorUnits(parsed.company_give_end) : parsed.company_give_end,
    company_receive_start: parsed.company_receive_start != null ? fromMinorUnits(parsed.company_receive_start) : parsed.company_receive_start,
    company_receive_end: parsed.company_receive_end != null ? fromMinorUnits(parsed.company_receive_end) : parsed.company_receive_end,
    audit_summary: {
      ...parsed.audit_summary,
      cash_in: fromMinorUnits(parsed.audit_summary.cash_in),
      new_debt: fromMinorUnits(parsed.audit_summary.new_debt),
    },
    events: parsed.events.map((ev) => ({
      ...ev,
      cash_before: ev.cash_before != null ? fromMinorUnits(ev.cash_before) : ev.cash_before,
      cash_after: ev.cash_after != null ? fromMinorUnits(ev.cash_after) : ev.cash_after,
      company_before: ev.company_before != null ? fromMinorUnits(ev.company_before) : ev.company_before,
      company_after: ev.company_after != null ? fromMinorUnits(ev.company_after) : ev.company_after,
      customer_money_before: ev.customer_money_before != null ? fromMinorUnits(ev.customer_money_before) : ev.customer_money_before,
      customer_money_after: ev.customer_money_after != null ? fromMinorUnits(ev.customer_money_after) : ev.customer_money_after,
      total_cost: ev.total_cost != null ? fromMinorUnits(ev.total_cost) : ev.total_cost,
      paid_now: ev.paid_now != null ? fromMinorUnits(ev.paid_now) : ev.paid_now,
      order_total: ev.order_total != null ? fromMinorUnits(ev.order_total) : ev.order_total,
      order_paid: ev.order_paid != null ? fromMinorUnits(ev.order_paid) : ev.order_paid,
      money: ev.money
        ? {
            ...ev.money,
            amount: fromMinorUnits(ev.money.amount),
          }
        : ev.money,
      money_amount: ev.money_amount != null ? fromMinorUnits(ev.money_amount) : ev.money_amount,
      money_delta: ev.money_delta != null ? ev.money_delta : ev.money_delta,
      money_received: ev.money_received != null ? fromMinorUnits(ev.money_received) : ev.money_received,
      open_actions: Array.isArray(ev.open_actions)
        ? ev.open_actions.map((action) =>
            action?.category === "money" && action.amount != null
              ? { ...action, amount: fromMinorUnits(action.amount) }
              : action
          )
        : ev.open_actions,
      remaining_actions: Array.isArray(ev.remaining_actions)
        ? ev.remaining_actions.map((action) =>
            action?.category === "money" && action.amount != null
              ? { ...action, amount: fromMinorUnits(action.amount) }
              : action
          )
        : ev.remaining_actions,
      action_pills: Array.isArray(ev.action_pills)
        ? ev.action_pills.map((action) =>
            action?.category === "money" && action.amount != null
              ? { ...action, amount: fromMinorUnits(action.amount) }
              : action
          )
        : ev.action_pills,
      balance_transitions: mapBalanceTransitionAmounts(ev.balance_transitions) ?? ev.balance_transitions,
    })),
  };
}

// Inventory
export async function getInventoryLatest(): Promise<InventorySnapshot | null> {
  try {
    const { data } = await api.get("/inventory/latest");
    if (!data) return null;
    return parse(InventorySnapshotSchema, data);
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

export async function initInventory(payload: {
  date?: string;
  full12: number;
  empty12: number;
  full48: number;
  empty48: number;
  reason?: string;
}): Promise<InventorySnapshot> {
  const { data } = await api.post("/inventory/init", payload);
  return parse(InventorySnapshotSchema, data);
}

export async function createInventoryRefill(payload: {
  date: string;
  time?: string;
  effective_at?: string;
  time_of_day?: "morning" | "evening";
  buy12: number;
  return12: number;
  buy48: number;
  return48: number;
  paid_buy12?: number;
  paid_buy48?: number;
  total_cost?: number;
  paid_now?: number;
  debt_cash?: number;
  debt_cylinders_12?: number;
  debt_cylinders_48?: number;
  reason?: string;
  notes?: string;
}): Promise<InventorySnapshot> {
  const happened_at =
    payload.effective_at ?? buildHappenedAt({ date: payload.date, time: payload.time, time_of_day: payload.time_of_day });
  const { data } = await api.post("/inventory/refill", {
    happened_at,
    buy12: payload.buy12,
    return12: payload.return12,
    buy48: payload.buy48,
    return48: payload.return48,
    total_cost: toMinorUnits(payload.total_cost ?? 0),
    paid_now: toMinorUnits(payload.paid_now ?? 0),
    debt_cash: payload.debt_cash != null ? toMinorUnits(payload.debt_cash) : payload.debt_cash,
    debt_cylinders_12: payload.debt_cylinders_12,
    debt_cylinders_48: payload.debt_cylinders_48,
    note: payload.notes ?? payload.reason,
  });
  return parse(InventorySnapshotSchema, data);
}

export async function listInventoryRefills(includeDeleted?: boolean): Promise<InventoryRefillSummary[]> {
  const { data } = await api.get("/inventory/refills", {
    params: { include_deleted: includeDeleted ?? false },
  });
  return parseArray(InventoryRefillSummarySchema, data).map((row) => ({
    ...row,
    debt_cash: row.debt_cash != null ? fromMinorUnits(row.debt_cash) : row.debt_cash,
  }));
}

export async function getInventorySnapshot(payload: {
  date?: string;
  time?: string;
  time_of_day?: "morning" | "evening";
  at?: string;
}): Promise<InventorySnapshot | null> {
  const { data } = await api.get("/inventory/snapshot", { params: payload });
  if (!data) return null;
  return parse(InventorySnapshotSchema, data);
}

export async function getInventoryRefillDetails(refillId: string): Promise<InventoryRefillDetails> {
  const { data } = await api.get(`/inventory/refills/${refillId}`);
  const parsed = parse(InventoryRefillDetailsSchema, data);
  return {
    ...parsed,
    total_cost: fromMinorUnits(parsed.total_cost),
    paid_now: fromMinorUnits(parsed.paid_now),
    debt_cash: parsed.debt_cash != null ? fromMinorUnits(parsed.debt_cash) : parsed.debt_cash,
  };
}

export async function updateInventoryRefill(
  refillId: string,
  payload: {
    buy12: number;
    return12: number;
    buy48: number;
    return48: number;
    paid_buy12?: number;
    paid_buy48?: number;
    reason?: string;
    notes?: string;
    allow_negative?: boolean;
    total_cost?: number;
    paid_now?: number;
    debt_cash?: number;
    debt_cylinders_12?: number;
    debt_cylinders_48?: number;
  }
): Promise<InventoryRefillDetails> {
  const body: Record<string, unknown> = {
    buy12: payload.buy12,
    return12: payload.return12,
    buy48: payload.buy48,
    return48: payload.return48,
    total_cost: toMinorUnits(payload.total_cost ?? 0),
    paid_now: toMinorUnits(payload.paid_now ?? 0),
    note: payload.notes ?? payload.reason,
  };
  if (payload.debt_cash != null) {
    body.debt_cash = toMinorUnits(payload.debt_cash);
  }
  if (payload.debt_cylinders_12 != null) {
    body.debt_cylinders_12 = payload.debt_cylinders_12;
  }
  if (payload.debt_cylinders_48 != null) {
    body.debt_cylinders_48 = payload.debt_cylinders_48;
  }
  const { data } = await api.put(`/inventory/refills/${refillId}`, body);
  const parsed = parse(InventoryRefillDetailsSchema, data);
  return {
    ...parsed,
    total_cost: fromMinorUnits(parsed.total_cost),
    paid_now: fromMinorUnits(parsed.paid_now),
    debt_cash: parsed.debt_cash != null ? fromMinorUnits(parsed.debt_cash) : parsed.debt_cash,
  };
}

export async function deleteInventoryRefill(refillId: string): Promise<void> {
  await api.delete(`/inventory/refills/${refillId}`);
}

export async function createInventoryAdjust(payload: {
  date?: string;
  time?: string;
  gas_type: "12kg" | "48kg";
  delta_full: number;
  delta_empty: number;
  reason?: string;
  note?: string;
  group_id?: string;
}): Promise<InventorySnapshot> {
  const happened_at = buildHappenedAt({ date: payload.date, time: payload.time });
  const { data } = await api.post("/inventory/adjust", {
    happened_at,
    gas_type: payload.gas_type,
    delta_full: payload.delta_full,
    delta_empty: payload.delta_empty,
    reason: payload.reason,
    note: payload.note,
    group_id: payload.group_id,
  });
  return parse(InventorySnapshotSchema, data);
}

// Prices
export async function listPriceSettings(): Promise<PriceSetting[]> {
  const { data } = await api.get("/prices");
  return parseArray(PriceSettingSchema, data).map((p) => ({
    ...p,
    selling_price: fromMinorUnits(p.selling_price),
    buying_price: p.buying_price != null ? fromMinorUnits(p.buying_price) : p.buying_price,
    selling_iron_price:
      p.selling_iron_price != null ? fromMinorUnits(p.selling_iron_price) : p.selling_iron_price,
    buying_iron_price:
      p.buying_iron_price != null ? fromMinorUnits(p.buying_iron_price) : p.buying_iron_price,
  }));
}

export async function savePriceSetting(payload: {
  gas_type: "12kg" | "48kg";
  selling_price: number;
  buying_price?: number;
  selling_iron_price?: number;
  buying_iron_price?: number;
  effective_from?: string;
}): Promise<PriceSetting> {
  const { data } = await api.post("/prices", {
    ...payload,
    selling_price: toMinorUnits(payload.selling_price),
    buying_price: toMinorUnits(payload.buying_price ?? 0),
    selling_iron_price: toMinorUnits(payload.selling_iron_price ?? 0),
    buying_iron_price: toMinorUnits(payload.buying_iron_price ?? 0),
  });
  const parsed = parse(PriceSettingSchema, data);
  return {
    ...parsed,
    selling_price: fromMinorUnits(parsed.selling_price),
    buying_price: parsed.buying_price != null ? fromMinorUnits(parsed.buying_price) : parsed.buying_price,
    selling_iron_price:
      parsed.selling_iron_price != null
        ? fromMinorUnits(parsed.selling_iron_price)
        : parsed.selling_iron_price,
    buying_iron_price:
      parsed.buying_iron_price != null
        ? fromMinorUnits(parsed.buying_iron_price)
        : parsed.buying_iron_price,
  };
}

// Expenses
export async function listExpenses(date?: string): Promise<Expense[]> {
  const { data } = await api.get("/expenses", { params: date ? { date } : undefined });
  return parseArray(ExpenseSchema, data).map((e) => ({
    ...e,
    amount: fromMinorUnits(e.amount),
  }));
}

export async function createExpense(payload: ExpenseCreateInput): Promise<Expense> {
  const happened_at = payload.happened_at ?? buildHappenedAt({ date: payload.date });
  const { data } = await api.post("/expenses", {
    ...payload,
    amount: toMinorUnits(payload.amount),
    happened_at,
  });
  const parsed = parse(ExpenseSchema, data);
  return { ...parsed, amount: fromMinorUnits(parsed.amount) };
}

export async function deleteExpense(expenseId: string): Promise<void> {
  await api.delete(`/expenses/${expenseId}`);
}

// Bank deposits
export async function listBankDeposits(date?: string): Promise<BankDeposit[]> {
  const { data } = await api.get("/cash/bank_deposits", { params: date ? { date } : undefined });
  return parseArray(BankDepositSchema, data).map((d) => ({
    ...d,
    amount: fromMinorUnits(d.amount),
  }));
}

export async function createBankDeposit(payload: {
  date: string;
  time?: string;
  amount: number;
  direction?: "wallet_to_bank" | "bank_to_wallet";
  note?: string;
  happened_at?: string;
}): Promise<BankDeposit> {
  const happened_at =
    payload.happened_at ?? buildHappenedAt({ date: payload.date, time: payload.time });
  const { data } = await api.post("/cash/bank_deposit", {
    amount: toMinorUnits(payload.amount),
    direction: payload.direction ?? "wallet_to_bank",
    note: payload.note,
    happened_at,
  });
  const parsed = parse(BankDepositSchema, data);
  return { ...parsed, amount: fromMinorUnits(parsed.amount) };
}

export async function deleteBankDeposit(depositId: string): Promise<void> {
  await api.delete(`/cash/bank_deposit/${depositId}`);
}

