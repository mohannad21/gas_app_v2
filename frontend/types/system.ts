import { z } from "zod";
import { GasTypeSchema } from "./common";

export const SystemSettingsSchema = z
  .object({
    id: z.string(),
    is_setup_completed: z.boolean(),
    currency_code: z.string(),
    money_decimals: z.number(),
    created_at: z.string(),
  })
  .passthrough();
export type SystemSettings = z.infer<typeof SystemSettingsSchema>;

export const SystemInitializeInputSchema = z.object({
  sell_price_12: z.number(),
  sell_price_48: z.number(),
  buy_price_12: z.number().optional(),
  buy_price_48: z.number().optional(),
  sell_iron_price_12: z.number().optional(),
  sell_iron_price_48: z.number().optional(),
  buy_iron_price_12: z.number().optional(),
  buy_iron_price_48: z.number().optional(),
  full_12: z.number(),
  empty_12: z.number(),
  full_48: z.number(),
  empty_48: z.number(),
  cash_start: z.number(),
  company_payable_money: z.number().optional(),
  company_full_12kg: z.number().optional(),
  company_empty_12kg: z.number().optional(),
  company_full_48kg: z.number().optional(),
  company_empty_48kg: z.number().optional(),
  currency_code: z.string().optional(),
  money_decimals: z.number().optional(),
  customer_debts: z
    .array(
      z.object({
        customer_id: z.string(),
        money: z.number().optional().default(0),
        cyl_12: z.number().optional().default(0),
        cyl_48: z.number().optional().default(0),
      })
    )
    .optional(),
});
export type SystemInitializeInput = z.infer<typeof SystemInitializeInputSchema>;

export const LedgerHealthIssueSchema = z.object({
  issue_type: z.enum(["mismatch", "orphan"]),
  source_type: z.string(),
  source_id: z.string(),
  message: z.string(),
});
export type LedgerHealthIssue = z.infer<typeof LedgerHealthIssueSchema>;

export const SystemHealthCheckSchema = z.object({
  ok: z.boolean(),
  checked_at: z.string(),
  mismatches: z.number(),
  orphans: z.number(),
  issues: z.array(LedgerHealthIssueSchema).optional().default([]),
});
export type SystemHealthCheck = z.infer<typeof SystemHealthCheckSchema>;

export const SystemSchema = z
  .object({
    id: z.string(),
    customer_id: z.string(),
    name: z.string(),
    gas_type: GasTypeSchema,
    note: z.string().nullish(),
    requires_security_check: z.boolean().optional(),
    security_check_exists: z.boolean().optional(),
    last_security_check_at: z.string().nullish(),
    next_security_check_at: z.string().nullish(),
    is_active: z.boolean().optional(),
    created_at: z.string().nullish(),
  })
  .passthrough();
export type System = z.infer<typeof SystemSchema>;

export const SystemCreateInputSchema = z.object({
  customer_id: z.string(),
  name: z.string(),
  gas_type: GasTypeSchema,
  note: z.string().nullish().optional(),
  requires_security_check: z.boolean().optional(),
  security_check_exists: z.boolean().optional(),
  last_security_check_at: z.string().nullish().optional(),
  is_active: z.boolean().optional(),
});
export type SystemCreateInput = z.infer<typeof SystemCreateInputSchema>;

export const SystemUpdateInputSchema = SystemCreateInputSchema.partial();
export type SystemUpdateInput = z.infer<typeof SystemUpdateInputSchema>;

export const SystemTypeOptionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    is_active: z.boolean().optional(),
    created_at: z.string().nullish(),
  })
  .passthrough();
export type SystemTypeOption = z.infer<typeof SystemTypeOptionSchema>;
