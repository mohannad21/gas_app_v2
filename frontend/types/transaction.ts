import { z } from "zod";

export const CashAdjustmentSchema = z
  .object({
    id: z.string(),
    delta_cash: z.number(),
    reason: z.string().nullish(),
    effective_at: z.string(),
    created_at: z.string(),
    is_deleted: z.boolean().optional(),
  })
  .passthrough();
export type CashAdjustment = z.infer<typeof CashAdjustmentSchema>;

export const CashAdjustmentCreateSchema = z.object({
  date: z.string().optional(),
  time: z.string().optional(),
  delta_cash: z.number(),
  reason: z.string().optional(),
  happened_at: z.string().optional(),
});
export type CashAdjustmentCreate = z.infer<typeof CashAdjustmentCreateSchema>;

export const CashAdjustmentUpdateSchema = z.object({
  delta_cash: z.number().optional(),
  reason: z.string().optional(),
});
export type CashAdjustmentUpdate = z.infer<typeof CashAdjustmentUpdateSchema>;

export const CompanyPaymentSchema = z.object({
  id: z.string(),
  happened_at: z.string(),
  created_at: z.string().optional(),
  amount: z.number(),
  note: z.string().nullish(),
  is_deleted: z.boolean().optional(),
  live_debt_cash: z.number().nullish(),
});
export type CompanyPayment = z.infer<typeof CompanyPaymentSchema>;
export type CompanyPaymentCreateInput = {
  amount: number;
  note?: string;
  date?: string;
  time?: string;
  happened_at?: string;
  request_id?: string;
};

export const CompanyBuyIronSchema = z.object({
  id: z.string(),
  happened_at: z.string(),
  new12: z.number(),
  new48: z.number(),
  total_cost: z.number(),
  paid_now: z.number(),
  note: z.string().nullish(),
});
export type CompanyBuyIron = z.infer<typeof CompanyBuyIronSchema>;
export type CompanyBuyIronCreateInput = {
  new12: number;
  new48: number;
  total_cost: number;
  paid_now: number;
  note?: string;
  date?: string;
  time?: string;
  time_of_day?: "morning" | "evening";
  happened_at?: string;
  request_id?: string;
};

export const CompanyBalanceAdjustmentSchema = z.object({
  id: z.string(),
  happened_at: z.string(),
  created_at: z.string().optional(),
  money_balance: z.number(),
  cylinder_balance_12: z.number(),
  cylinder_balance_48: z.number(),
  delta_money: z.number().optional().default(0),
  delta_cylinder_12: z.number().optional().default(0),
  delta_cylinder_48: z.number().optional().default(0),
  live_debt_cash: z.number().nullish(),
  live_debt_cylinders_12: z.number().nullish(),
  live_debt_cylinders_48: z.number().nullish(),
  note: z.string().nullish(),
  is_deleted: z.boolean().optional(),
});
export type CompanyBalanceAdjustment = z.infer<typeof CompanyBalanceAdjustmentSchema>;
export type CompanyBalanceAdjustmentCreateInput = {
  money_balance: number;
  cylinder_balance_12: number;
  cylinder_balance_48: number;
  note?: string;
  date?: string;
  time?: string;
  time_of_day?: "morning" | "evening";
  happened_at?: string;
  request_id?: string;
};
export type CompanyBalanceAdjustmentUpdateInput = {
  money_balance?: number;
  cylinder_balance_12?: number;
  cylinder_balance_48?: number;
  note?: string;
  date?: string;
  time?: string;
  time_of_day?: "morning" | "evening";
  happened_at?: string;
};

export const CompanyBalancesSchema = z.object({
  company_money: z.number(),
  company_cyl_12: z.number(),
  company_cyl_48: z.number(),
  inventory_full_12: z.number(),
  inventory_empty_12: z.number(),
  inventory_full_48: z.number(),
  inventory_empty_48: z.number(),
});
export type CompanyBalances = z.infer<typeof CompanyBalancesSchema>;

export const ExpenseSchema = z
  .object({
    id: z.string(),
    date: z.string(),
    happened_at: z.string().nullish(),
    expense_type: z.string(),
    amount: z.number(),
    note: z.string().nullish(),
    created_at: z.string().optional(),
    created_by: z.string().nullish(),
    is_deleted: z.boolean().optional(),
  })
  .passthrough();
export type Expense = z.infer<typeof ExpenseSchema>;

export const ExpenseCreateInputSchema = z.object({
  date: z.string(),
  time: z.string().optional(),
  expense_type: z.string(),
  amount: z.number(),
  note: z.string().nullish().optional(),
  created_by: z.string().nullish().optional(),
  happened_at: z.string().optional(),
});
export type ExpenseCreateInput = z.infer<typeof ExpenseCreateInputSchema>;

export const ExpenseUpdateInputSchema = ExpenseCreateInputSchema.partial();
export type ExpenseUpdateInput = z.infer<typeof ExpenseUpdateInputSchema>;

export const BankDepositSchema = z.object({
  id: z.string(),
  happened_at: z.string(),
  created_at: z.string().optional(),
  amount: z.number(),
  direction: z.enum(["wallet_to_bank", "bank_to_wallet"]),
  note: z.string().nullish(),
  is_deleted: z.boolean().optional(),
});
export type BankDeposit = z.infer<typeof BankDepositSchema>;
