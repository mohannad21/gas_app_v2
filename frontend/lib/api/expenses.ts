import { fromMinorUnits, toMinorUnits } from "@/lib/money";
import { buildHappenedAt } from "@/lib/date";
import {
  Expense,
  ExpenseCreateInput,
  ExpenseUpdateInput,
  ExpenseSchema,
  BankDeposit,
  BankDepositSchema,
} from "@/types/domain";

import { api, parse, parseArray } from "./client";

// Expenses
export async function listExpenses(date?: string, includeDeleted?: boolean): Promise<Expense[]> {
  const { data } = await api.get("/expenses", { params: { date, limit: 50, include_deleted: includeDeleted ?? false } });
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

export async function updateExpense(expenseId: string, payload: ExpenseUpdateInput): Promise<Expense> {
  const { data } = await api.patch(`/expenses/${expenseId}`, {
    ...payload,
    amount: payload.amount != null ? toMinorUnits(payload.amount) : payload.amount,
  });
  const parsed = parse(ExpenseSchema, data);
  return { ...parsed, amount: fromMinorUnits(parsed.amount) };
}

export async function deleteExpense(expenseId: string): Promise<void> {
  await api.delete(`/expenses/${expenseId}`);
}

// Bank deposits
export async function listBankDeposits(date?: string, includeDeleted?: boolean): Promise<BankDeposit[]> {
  const { data } = await api.get("/cash/bank_deposits", { params: { date, limit: 50, include_deleted: includeDeleted ?? false } });
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
