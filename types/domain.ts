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
    phone: z.string().nullish(),
    notes: z.string().nullish(),
    customer_type: CustomerTypeSchema,
    money_balance: z.number(),
    money_to_receive: z.number().optional(),
    money_to_give: z.number().optional(),
    total_cylinders_delivered_lifetime: z.number(),
    order_count: z.number(),
    cylinder_balance_12kg: z.number(),
    cylinder_to_receive_12kg: z.number().optional(),
    cylinder_to_give_12kg: z.number().optional(),
    cylinder_balance_48kg: z.number(),
    cylinder_to_receive_48kg: z.number().optional(),
    cylinder_to_give_48kg: z.number().optional(),
    created_at: z.string(),
  })
  .passthrough();
export type Customer = z.infer<typeof CustomerSchema>;

export const CustomerCreateInputSchema = z.object({
  name: z.string(),
  phone: z.string().nullish().optional(),
  customer_type: CustomerTypeSchema.optional(),
  notes: z.string().nullish().optional(),
  starting_money: z.number().optional(),
  starting_12kg: z.number().optional(),
  starting_48kg: z.number().optional(),
  starting_reason: z.string().optional(),
});
export type CustomerCreateInput = z.infer<typeof CustomerCreateInputSchema>;

export const CustomerUpdateInputSchema = z.object({
  name: z.string().optional(),
  phone: z.string().nullish().optional(),
  customer_type: CustomerTypeSchema.optional(),
  notes: z.string().nullish().optional(),
});
export type CustomerUpdateInput = z.infer<typeof CustomerUpdateInputSchema>;

export const SystemSettingsSchema = z
  .object({
    id: z.string(),
    is_initialized: z.boolean(),
    created_at: z.string(),
    updated_at: z.string().nullish(),
  })
  .passthrough();
export type SystemSettings = z.infer<typeof SystemSettingsSchema>;

export const SystemInitializeInputSchema = z.object({
  sell_price_12: z.number(),
  sell_price_48: z.number(),
  buy_price_12: z.number().optional(),
  buy_price_48: z.number().optional(),
  full_12: z.number(),
  empty_12: z.number(),
  full_48: z.number(),
  empty_48: z.number(),
  cash_start: z.number(),
  company_payable_money: z.number().optional(),
  company_full_12kg: z.number().optional(),
  company_full_48kg: z.number().optional(),
  company_empty_12kg: z.number().optional(),
  company_empty_48kg: z.number().optional(),
  customer_owe_money: z.number().optional(),
  customer_credit_money: z.number().optional(),
  customer_owe_12kg: z.number().optional(),
  customer_owe_48kg: z.number().optional(),
  customer_credit_12kg: z.number().optional(),
  customer_credit_48kg: z.number().optional(),
});
export type SystemInitializeInput = z.infer<typeof SystemInitializeInputSchema>;

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
    time_of_day: z.enum(["morning", "evening"]),
    effective_at: z.string(),
    buy12: z.number(),
    return12: z.number(),
    buy48: z.number(),
    return48: z.number(),
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
    reason: z.string(),
    is_inventory_neutral: z.boolean(),
    created_at: z.string(),
  })
  .passthrough();
export type CustomerAdjustment = z.infer<typeof CustomerAdjustmentSchema>;

export const CustomerAdjustmentCreateInputSchema = z.object({
  customer_id: z.string(),
  amount_money: z.number().optional(),
  count_12kg: z.number().optional(),
  count_48kg: z.number().optional(),
  reason: z.string().optional(),
  is_inventory_neutral: z.boolean().optional(),
});
export type CustomerAdjustmentCreateInput = z.infer<typeof CustomerAdjustmentCreateInputSchema>;

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

export const SystemCreateInputSchema = z.object({
  customer_id: z.string(),
  name: z.string(),
  location: z.string().nullish().optional(),
  system_type: SystemTypeSchema.optional(),
  gas_type: GasTypeSchema.optional(),
  system_customer_type: CustomerTypeSchema.optional(),
  is_active: z.boolean().optional(),
  require_security_check: z.boolean().optional(),
  security_check_exists: z.boolean().optional(),
  security_check_date: z.string().nullish().optional(),
});
export type SystemCreateInput = z.infer<typeof SystemCreateInputSchema>;

export const SystemUpdateInputSchema = SystemCreateInputSchema.partial();
export type SystemUpdateInput = z.infer<typeof SystemUpdateInputSchema>;

export const OrderSchema = z
  .object({
    id: z.string(),
    customer_id: z.string(),
    system_id: z.string(),
    delivered_at: z.string(),
    created_at: z.string(),
    updated_at: z.string().nullish(),
    gas_type: GasTypeSchema,
    cylinders_installed: z.number(),
    cylinders_received: z.number(),
  price_total: z.number(),
  paid_amount: z.number().optional(),
  money_received: z.number().optional(),
  money_given: z.number().optional(),
  applied_credit: z.number().optional(),
  money_balance_before: z.number().optional(),
  money_balance_after: z.number().optional(),
  cyl_balance_before: z.record(z.string(), z.number()).optional(),
  cyl_balance_after: z.record(z.string(), z.number()).optional(),
  note: z.string().nullish(),
  })
  .passthrough();
export type Order = z.infer<typeof OrderSchema>;

export const OrderCreateInputSchema = z.object({
  customer_id: z.string(),
  system_id: z.string(),
  delivered_at: z.string().optional(),
  gas_type: GasTypeSchema,
  cylinders_installed: z.number(),
  cylinders_received: z.number(),
  price_total: z.number(),
  paid_amount: z.number().optional(),
  money_received: z.number().optional(),
  money_given: z.number().optional(),
  note: z.string().nullish().optional(),
  client_request_id: z.string().optional(),
});
export type OrderCreateInput = z.infer<typeof OrderCreateInputSchema>;

export const OrderUpdateInputSchema = OrderCreateInputSchema.partial();
export type OrderUpdateInput = z.infer<typeof OrderUpdateInputSchema>;

export const CollectionCreateInputSchema = z.object({
  customer_id: z.string(),
  action_type: z.enum(["payment", "return"]),
  amount_money: z.number().optional(),
  qty_12kg: z.number().optional(),
  qty_48kg: z.number().optional(),
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
    action_type: z.enum(["payment", "return"]),
    amount_money: z.number().nullish(),
    qty_12kg: z.number().nullish(),
    qty_48kg: z.number().nullish(),
    cash_before: z.number().nullish(),
    cash_after: z.number().nullish(),
    inv12_full_before: z.number().nullish(),
    inv12_full_after: z.number().nullish(),
    inv12_empty_before: z.number().nullish(),
    inv12_empty_after: z.number().nullish(),
    inv48_full_before: z.number().nullish(),
    inv48_full_after: z.number().nullish(),
    inv48_empty_before: z.number().nullish(),
    inv48_empty_after: z.number().nullish(),
    money_balance_before: z.number().nullish(),
    money_balance_after: z.number().nullish(),
    cyl_balance_before: z.record(z.string(), z.number()).nullish(),
    cyl_balance_after: z.record(z.string(), z.number()).nullish(),
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

export const InventoryDayGasSummarySchema = z.object({
  gas_type: GasTypeSchema,
  business_date: z.string(),
  day_start_full: z.number(),
  day_start_empty: z.number(),
  day_end_full: z.number(),
  day_end_empty: z.number(),
});
export type InventoryDayGasSummary = z.infer<typeof InventoryDayGasSummarySchema>;

export const InventoryDayEventSchema = z.object({
  id: z.string(),
  gas_type: GasTypeSchema,
  effective_at: z.string(),
  created_at: z.string(),
  source_type: z.string(),
  source_id: z.string().nullish(),
  reason: z.string().nullish(),
  delta_full: z.number(),
  delta_empty: z.number(),
  before_full: z.number(),
  before_empty: z.number(),
  after_full: z.number(),
  after_empty: z.number(),
});
export type InventoryDayEvent = z.infer<typeof InventoryDayEventSchema>;

export const InventoryDayResponseSchema = z.object({
  business_date: z.string(),
  business_tz: z.string(),
  summaries: z.array(InventoryDayGasSummarySchema),
  events: z.array(InventoryDayEventSchema),
});
export type InventoryDayResponse = z.infer<typeof InventoryDayResponseSchema>;

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

export const DailyReportV2CardSchema = z.object({
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
  customer_money_receivable: z.number().optional(),
  customer_money_payable: z.number().optional(),
  customer_12kg_receivable: z.number().optional(),
  customer_12kg_payable: z.number().optional(),
  customer_48kg_receivable: z.number().optional(),
  customer_48kg_payable: z.number().optional(),
  inventory_start: ReportInventoryTotalsSchema,
  inventory_end: ReportInventoryTotalsSchema,
  problems: z.array(z.string()).nullish(),
  recalculated: z.boolean().optional(),
});
export type DailyReportV2Card = z.infer<typeof DailyReportV2CardSchema>;

export const DailyReportV2EventSchema = z.object({
  event_type: z.string(),
  effective_at: z.string(),
  created_at: z.string(),
  source_id: z.string().nullish(),
  label: z.string().nullish(),
  gas_type: GasTypeSchema.nullish(),
  customer_id: z.string().nullish(),
  customer_name: z.string().nullish(),
  customer_description: z.string().nullish(),
  system_name: z.string().nullish(),
  system_type: z.string().nullish(),
  expense_type: z.string().nullish(),
  reason: z.string().nullish(),
  buy12: z.number().nullish(),
  return12: z.number().nullish(),
  buy48: z.number().nullish(),
  return48: z.number().nullish(),
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
  company_before: z.number().nullish(),
  company_after: z.number().nullish(),
  company_12kg_before: z.number().nullish(),
  company_12kg_after: z.number().nullish(),
  company_48kg_before: z.number().nullish(),
  company_48kg_after: z.number().nullish(),
  inventory_before: ReportInventoryStateSchema.nullish(),
  inventory_after: ReportInventoryStateSchema.nullish(),
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
  customer_money_receivable: z.number().optional(),
  customer_money_payable: z.number().optional(),
  customer_12kg_receivable: z.number().optional(),
  customer_12kg_payable: z.number().optional(),
  customer_48kg_receivable: z.number().optional(),
  customer_48kg_payable: z.number().optional(),
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
  total_cost: z.number(),
  paid_now: z.number(),
  unit_price_buy_12: z.number().nullish(),
  unit_price_buy_48: z.number().nullish(),
  before_full_12: z.number(),
  before_empty_12: z.number(),
  after_full_12: z.number(),
  after_empty_12: z.number(),
  before_full_48: z.number(),
  before_empty_48: z.number(),
  after_full_48: z.number(),
  after_empty_48: z.number(),
  is_deleted: z.boolean().optional(),
  deleted_at: z.string().nullish(),
});
export type InventoryRefillDetails = z.infer<typeof InventoryRefillDetailsSchema>;

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
});
export type ExpenseCreateInput = z.infer<typeof ExpenseCreateInputSchema>;

export const BankDepositSchema = z.object({
  id: z.string(),
  effective_at: z.string(),
  created_at: z.string().optional(),
  amount: z.number(),
  note: z.string().nullish(),
  date: z.string(),
});
export type BankDeposit = z.infer<typeof BankDepositSchema>;
