import { z } from "zod";
import { GasTypeSchema, OrderModeSchema } from "./common";

export const ReportInventoryTotalsSchema = z.object({
  full12: z.number(),
  empty12: z.number(),
  full48: z.number(),
  empty48: z.number(),
});
export type ReportInventoryTotals = z.infer<typeof ReportInventoryTotalsSchema>;

export const ReportInventoryStateSchema = z.object({
  full12: z.number().nullish(),
  empty12: z.number().nullish(),
  full48: z.number().nullish(),
  empty48: z.number().nullish(),
});
export type ReportInventoryState = z.infer<typeof ReportInventoryStateSchema>;

export const DailyAuditSummarySchema = z.object({
  cash_in: z.number(),
  new_debt: z.number(),
  inv_delta_12: z.number(),
  inv_delta_48: z.number(),
});
export type DailyAuditSummary = z.infer<typeof DailyAuditSummarySchema>;

export const DailyReportV2CashMathSchema = z.object({
  sales: z.number(),
  late: z.number(),
  expenses: z.number(),
  company: z.number(),
  adjust: z.number(),
  other: z.number().optional(),
});
export type DailyReportV2CashMath = z.infer<typeof DailyReportV2CashMathSchema>;

export const DailyReportV2MathCustomersSchema = z.object({
  sales_cash: z.number(),
  paid_earlier: z.number(),
  extra_paid: z.number(),
});
export type DailyReportV2MathCustomers = z.infer<typeof DailyReportV2MathCustomersSchema>;

export const DailyReportV2MathCompanySchema = z.object({
  paid_company: z.number(),
  extra_company: z.number(),
});
export type DailyReportV2MathCompany = z.infer<typeof DailyReportV2MathCompanySchema>;

export const DailyReportV2MathResultSchema = z.object({
  expenses: z.number(),
  adjustments: z.number(),
  pocket_delta: z.number(),
});
export type DailyReportV2MathResult = z.infer<typeof DailyReportV2MathResultSchema>;

export const DailyReportV2MathSchema = z.object({
  customers: DailyReportV2MathCustomersSchema,
  company: DailyReportV2MathCompanySchema,
  result: DailyReportV2MathResultSchema,
});
export type DailyReportV2Math = z.infer<typeof DailyReportV2MathSchema>;

export const BalanceTransitionSchema = z.object({
  scope: z.enum(["customer", "company"]),
  component: z.enum(["money", "cyl_12", "cyl_48"]),
  before: z.number(),
  after: z.number(),
  display_name: z.string().nullish(),
  display_description: z.string().nullish(),
  intent: z.string().nullish(),
});
export type BalanceTransition = z.infer<typeof BalanceTransitionSchema>;

export const DailyReportV2CardSchema = z.object({
  date: z.string(),
  cash_start: z.number(),
  cash_end: z.number(),
  sold_12kg: z.number(),
  sold_48kg: z.number(),
  net_today: z.number(),
  has_refill: z.boolean().optional().default(false),
  cash_math: DailyReportV2CashMathSchema,
  math: DailyReportV2MathSchema.optional(),
  company_start: z.number().optional(),
  company_end: z.number().optional(),
  company_12kg_start: z.number().optional(),
  company_12kg_end: z.number().optional(),
  company_48kg_start: z.number().optional(),
  company_48kg_end: z.number().optional(),
  company_give_start: z.number().optional(),
  company_give_end: z.number().optional(),
  company_receive_start: z.number().optional(),
  company_receive_end: z.number().optional(),
  company_12kg_give_start: z.number().optional(),
  company_12kg_give_end: z.number().optional(),
  company_12kg_receive_start: z.number().optional(),
  company_12kg_receive_end: z.number().optional(),
  company_48kg_give_start: z.number().optional(),
  company_48kg_give_end: z.number().optional(),
  company_48kg_receive_start: z.number().optional(),
  company_48kg_receive_end: z.number().optional(),
  inventory_start: ReportInventoryTotalsSchema,
  inventory_end: ReportInventoryTotalsSchema,
  problems: z.array(z.string()),
  problem_transitions: z
    .array(
      z.object({
        scope: z.enum(["customer", "company"]),
        component: z.enum(["money", "cyl_12", "cyl_48"]),
        before: z.number(),
        after: z.number(),
        display_name: z.string().nullish(),
        display_description: z.string().nullish(),
      })
    )
    .optional()
    .default([]),
  recalculated: z.boolean().optional(),
});
export type DailyReportV2Card = z.infer<typeof DailyReportV2CardSchema>;

export const Level3CounterpartySchema = z.object({
  type: z.enum(["customer", "company", "none"]),
  display_name: z.string().nullish(),
  description: z.string().nullish(),
  display: z.string().nullish(),
});
export type Level3Counterparty = z.infer<typeof Level3CounterpartySchema>;

export const Level3SystemSchema = z.object({
  display_name: z.string(),
});
export type Level3System = z.infer<typeof Level3SystemSchema>;

export const Level3HeroSchema = z.object({
  text: z.string(),
});
export type Level3Hero = z.infer<typeof Level3HeroSchema>;

export const Level3MoneySchema = z.object({
  verb: z.enum(["received", "paid", "none"]),
  amount: z.number(),
});
export type Level3Money = z.infer<typeof Level3MoneySchema>;

export const Level3SettlementComponentsSchema = z.object({
  money: z.boolean(),
  cyl12: z.boolean(),
  cyl48: z.boolean(),
});
export type Level3SettlementComponents = z.infer<typeof Level3SettlementComponentsSchema>;

export const Level3SettlementSchema = z.object({
  scope: z.enum(["customer", "company", "none"]),
  is_settled: z.boolean(),
  components: Level3SettlementComponentsSchema.nullish(),
});
export type Level3Settlement = z.infer<typeof Level3SettlementSchema>;

export const Level3ActionSchema = z.object({
  category: z.enum(["money", "cylinders"]),
  direction: z.enum([
    "customer_pays",
    "pay_customer",
    "pay_company",
    "company_pays",
    "customer_returns_empty",
    "return_empty_to_company",
    "deliver_full_to_customer",
    "company_delivers_full_to_you",
    "customer->dist",
    "dist->customer",
    "dist->company",
    "company->dist",
  ]),
  amount: z.number().nullish(),
  gas_type: z.enum(["12", "48"]).nullish(),
  qty: z.number().nullish(),
  unit: z.enum(["empty", "full"]).nullish(),
  kind: z.enum(["money", "empty_12", "empty_48", "full_12", "full_48"]).nullish(),
  severity: z.enum(["warning", "danger"]).nullish(),
  text: z.string().nullish(),
});
export type Level3Action = z.infer<typeof Level3ActionSchema>;

export const ActivityNoteSchema = z.object({
  kind: z.enum(["money", "cyl_12", "cyl_48", "cyl_full_12", "cyl_full_48"]),
  direction: z.enum([
    "customer_pays_you",
    "you_pay_customer",
    "you_paid_customer_earlier",
    "customer_paid_earlier",
    "customer_extra_paid",
    "you_pay_company",
    "you_paid_earlier",
    "company_pays_you",
    "customer_returns_you",
    "you_return_company",
    "you_returned_earlier",
    "you_deliver_customer",
    "company_delivers_you",
  ]),
  remaining_after: z.number(),
  remaining_before: z.number().nullish(),
});
export type ActivityNote = z.infer<typeof ActivityNoteSchema>;

export const DailyReportV2EventSchema = z.object({
  event_type: z.string(),
  id: z.string().nullish(),
  effective_at: z.string(),
  created_at: z.string(),
  source_id: z.string().nullish(),
  display_name: z.string().nullish(),
  display_description: z.string().nullish(),
  time_display: z.string().nullish(),
  event_kind: z.string().nullish(),
  activity_type: z.string().nullish(),
  hero_primary: z.string().nullish(),
  money_delta: z.number().nullish(),
  status: z.enum(["atomic_ok", "needs_action", "balance_settled"]).nullish(),
  context_line: z.string().nullish(),
  notes: z.array(ActivityNoteSchema).nullish(),
  label: z.string().nullish(),
  label_short: z.string().nullish(),
  is_balanced: z.boolean().nullish(),
  action_lines: z.array(z.string()).nullish(),
  status_mode: z.enum(["atomic", "settlement"]).nullish(),
  is_ok: z.boolean().nullish(),
  is_atomic_ok: z.boolean().nullish(),
  status_badge: z.enum(["OK", "Balance settled"]).nullish(),
  action_pills: z.array(Level3ActionSchema).nullish(),
  remaining_actions: z.array(Level3ActionSchema).nullish(),
  has_other_outstanding_cylinders: z.boolean().nullish(),
  has_other_outstanding_cash: z.boolean().nullish(),
  counterparty: Level3CounterpartySchema.nullish(),
  counterparty_display: z.string().nullish(),
  system: Level3SystemSchema.nullish(),
  hero: Level3HeroSchema.nullish(),
  hero_text: z.string().nullish(),
  money: Level3MoneySchema.nullish(),
  money_amount: z.number().nullish(),
  money_direction: z.enum(["in", "out", "none"]).nullish(),
  money_received: z.number().nullish(),
  settlement: Level3SettlementSchema.nullish(),
  open_actions: z.array(Level3ActionSchema).nullish(),
  order_mode: OrderModeSchema.nullish(),
  gas_type: GasTypeSchema.nullish(),
  customer_id: z.string().nullish(),
  customer_name: z.string().nullish(),
  customer_description: z.string().nullish(),
  system_name: z.string().nullish(),
  system_type: z.string().nullish(),
  expense_type: z.string().nullish(),
  reason: z.string().nullish(),
  note: z.string().nullish(),
  buy12: z.number().nullish(),
  return12: z.number().nullish(),
  buy48: z.number().nullish(),
  return48: z.number().nullish(),
  paid_buy12: z.number().nullish(),
  paid_buy48: z.number().nullish(),
  total_cost: z.number().nullish(),
  paid_now: z.number().nullish(),
  order_total: z.number().nullish(),
  order_paid: z.number().nullish(),
  order_installed: z.number().nullish(),
  order_received: z.number().nullish(),
  unit_price_buy_12: z.number().nullish(),
  unit_price_buy_48: z.number().nullish(),
  cash_before: z.number(),
  cash_after: z.number(),
  bank_before: z.number().nullish(),
  bank_after: z.number().nullish(),
  customer_money_before: z.number().nullish(),
  customer_money_after: z.number().nullish(),
  customer_12kg_before: z.number().nullish(),
  customer_12kg_after: z.number().nullish(),
  customer_48kg_before: z.number().nullish(),
  customer_48kg_after: z.number().nullish(),
  company_before: z.number().nullish(),
  company_after: z.number().nullish(),
  company_12kg_before: z.number().nullish(),
  company_12kg_after: z.number().nullish(),
  company_48kg_before: z.number().nullish(),
  company_48kg_after: z.number().nullish(),
  inventory_before: ReportInventoryStateSchema.nullish(),
  inventory_after: ReportInventoryStateSchema.nullish(),
  balance_transitions: z.array(BalanceTransitionSchema).nullish(),
});
export type DailyReportV2Event = z.infer<typeof DailyReportV2EventSchema>;

export const DailyReportV2DaySchema = z.object({
  date: z.string(),
  cash_start: z.number(),
  cash_end: z.number(),
  company_start: z.number().optional(),
  company_end: z.number().optional(),
  company_12kg_start: z.number().optional(),
  company_12kg_end: z.number().optional(),
  company_48kg_start: z.number().optional(),
  company_48kg_end: z.number().optional(),
  company_give_start: z.number().optional(),
  company_give_end: z.number().optional(),
  company_receive_start: z.number().optional(),
  company_receive_end: z.number().optional(),
  company_12kg_give_start: z.number().optional(),
  company_12kg_give_end: z.number().optional(),
  company_12kg_receive_start: z.number().optional(),
  company_12kg_receive_end: z.number().optional(),
  company_48kg_give_start: z.number().optional(),
  company_48kg_give_end: z.number().optional(),
  company_48kg_receive_start: z.number().optional(),
  company_48kg_receive_end: z.number().optional(),
  inventory_start: ReportInventoryTotalsSchema,
  inventory_end: ReportInventoryTotalsSchema,
  recalculated: z.boolean().optional(),
  audit_summary: DailyAuditSummarySchema,
  events: z.array(DailyReportV2EventSchema),
});
export type DailyReportV2Day = z.infer<typeof DailyReportV2DaySchema>;

export const WhatsappLinkSchema = z.object({
  url: z.string(),
});
export type WhatsappLink = z.infer<typeof WhatsappLinkSchema>;
