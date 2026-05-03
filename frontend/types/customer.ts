import { z } from "zod";

export const CustomerSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    phone: z.string().nullish(),
    address: z.string().nullish(),
    note: z.string().nullish(),
    money_balance: z.number().optional().default(0),
    money_to_receive: z.number().optional().default(0),
    money_to_give: z.number().optional().default(0),
    total_cylinders_delivered_lifetime: z.number().optional().default(0),
    order_count: z.number().optional().default(0),
    cylinder_balance_12kg: z.number().optional().default(0),
    cylinder_to_receive_12kg: z.number().optional().default(0),
    cylinder_to_give_12kg: z.number().optional().default(0),
    cylinder_balance_48kg: z.number().optional().default(0),
    cylinder_to_receive_48kg: z.number().optional().default(0),
    cylinder_to_give_48kg: z.number().optional().default(0),
    created_at: z.string(),
  })
  .passthrough();
export type Customer = z.infer<typeof CustomerSchema>;

export const CustomerBalanceSchema = z.object({
  customer_id: z.string(),
  money_balance: z.number().optional().default(0),
  cylinder_balance_12kg: z.number().optional().default(0),
  cylinder_balance_48kg: z.number().optional().default(0),
  order_count: z.number().optional().default(0),
});
export type CustomerBalance = z.infer<typeof CustomerBalanceSchema>;

export const CustomerCreateInputSchema = z.object({
  name: z.string(),
  phone: z.string().nullish().optional(),
  address: z.string().nullish().optional(),
  note: z.string().nullish().optional(),
});
export type CustomerCreateInput = z.infer<typeof CustomerCreateInputSchema>;

export const CustomerUpdateInputSchema = z.object({
  name: z.string().optional(),
  phone: z.string().nullish().optional(),
  address: z.string().nullish().optional(),
  note: z.string().nullish().optional(),
});
export type CustomerUpdateInput = z.infer<typeof CustomerUpdateInputSchema>;

export const CustomerAdjustmentSchema = z
  .object({
    id: z.string(),
    customer_id: z.string(),
    amount_money: z.number(),
    count_12kg: z.number(),
    count_48kg: z.number(),
    reason: z.string().nullish(),
    effective_at: z.string(),
    created_at: z.string(),
    debt_cash: z.number().optional().default(0),
    debt_cylinders_12: z.number().optional().default(0),
    debt_cylinders_48: z.number().optional().default(0),
    live_debt_cash: z.number().nullish(),
    live_debt_cylinders_12: z.number().nullish(),
    live_debt_cylinders_48: z.number().nullish(),
    is_deleted: z.boolean().optional(),
  })
  .passthrough();
export type CustomerAdjustment = z.infer<typeof CustomerAdjustmentSchema>;

export const CustomerAdjustmentCreateInputSchema = z.object({
  customer_id: z.string(),
  amount_money: z.number().optional(),
  count_12kg: z.number().optional(),
  count_48kg: z.number().optional(),
  reason: z.string().optional(),
  request_id: z.string().optional(),
  happened_at: z.string().optional(),
});
export type CustomerAdjustmentCreateInput = z.infer<typeof CustomerAdjustmentCreateInputSchema>;
