import axios from "axios";
import {
  Activity,
  ActivitySchema,
  Customer,
  CustomerCreateInput,
  CustomerAdjustment,
  CustomerAdjustmentCreateInput,
  CustomerAdjustmentSchema,
  CustomerSchema,
  CustomerUpdateInput,
  DailyReportRow,
  DailyReportRowSchema,
  DailyReportV2Card,
  DailyReportV2CardSchema,
  DailyReportV2Day,
  DailyReportV2DaySchema,
  CashAdjustment,
  CashAdjustmentCreate,
  CashAdjustmentSchema,
  CashAdjustmentUpdate,
  InventoryDayResponse,
  InventoryDayResponseSchema,
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
  SystemUpdateInput,
} from "@/types/domain";
import { z } from "zod";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";
console.log("[api] baseURL", BASE_URL);

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
  (response) => {
    const meta = (response.config as any).metadata;
    if (meta?.start) {
      const ms = Date.now() - meta.start;
      console.log("[api] ok", response.config.url, ms + "ms");
    }
    return response;
  },
  (error) => {
    const cfg = error?.config;
    const meta = cfg?.metadata;
    const ms = meta?.start ? Date.now() - meta.start : null;
    console.log("[api] error", cfg?.url, ms ? ms + "ms" : "", error?.message);
    return Promise.reject(error);
  }
);

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

function parseArray<T>(schema: z.ZodType<T>, data: unknown): T[] {
  return schema.array().parse(data);
}

// Customers
export async function listCustomers(): Promise<Customer[]> {
  const { data } = await api.get("/customers");
  return parseArray(CustomerSchema, data);
}

export async function createCustomer(payload: CustomerCreateInput): Promise<Customer> {
  const { data } = await api.post("/customers", payload);
  return parse(CustomerSchema, data);
}

export async function createCustomerAdjustment(
  payload: CustomerAdjustmentCreateInput
): Promise<CustomerAdjustment> {
  const { data } = await api.post("/customer-adjustments", payload);
  return parse(CustomerAdjustmentSchema, data);
}

export async function updateCustomer(id: string, payload: CustomerUpdateInput): Promise<Customer> {
  const { data } = await api.put(`/customers/${id}`, payload);
  return parse(CustomerSchema, data);
}

export async function deleteCustomer(id: string): Promise<void> {
  await api.delete(`/customers/${id}`);
}

// System
export async function getSystemSettings(): Promise<SystemSettings> {
  const { data } = await api.get("/system/settings");
  return parse(SystemSettingsSchema, data);
}

export async function initializeSystem(payload: SystemInitializeInput): Promise<SystemSettings> {
  const { data } = await api.post("/system/initialize", payload);
  return parse(SystemSettingsSchema, data);
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

// Inventory adjustments
export async function listInventoryAdjustments(
  date: string,
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
  date: string,
  includeDeleted?: boolean
): Promise<CashAdjustment[]> {
  const { data } = await api.get("/cash/adjustments", {
    params: { date, include_deleted: includeDeleted ?? false },
  });
  return parseArray(CashAdjustmentSchema, data);
}

export async function createCashAdjustment(payload: CashAdjustmentCreate): Promise<CashAdjustment> {
  const { data } = await api.post("/cash/adjust", payload);
  return parse(CashAdjustmentSchema, data);
}

export async function updateCashAdjustment(
  deltaId: string,
  payload: CashAdjustmentUpdate
): Promise<CashAdjustment> {
  const { data } = await api.put(`/cash/adjust/${deltaId}`, payload);
  return parse(CashAdjustmentSchema, data);
}

export async function deleteCashAdjustment(deltaId: string): Promise<void> {
  await api.delete(`/cash/adjust/${deltaId}`);
}

// Orders
export async function listOrders(): Promise<Order[]> {
  const { data } = await api.get("/orders");
  return parseArray(OrderSchema, data);
}

export async function listOrdersByDate(date: string): Promise<Order[]> {
  const { data } = await api.get("/orders", { params: { date } });
  return parseArray(OrderSchema, data);
}

export async function createOrder(payload: OrderCreateInput): Promise<Order> {
  const { data } = await api.post("/orders", payload);
  return parse(OrderSchema, data);
}

export async function updateOrder(id: string, payload: OrderUpdateInput): Promise<Order> {
  const { data } = await api.put(`/orders/${id}`, payload);
  return parse(OrderSchema, data);
}

export async function deleteOrder(id: string): Promise<void> {
  await api.delete(`/orders/${id}`);
}

// Collections
export async function createCollection(payload: CollectionCreateInput): Promise<any> {
  const { data } = await api.post("/collections", payload);
  return data;
}

export async function listCollections(): Promise<CollectionEvent[]> {
  const { data } = await api.get("/collections");
  return parseArray(CollectionEventSchema, data);
}

export async function updateCollection(id: string, payload: CollectionUpdateInput): Promise<CollectionEvent> {
  const { data } = await api.put(`/collections/${id}`, payload);
  return parse(CollectionEventSchema, data);
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
  money_received: number;
  money_given: number;
  delivered_at?: string;
}): Promise<OrderImpact> {
  const { data } = await api.get("/orders/validate_order_impact", { params });
  return parse(OrderImpactSchema, data);
}

export async function getOrderWhatsappLink(orderId: string): Promise<WhatsappLink> {
  const { data } = await api.get(`/orders/whatsapp_link/${orderId}`);
  return parse(WhatsappLinkSchema, data);
}

// Activities
export async function listActivities(): Promise<Activity[]> {
  const { data } = await api.get("/activities");
  return parseArray(ActivitySchema, data);
}

// Daily reports
export async function listDailyReports(): Promise<DailyReportRow[]> {
  const { data } = await api.get("/reports/daily");
  return parseArray(DailyReportRowSchema, data);
}

export async function listDailyReportsV2(params: { from: string; to: string }): Promise<DailyReportV2Card[]> {
  const { data } = await api.get("/reports/daily_v2", { params });
  return parseArray(DailyReportV2CardSchema, data);
}

export async function getDailyReportV2(date: string): Promise<DailyReportV2Day> {
  const { data } = await api.get("/reports/day_v2", { params: { date } });
  return parse(DailyReportV2DaySchema, data);
}

export async function getInventoryDay(date: string): Promise<InventoryDayResponse> {
  const { data } = await api.get("/inventory/day", { params: { date } });
  return parse(InventoryDayResponseSchema, data);
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
  total_cost?: number;
  paid_now?: number;
  reason?: string;
}): Promise<InventorySnapshot> {
  const { data } = await api.post("/inventory/refill", payload);
  return parse(InventorySnapshotSchema, data);
}

export async function listInventoryRefills(includeDeleted?: boolean): Promise<InventoryRefillSummary[]> {
  const { data } = await api.get("/inventory/refills", {
    params: { include_deleted: includeDeleted ?? false },
  });
  return parseArray(InventoryRefillSummarySchema, data);
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
  return parse(InventoryRefillDetailsSchema, data);
}

export async function updateInventoryRefill(
  refillId: string,
  payload: {
    buy12: number;
    return12: number;
    buy48: number;
    return48: number;
    reason?: string;
    allow_negative?: boolean;
    total_cost?: number;
    paid_now?: number;
  }
): Promise<InventoryRefillDetails> {
  const { data } = await api.put(`/inventory/refills/${refillId}`, payload);
  return parse(InventoryRefillDetailsSchema, data);
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
  reason: string;
  note?: string;
}): Promise<InventorySnapshot> {
  const { data } = await api.post("/inventory/adjust", payload);
  return parse(InventorySnapshotSchema, data);
}

// Prices
export async function listPriceSettings(): Promise<PriceSetting[]> {
  const { data } = await api.get("/prices");
  return parseArray(PriceSettingSchema, data);
}

export async function savePriceSetting(payload: {
  gas_type: "12kg" | "48kg";
  customer_type: "any" | "private" | "industrial";
  selling_price: number;
  buying_price?: number;
  effective_from?: string;
}): Promise<PriceSetting> {
  const { data } = await api.post("/prices", payload);
  return parse(PriceSettingSchema, data);
}

// Expenses
export async function listExpenses(date?: string): Promise<Expense[]> {
  const { data } = await api.get("/expenses", { params: date ? { date } : undefined });
  return parseArray(ExpenseSchema, data);
}

export async function createExpense(payload: ExpenseCreateInput): Promise<Expense> {
  const { data } = await api.post("/expenses", payload);
  return parse(ExpenseSchema, data);
}

export async function deleteExpense(date: string, expenseType: string): Promise<void> {
  await api.delete("/expenses", { params: { date, expense_type: expenseType } });
}

// Bank deposits
export async function listBankDeposits(date: string): Promise<BankDeposit[]> {
  const { data } = await api.get("/cash/bank_deposits", { params: { date } });
  return parseArray(BankDepositSchema, data);
}

export async function createBankDeposit(payload: {
  date: string;
  amount: number;
  note?: string;
}): Promise<BankDeposit> {
  const { data } = await api.post("/cash/bank_deposit", payload);
  return parse(BankDepositSchema, data);
}

export async function deleteBankDeposit(depositId: string): Promise<void> {
  await api.delete(`/cash/bank_deposit/${depositId}`);
}
