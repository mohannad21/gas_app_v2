import { z } from "zod";

export const BillingEventSchema = z.object({
  kind: z.string(),
  amount: z.number(),
  note: z.string().nullable(),
  effective_at: z.string(),
});

export const PlanBillingStatusSchema = z.object({
  plan_name: z.string(),
  subscription_status: z.string(),
  current_period_end: z.string().nullable(),
  grace_period_end: z.string().nullable(),
  outstanding_balance: z.number(),
  recent_events: z.array(BillingEventSchema),
});

export type PlanBillingStatus = z.infer<typeof PlanBillingStatusSchema>;
export type BillingEvent = z.infer<typeof BillingEventSchema>;
