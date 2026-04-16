import { z } from "zod";
import { GasTypeSchema } from "./common";

export const InventoryAdjustmentSchema = z
  .object({
    id: z.string(),
    group_id: z.string().nullish(),
    gas_type: GasTypeSchema,
    delta_full: z.number(),
    delta_empty: z.number(),
    reason: z.string().nullish(),
    effective_at: z.string(),
    created_at: z.string(),
    is_deleted: z.boolean().optional(),
  })
  .passthrough();
export type InventoryAdjustment = z.infer<typeof InventoryAdjustmentSchema>;

export const InventoryRefillSummarySchema = z
  .object({
    refill_id: z.string(),
    date: z.string(),
    time_of_day: z.enum(["morning", "evening"]).optional(),
    effective_at: z.string(),
    buy12: z.number(),
    return12: z.number(),
    buy48: z.number(),
    return48: z.number(),
    new12: z.number().optional(),
    new48: z.number().optional(),
    debt_cash: z.number().optional().default(0),
    debt_cylinders_12: z.number().optional().default(0),
    debt_cylinders_48: z.number().optional().default(0),
    is_deleted: z.boolean().optional(),
    deleted_at: z.string().nullish(),
  })
  .passthrough();
export type InventoryRefillSummary = z.infer<typeof InventoryRefillSummarySchema>;

export const InventoryAdjustmentUpdateSchema = z.object({
  delta_full: z.number().optional(),
  delta_empty: z.number().optional(),
  reason: z.string().optional(),
  note: z.string().optional(),
  allow_negative: z.boolean().optional(),
});
export type InventoryAdjustmentUpdate = z.infer<typeof InventoryAdjustmentUpdateSchema>;

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

export const InventoryRefillDetailsSchema = z.object({
  refill_id: z.string(),
  business_date: z.string(),
  time_of_day: z.enum(["morning", "evening"]).optional(),
  effective_at: z.string(),
  buy12: z.number(),
  return12: z.number(),
  buy48: z.number(),
  return48: z.number(),
  total_cost: z.number(),
  paid_now: z.number(),
  new12: z.number().optional(),
  new48: z.number().optional(),
  debt_cash: z.number().optional().default(0),
  debt_cylinders_12: z.number().optional().default(0),
  debt_cylinders_48: z.number().optional().default(0),
  notes: z.string().nullish(),
  before_full_12: z.number().optional(),
  before_empty_12: z.number().optional(),
  after_full_12: z.number().optional(),
  after_empty_12: z.number().optional(),
  before_full_48: z.number().optional(),
  before_empty_48: z.number().optional(),
  after_full_48: z.number().optional(),
  after_empty_48: z.number().optional(),
  is_deleted: z.boolean().optional(),
  deleted_at: z.string().nullish(),
});
export type InventoryRefillDetails = z.infer<typeof InventoryRefillDetailsSchema>;
