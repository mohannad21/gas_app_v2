import { z } from "zod";
import { GasTypeSchema, OrderModeSchema } from "./common";

export const OrderSchema = z
  .object({
    id: z.string(),
    customer_id: z.string(),
    system_id: z.string(),
    delivered_at: z.string(),
    created_at: z.string(),
    updated_at: z.string().nullish(),
    order_mode: OrderModeSchema.optional(),
    gas_type: GasTypeSchema,
    cylinders_installed: z.number(),
    cylinders_received: z.number(),
    price_total: z.number(),
    paid_amount: z.number().optional(),
    debt_cash: z.number().optional().default(0),
    debt_cylinders_12: z.number().optional().default(0),
    debt_cylinders_48: z.number().optional().default(0),
    applied_credit: z.number().optional().nullish(),
    money_balance_before: z.number().optional().nullish(),
    money_balance_after: z.number().optional().nullish(),
    cyl_balance_before: z.record(z.string(), z.number()).optional().nullish(),
    cyl_balance_after: z.record(z.string(), z.number()).optional().nullish(),
    note: z.string().nullish(),
    is_deleted: z.boolean().optional(),
  })
  .passthrough();
export type Order = z.infer<typeof OrderSchema>;

export const OrderCreateInputSchema = z.object({
  customer_id: z.string(),
  system_id: z.string().optional(),
  delivered_at: z.string().optional(),
  order_mode: OrderModeSchema.optional(),
  gas_type: GasTypeSchema,
  cylinders_installed: z.number(),
  cylinders_received: z.number(),
  price_total: z.number(),
  paid_amount: z.number().optional(),
  debt_cash: z.number().optional(),
  debt_cylinders_12: z.number().optional(),
  debt_cylinders_48: z.number().optional(),
  note: z.string().nullish().optional(),
  request_id: z.string().optional(),
});
export type OrderCreateInput = z.infer<typeof OrderCreateInputSchema>;

export const OrderUpdateInputSchema = OrderCreateInputSchema.partial();
export type OrderUpdateInput = z.infer<typeof OrderUpdateInputSchema>;

export const CollectionCreateInputSchema = z.object({
  customer_id: z.string(),
  action_type: z.enum(["payment", "payout", "return"]),
  amount_money: z.number().optional(),
  qty_12kg: z.number().optional(),
  qty_48kg: z.number().optional(),
  debt_cash: z.number().optional(),
  debt_cylinders_12: z.number().optional(),
  debt_cylinders_48: z.number().optional(),
  system_id: z.string().nullish().optional(),
  effective_at: z.string().optional(),
  note: z.string().nullish().optional(),
  request_id: z.string().optional(),
});
export type CollectionCreateInput = z.infer<typeof CollectionCreateInputSchema>;

export const CollectionUpdateInputSchema = CollectionCreateInputSchema.partial();
export type CollectionUpdateInput = z.infer<typeof CollectionUpdateInputSchema>;

export const CollectionEventSchema = z
  .object({
    id: z.string(),
    customer_id: z.string(),
    action_type: z.enum(["payment", "payout", "return"]),
    amount_money: z.number().nullish(),
    qty_12kg: z.number().nullish(),
    qty_48kg: z.number().nullish(),
    debt_cash: z.number().nullish(),
    debt_cylinders_12: z.number().nullish(),
    debt_cylinders_48: z.number().nullish(),
    system_id: z.string().nullish(),
    created_at: z.string(),
    effective_at: z.string().nullish(),
    note: z.string().nullish(),
    is_deleted: z.boolean().optional(),
  })
  .passthrough();
export type CollectionEvent = z.infer<typeof CollectionEventSchema>;

export const OrderImpactSchema = z.object({
  gross_paid: z.number(),
  applied_credit: z.number(),
  unpaid: z.number(),
  new_balance: z.number(),
  cyl_balance_before: z.record(z.string(), z.number()).optional(),
  cyl_balance_after: z.record(z.string(), z.number()).optional(),
});
export type OrderImpact = z.infer<typeof OrderImpactSchema>;
