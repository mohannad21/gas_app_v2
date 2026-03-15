import { z } from "zod";

export const GasTypeSchema = z.enum(["12kg", "48kg"]);
export type GasType = z.infer<typeof GasTypeSchema>;

export const OrderModeSchema = z.enum(["replacement", "sell_iron", "buy_iron"]);
export type OrderMode = z.infer<typeof OrderModeSchema>;

export const ActivityTypeSchema = z.enum(["order", "customer", "price", "system", "inventory"]);
export type ActivityType = z.infer<typeof ActivityTypeSchema>;

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

export const CompanyPaymentSchema = z.object({
  id: z.string(),
  happened_at: z.string(),
  amount: z.number(),
  note: z.string().nullish(),
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

export const InventoryAdjustmentSchema = z
  .object({
    id: z.string(),
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
  })
  .passthrough();
export type Order = z.infer<typeof OrderSchema>;

export const OrderCreateInputSchema = z.object({
  customer_id: z.string(),
  system_id: z.string(),
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

export const WhatsappLinkSchema = z.object({
  url: z.string(),
});
export type WhatsappLink = z.infer<typeof WhatsappLinkSchema>;

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

export const DailyReportV2CardSchema = z.object({
  date: z.string(),
  cash_start: z.number(),
  cash_end: z.number(),
  sold_12kg: z.number(),
  sold_48kg: z.number(),
  net_today: z.number(),
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

export const DailyAuditSummarySchema = z.object({
  cash_in: z.number(),
  new_debt: z.number(),
  inv_delta_12: z.number(),
  inv_delta_48: z.number(),
});
export type DailyAuditSummary = z.infer<typeof DailyAuditSummarySchema>;

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

export const InventoryRefillDetailsSchema = z.object({
  refill_id: z.string(),
  business_date: z.string(),
  time_of_day: z.enum(["morning", "evening"]).optional(),
  effective_at: z.string(),
  buy12: z.number(),
  return12: z.number(),
  buy48: z.number(),
  return48: z.number(),
  paid_buy12: z.number().optional(),
  paid_buy48: z.number().optional(),
  total_cost: z.number(),
  paid_now: z.number(),
  new12: z.number().optional(),
  new48: z.number().optional(),
  debt_cash: z.number().optional().default(0),
  debt_cylinders_12: z.number().optional().default(0),
  debt_cylinders_48: z.number().optional().default(0),
  notes: z.string().nullish(),
  unit_price_buy_12: z.number().nullish(),
  unit_price_buy_48: z.number().nullish(),
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

export const PriceSettingSchema = z
  .object({
    id: z.string(),
    gas_type: GasTypeSchema,
    selling_price: z.number(),
    buying_price: z.number().optional().nullable(),
    selling_iron_price: z.number().optional().nullable(),
    buying_iron_price: z.number().optional().nullable(),
    effective_from: z.string(),
    created_at: z.string().optional(),
  })
  .passthrough();
export type PriceSetting = z.infer<typeof PriceSettingSchema>;

export const ExpenseSchema = z
  .object({
    id: z.string(),
    date: z.string(),
    expense_type: z.string(),
    amount: z.number(),
    note: z.string().nullish(),
    created_at: z.string().optional(),
    created_by: z.string().nullish(),
  })
  .passthrough();
export type Expense = z.infer<typeof ExpenseSchema>;

export const ExpenseCreateInputSchema = z.object({
  date: z.string(),
  expense_type: z.string(),
  amount: z.number(),
  note: z.string().nullish().optional(),
  created_by: z.string().nullish().optional(),
  happened_at: z.string().optional(),
});
export type ExpenseCreateInput = z.infer<typeof ExpenseCreateInputSchema>;

export const BankDepositSchema = z.object({
  id: z.string(),
  happened_at: z.string(),
  amount: z.number(),
  note: z.string().nullish(),
});
export type BankDeposit = z.infer<typeof BankDepositSchema>;

