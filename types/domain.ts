import { z } from "zod";

export const GasTypeSchema = z.enum(["12kg", "48kg"]);
export type GasType = z.infer<typeof GasTypeSchema>;

export const CustomerTypeSchema = z.enum(["private", "industrial", "other"]);
export type CustomerType = z.infer<typeof CustomerTypeSchema>;

export const SystemTypeSchema = z.enum(["main_kitchen", "side_kitchen", "oven", "restaurant", "other"]);
export type SystemType = z.infer<typeof SystemTypeSchema>;

export const ActivityTypeSchema = z.enum(["order", "customer", "price", "system", "inventory"]);
export type ActivityType = z.infer<typeof ActivityTypeSchema>;

export const CustomerSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    phone: z.string(),
    notes: z.string().nullish(),
    customer_type: CustomerTypeSchema,
    money_balance: z.number(),
    number_of_orders: z.number(),
    cylinder_balance_12kg: z.number(),
    cylinder_balance_48kg: z.number(),
    created_at: z.string(),
  })
  .passthrough();
export type Customer = z.infer<typeof CustomerSchema>;

export const SystemSchema = z
  .object({
    id: z.string(),
    customer_id: z.string(),
    name: z.string(),
    location: z.string().nullish(),
    system_type: SystemTypeSchema,
    gas_type: GasTypeSchema.nullish(),
    system_customer_type: CustomerTypeSchema.nullish(),
    is_active: z.boolean().optional(),
    require_security_check: z.boolean().optional(),
    security_check_exists: z.boolean().optional(),
    security_check_date: z.string().nullish(),
  })
  .passthrough();
export type System = z.infer<typeof SystemSchema>;

export const OrderSchema = z
  .object({
    id: z.string(),
    customer_id: z.string(),
    system_id: z.string(),
    delivered_at: z.string(),
    gas_type: GasTypeSchema,
    cylinders_installed: z.number(),
    cylinders_received: z.number(),
    price_total: z.number(),
    paid_amount: z.number(),
    note: z.string().nullish(),
  })
  .passthrough();
export type Order = z.infer<typeof OrderSchema>;

export const ActivityApiSchema = z
  .object({
    id: z.string(),
    entity_type: ActivityTypeSchema,
    entity_id: z.string().nullish(),
    action: z.string(),
    description: z.string(),
    metadata: z.string().nullish(),
    created_at: z.string(),
    created_by: z.string().nullish(),
  })
  .passthrough();

export const ActivitySchema = ActivityApiSchema.transform((activity) => ({
  id: activity.id,
  type: activity.entity_type,
  action: activity.action,
  description: activity.description,
  customer_id: activity.entity_id ?? undefined,
  metadata: activity.metadata ?? undefined,
  created_at: activity.created_at,
  created_by: activity.created_by ?? undefined,
}));
export type Activity = z.infer<typeof ActivitySchema>;

export const InventorySnapshotSchema = z.object({
  as_of: z.string(),
  full12: z.number(),
  empty12: z.number(),
  total12: z.number(),
  full48: z.number(),
  empty48: z.number(),
  total48: z.number(),
  reason: z.string().nullish(),
});
export type InventorySnapshot = z.infer<typeof InventorySnapshotSchema>;

export const DailyReportRowSchema = z.object({
  date: z.string(),
  display: z.string(),
  installed12: z.number(),
  received12: z.number(),
  installed48: z.number(),
  received48: z.number(),
  expected: z.number(),
  received: z.number(),
  inventory_start: InventorySnapshotSchema.nullish(),
  inventory_end: InventorySnapshotSchema.nullish(),
  orders: z
    .array(
      z.object({
        id: z.string(),
        customer: z.string(),
        system: z.string(),
        gas: GasTypeSchema,
        total: z.number(),
        paid: z.number(),
        installed: z.number(),
        receivedCyl: z.number(),
        note: z.string().nullish(),
      })
    )
    .optional(),
});
export type DailyReportRow = z.infer<typeof DailyReportRowSchema>;

export const PriceSettingSchema = z
  .object({
    id: z.string(),
    gas_type: GasTypeSchema,
    customer_type: CustomerTypeSchema.or(z.literal("any")),
    selling_price: z.number(),
    buying_price: z.number().optional().nullable(),
    effective_from: z.string(),
    created_at: z.string().optional(),
    created_by: z.string().nullish(),
  })
  .passthrough();
export type PriceSetting = z.infer<typeof PriceSettingSchema>;
