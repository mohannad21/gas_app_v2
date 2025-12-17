import axios from "axios";
import {
  Activity,
  ActivitySchema,
  Customer,
  CustomerSchema,
  DailyReportRow,
  DailyReportRowSchema,
  InventorySnapshot,
  InventorySnapshotSchema,
  Order,
  OrderSchema,
  PriceSetting,
  PriceSettingSchema,
  System,
  SystemSchema,
} from "@/types/domain";
import { z } from "zod";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 8000,
});

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

export async function createCustomer(payload: Partial<Customer>): Promise<Customer> {
  const { data } = await api.post("/customers", payload);
  return parse(CustomerSchema, data);
}

export async function updateCustomer(id: string, payload: Partial<Customer>): Promise<Customer> {
  const { data } = await api.put(`/customers/${id}`, payload);
  return parse(CustomerSchema, data);
}

export async function deleteCustomer(id: string): Promise<void> {
  await api.delete(`/customers/${id}`);
}

// Systems
export async function listSystems(customerId?: string): Promise<System[]> {
  const { data } = await api.get("/systems", {
    params: customerId ? { customerId } : undefined,
  });
  return parseArray(SystemSchema, data);
}

export async function createSystem(payload: Partial<System>): Promise<System> {
  const { data } = await api.post("/systems", payload);
  return parse(SystemSchema, data);
}

export async function updateSystem(id: string, payload: Partial<System>): Promise<System> {
  const { data } = await api.put(`/systems/${id}`, payload);
  return parse(SystemSchema, data);
}

export async function deleteSystem(id: string): Promise<void> {
  await api.delete(`/systems/${id}`);
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

export async function createOrder(payload: Partial<Order>): Promise<Order> {
  const { data } = await api.post("/orders", payload);
  return parse(OrderSchema, data);
}

export async function updateOrder(id: string, payload: Partial<Order>): Promise<Order> {
  const { data } = await api.put(`/orders/${id}`, payload);
  return parse(OrderSchema, data);
}

export async function deleteOrder(id: string): Promise<void> {
  await api.delete(`/orders/${id}`);
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
  full12: number;
  empty12: number;
  full48: number;
  empty48: number;
  reason?: string;
}): Promise<InventorySnapshot> {
  const { data } = await api.post("/inventory/init", payload);
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
