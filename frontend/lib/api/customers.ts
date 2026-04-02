import { fromMinorUnits, toMinorUnits } from "@/lib/money";
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
} from "@/types/domain";

import { api, parse, parseArray } from "./client";

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
