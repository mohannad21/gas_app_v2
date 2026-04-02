import { z } from "zod";

export const GasTypeSchema = z.enum(["12kg", "48kg"]);
export type GasType = z.infer<typeof GasTypeSchema>;

export const OrderModeSchema = z.enum(["replacement", "sell_iron", "buy_iron"]);
export type OrderMode = z.infer<typeof OrderModeSchema>;

export const ActivityTypeSchema = z.enum(["order", "customer", "price", "system", "inventory"]);
export type ActivityType = z.infer<typeof ActivityTypeSchema>;

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
  entity_id: activity.entity_id ?? undefined,
  customer_id: activity.entity_type === "customer" ? activity.entity_id ?? undefined : undefined,
  metadata: activity.metadata ?? undefined,
  created_at: activity.created_at,
  created_by: activity.created_by ?? undefined,
}));
export type Activity = z.infer<typeof ActivitySchema>;
