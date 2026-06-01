import { ActivityKind } from "./activityKinds";

export type ArrowDirection = "swap-h" | "swap-v" | "in-h" | "out-h" | "in-v" | "out-v" | "none";
export type IconSymbol =
  | "money"
  | "full-cyl"
  | "empty-cyl"
  | "receipt"
  | "wallet"
  | "cube"
  | "edit"
  | "bank-to-wallet"
  | "wallet-to-bank"
  | null;
export type IconSpec = { arrow: ArrowDirection; symbol: IconSymbol };

export type ActivityFilterGroup = "customer" | "company" | "expenses" | "ledger";
export type ActivityScope = "customer" | "company" | "wallet" | "inventory";

export type ActivityKindMeta = {
  label: string;
  labelKey: string;
  icon: IconSpec;
  color: string;
  filterGroup: ActivityFilterGroup;
  scope: ActivityScope;
};

const CUSTOMER_COLOR = "#0ea5e9";
const COMPANY_COLOR = "#f97316";
const MONEY_COLOR = "#6366f1";
const LEDGER_COLOR = "#64748b";

export const ACTIVITY_KIND_META: Record<ActivityKind, ActivityKindMeta> = {
  replacement: {
    label: "Replace",
    labelKey: "activities.replacement.label",
    icon: { arrow: "swap-h", symbol: null },
    color: CUSTOMER_COLOR,
    filterGroup: "customer",
    scope: "customer",
  },
  sell_full: {
    label: "Sell full",
    labelKey: "activities.sell_full.label",
    icon: { arrow: "out-h", symbol: "full-cyl" },
    color: CUSTOMER_COLOR,
    filterGroup: "customer",
    scope: "customer",
  },
  buy_empty_from_customer: {
    label: "Buy empties",
    labelKey: "activities.buy_empty_from_customer.label",
    icon: { arrow: "in-h", symbol: "empty-cyl" },
    color: CUSTOMER_COLOR,
    filterGroup: "customer",
    scope: "customer",
  },
  payment_from_customer: {
    label: "Payment from customer",
    labelKey: "activities.payment_from_customer.label",
    icon: { arrow: "in-h", symbol: "money" },
    color: CUSTOMER_COLOR,
    filterGroup: "customer",
    scope: "customer",
  },
  payment_to_customer: {
    label: "Payment to customer",
    labelKey: "activities.payment_to_customer.label",
    icon: { arrow: "out-h", symbol: "money" },
    color: CUSTOMER_COLOR,
    filterGroup: "customer",
    scope: "customer",
  },
  customer_return_empties: {
    label: "Empties from customer",
    labelKey: "activities.customer_return_empties.label",
    icon: { arrow: "in-h", symbol: "empty-cyl" },
    color: CUSTOMER_COLOR,
    filterGroup: "customer",
    scope: "customer",
  },
  adjust_customer_balance: {
    label: "Adjust customer balance",
    labelKey: "activities.adjust_customer_balance.label",
    icon: { arrow: "none", symbol: "edit" },
    color: CUSTOMER_COLOR,
    filterGroup: "customer",
    scope: "customer",
  },
  refill: {
    label: "Refill",
    labelKey: "activities.refill.label",
    icon: { arrow: "swap-v", symbol: null },
    color: COMPANY_COLOR,
    filterGroup: "company",
    scope: "company",
  },
  dist_return_empties: {
    label: "Empties to company",
    labelKey: "activities.dist_return_empties.label",
    icon: { arrow: "out-v", symbol: "empty-cyl" },
    color: COMPANY_COLOR,
    filterGroup: "company",
    scope: "company",
  },
  buy_full_from_company: {
    label: "Buy fulls",
    labelKey: "activities.buy_full_from_company.label",
    icon: { arrow: "in-v", symbol: "full-cyl" },
    color: COMPANY_COLOR,
    filterGroup: "company",
    scope: "company",
  },
  payment_to_company: {
    label: "Payment to company",
    labelKey: "activities.payment_to_company.label",
    icon: { arrow: "out-v", symbol: "money" },
    color: COMPANY_COLOR,
    filterGroup: "company",
    scope: "company",
  },
  payment_from_company: {
    label: "Payment from company",
    labelKey: "activities.payment_from_company.label",
    icon: { arrow: "in-v", symbol: "money" },
    color: COMPANY_COLOR,
    filterGroup: "company",
    scope: "company",
  },
  adjust_company_balance: {
    label: "Adjust company balance",
    labelKey: "activities.adjust_company_balance.label",
    icon: { arrow: "none", symbol: "edit" },
    color: COMPANY_COLOR,
    filterGroup: "company",
    scope: "company",
  },
  expense: {
    label: "Expense",
    labelKey: "activities.expense.label",
    icon: { arrow: "none", symbol: "receipt" },
    color: MONEY_COLOR,
    filterGroup: "expenses",
    scope: "wallet",
  },
  bank_to_wallet: {
    label: "Bank to wallet",
    labelKey: "activities.bank_to_wallet.label",
    icon: { arrow: "none", symbol: "bank-to-wallet" },
    color: MONEY_COLOR,
    filterGroup: "expenses",
    scope: "wallet",
  },
  wallet_to_bank: {
    label: "Wallet to bank",
    labelKey: "activities.wallet_to_bank.label",
    icon: { arrow: "none", symbol: "wallet-to-bank" },
    color: MONEY_COLOR,
    filterGroup: "expenses",
    scope: "wallet",
  },
  adjust_inventory: {
    label: "Adjust inventory",
    labelKey: "activities.adjust_inventory.label",
    icon: { arrow: "none", symbol: "cube" },
    color: LEDGER_COLOR,
    filterGroup: "ledger",
    scope: "inventory",
  },
  adjust_wallet: {
    label: "Adjust wallet",
    labelKey: "activities.adjust_wallet.label",
    icon: { arrow: "none", symbol: "wallet" },
    color: LEDGER_COLOR,
    filterGroup: "ledger",
    scope: "wallet",
  },
};

type NormalizeContext = {
  order_mode?: string;
  money_direction?: string;
  transfer_direction?: string;
};

export function normalizeEventType(
  raw: string,
  ctx: NormalizeContext = {}
): ActivityKind | null {
  switch (raw) {
    case "replacement":
    case "sell_full":
    case "buy_empty_from_customer":
    case "payment_from_customer":
    case "payment_to_customer":
    case "customer_return_empties":
    case "adjust_customer_balance":
    case "refill":
    case "dist_return_empties":
    case "buy_full_from_company":
    case "payment_to_company":
    case "payment_from_company":
    case "adjust_company_balance":
    case "adjust_inventory":
    case "adjust_wallet":
    case "expense":
    case "bank_to_wallet":
    case "wallet_to_bank":
      return raw as ActivityKind;

    // init aliases — not canonical, return null
    case "init":
    case "init_balance":
    case "init_credit":
    case "init_return":
      return null;

    default:
      return null;
  }
}

export function getReportSubtype(event: {
  event_type: string;
  order_mode?: string;
  money_direction?: string;
  transfer_direction?: string;
}): ActivityKind | null {
  return normalizeEventType(event.event_type, {
    order_mode: event.order_mode,
    money_direction: event.money_direction,
    transfer_direction: event.transfer_direction,
  });
}
