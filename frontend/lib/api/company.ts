import { fromMinorUnits, toMinorUnits, setCurrencyCode, setMoneyDecimals } from "@/lib/money";
import { buildActivityHappenedAt } from "@/lib/date";
import {
  SystemSettings,
  SystemSettingsSchema,
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
  SystemInitializeInput,
  SystemHealthCheck,
  SystemHealthCheckSchema,
} from "@/types/domain";

import { api, parse, parseArray } from "./client";

// System
export async function getSystemSettings(): Promise<SystemSettings> {
  const { data } = await api.get("/system/settings");
  const parsed = parse(SystemSettingsSchema, data);
  setMoneyDecimals(parsed.money_decimals);
  setCurrencyCode(parsed.currency_code);
  return parsed;
}

export async function updateSystemSettings(payload: {
  currency_code?: string;
  money_decimals?: number;
}): Promise<SystemSettings> {
  const { data } = await api.patch("/system/settings", payload);
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
    buildActivityHappenedAt({ date: payload.date, time: payload.time });
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
    payload.happened_at ?? buildActivityHappenedAt({ date: payload.date, time: payload.time });
  const { data } = await api.post("/company/payments", {
    amount: toMinorUnits(payload.amount),
    note: payload.note,
    request_id: payload.request_id,
    happened_at,
  });
  const parsed = parse(CompanyPaymentSchema, data);
  return { ...parsed, amount: fromMinorUnits(parsed.amount) };
}

export async function listCompanyPayments(includeDeleted?: boolean): Promise<CompanyPayment[]> {
  const { data } = await api.get("/company/payments", { params: { limit: 50, include_deleted: includeDeleted ?? false } });
  return parseArray(CompanyPaymentSchema, data).map((row) => ({
    ...row,
    amount: fromMinorUnits(row.amount),
    live_debt_cash: row.live_debt_cash != null ? fromMinorUnits(row.live_debt_cash) : row.live_debt_cash,
  }));
}

export async function deleteCompanyPayment(paymentId: string): Promise<void> {
  await api.delete(`/company/payments/${paymentId}`);
}

export async function createCompanyBuyIron(payload: CompanyBuyIronCreateInput): Promise<CompanyBuyIron> {
  const happened_at =
    payload.happened_at ??
    buildActivityHappenedAt({ date: payload.date, time: payload.time });
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
