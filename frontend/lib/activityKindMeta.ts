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

export type PaidBadgeSpec =
  | { mode: "ratio"; direction: "in" | "out" }
  | { mode: "money"; direction: "in" | "out" }
  | { mode: "none" };

export type LedgerBoxSpec =
  | { mode: "selectedGas"; boxes: readonly ("full" | "empty" | "wallet")[] }
  | { mode: "selectedGasEmptyOnly" }
  | { mode: "bothEmpties" }
  | { mode: "bothFullsAndWallet" }
  | { mode: "allGas"; wallet: "whenPresent" | "whenChanged" | "never" }
  | { mode: "walletOnly" }
  | { mode: "none" };

export const ACTIVITY_SUBFILTER_META = {
  "12kg_debt": { label: "12kg — debt" },
  "12kg_credit": { label: "12kg — credit" },
  "48kg_debt": { label: "48kg — debt" },
  "48kg_credit": { label: "48kg — credit" },
  money_debt: { label: "Money — debt" },
  money_credit: { label: "Money — credit" },
  "12kg": { label: "12kg" },
  "48kg": { label: "48kg" },
  money: { label: "Money" },
  "12kg_full": { label: "12kg full" },
  "12kg_empty": { label: "12kg empty" },
  "48kg_full": { label: "48kg full" },
  "48kg_empty": { label: "48kg empty" },
} as const satisfies Record<string, { label: string }>;

export type ActivitySubFilterId = keyof typeof ACTIVITY_SUBFILTER_META;

export type ActivityKindMeta = {
  label: string;
  labelKey: string;
  icon: IconSpec;
  color: string;
  filterGroup: ActivityFilterGroup;
  scope: ActivityScope;
  order: number;
  surfaces: {
    addEntry: boolean;
    dailyReport: boolean;
    customerReview: boolean;
  };
  card: {
    paidBadge: PaidBadgeSpec;
    ledgerBoxes: LedgerBoxSpec;
  };
  subFilters: readonly ActivitySubFilterId[];
};

const CUSTOMER_COLOR = "#0ea5e9";
const COMPANY_COLOR = "#f97316";
const MONEY_COLOR = "#6366f1";
const LEDGER_COLOR = "#64748b";

const REGISTRY = {
  replacement: {
    label: "Replace",
    labelKey: "activities.replacement.label",
    icon: { arrow: "swap-h", symbol: null },
    color: CUSTOMER_COLOR,
    filterGroup: "customer",
    scope: "customer",
    order: 1,
    surfaces: { addEntry: true, dailyReport: true, customerReview: true },
    card: {
      paidBadge: { mode: "ratio", direction: "in" },
      ledgerBoxes: { mode: "selectedGas", boxes: ["full", "empty", "wallet"] as const },
    },
    subFilters: ["12kg_debt", "12kg_credit", "48kg_debt", "48kg_credit", "money_debt", "money_credit"],
  },
  sell_full: {
    label: "Sell full",
    labelKey: "activities.sell_full.label",
    icon: { arrow: "out-h", symbol: "full-cyl" },
    color: CUSTOMER_COLOR,
    filterGroup: "customer",
    scope: "customer",
    order: 5,
    surfaces: { addEntry: true, dailyReport: true, customerReview: true },
    card: {
      paidBadge: { mode: "ratio", direction: "in" },
      ledgerBoxes: { mode: "selectedGas", boxes: ["full", "wallet"] as const },
    },
    subFilters: ["12kg_debt", "12kg_credit", "48kg_debt", "48kg_credit", "money_debt", "money_credit"],
  },
  buy_empty_from_customer: {
    label: "Buy empties",
    labelKey: "activities.buy_empty_from_customer.label",
    icon: { arrow: "in-h", symbol: "empty-cyl" },
    color: CUSTOMER_COLOR,
    filterGroup: "customer",
    scope: "customer",
    order: 6,
    surfaces: { addEntry: true, dailyReport: true, customerReview: true },
    card: {
      paidBadge: { mode: "ratio", direction: "out" },
      ledgerBoxes: { mode: "selectedGas", boxes: ["empty", "wallet"] as const },
    },
    subFilters: ["12kg", "48kg"],
  },
  payment_from_customer: {
    label: "Payment from customer",
    labelKey: "activities.payment_from_customer.label",
    icon: { arrow: "in-h", symbol: "money" },
    color: CUSTOMER_COLOR,
    filterGroup: "customer",
    scope: "customer",
    order: 2,
    surfaces: { addEntry: true, dailyReport: true, customerReview: true },
    card: {
      paidBadge: { mode: "money", direction: "in" },
      ledgerBoxes: { mode: "walletOnly" },
    },
    subFilters: [],
  },
  payment_to_customer: {
    label: "Payment to customer",
    labelKey: "activities.payment_to_customer.label",
    icon: { arrow: "out-h", symbol: "money" },
    color: CUSTOMER_COLOR,
    filterGroup: "customer",
    scope: "customer",
    order: 4,
    surfaces: { addEntry: true, dailyReport: true, customerReview: true },
    card: {
      paidBadge: { mode: "money", direction: "out" },
      ledgerBoxes: { mode: "walletOnly" },
    },
    subFilters: [],
  },
  customer_return_empties: {
    label: "Empties from customer",
    labelKey: "activities.customer_return_empties.label",
    icon: { arrow: "in-h", symbol: "empty-cyl" },
    color: CUSTOMER_COLOR,
    filterGroup: "customer",
    scope: "customer",
    order: 3,
    surfaces: { addEntry: true, dailyReport: true, customerReview: true },
    card: {
      paidBadge: { mode: "none" },
      ledgerBoxes: { mode: "selectedGasEmptyOnly" },
    },
    subFilters: ["12kg", "48kg"],
  },
  adjust_customer_balance: {
    label: "Adjust customer balance",
    labelKey: "activities.adjust_customer_balance.label",
    icon: { arrow: "none", symbol: "edit" },
    color: CUSTOMER_COLOR,
    filterGroup: "customer",
    scope: "customer",
    order: 7,
    surfaces: { addEntry: true, dailyReport: false, customerReview: true },
    card: {
      paidBadge: { mode: "none" },
      ledgerBoxes: { mode: "none" },
    },
    subFilters: ["12kg", "48kg", "money"],
  },
  refill: {
    label: "Refill",
    labelKey: "activities.refill.label",
    icon: { arrow: "swap-v", symbol: null },
    color: COMPANY_COLOR,
    filterGroup: "company",
    scope: "company",
    order: 1,
    surfaces: { addEntry: true, dailyReport: true, customerReview: false },
    card: {
      paidBadge: { mode: "ratio", direction: "out" },
      ledgerBoxes: { mode: "allGas", wallet: "whenPresent" },
    },
    subFilters: ["12kg_debt", "12kg_credit", "48kg_debt", "48kg_credit", "money_debt", "money_credit"],
  },
  dist_return_empties: {
    label: "Empties to company",
    labelKey: "activities.dist_return_empties.label",
    icon: { arrow: "out-v", symbol: "empty-cyl" },
    color: COMPANY_COLOR,
    filterGroup: "company",
    scope: "company",
    order: 3,
    surfaces: { addEntry: true, dailyReport: true, customerReview: false },
    card: {
      paidBadge: { mode: "none" },
      ledgerBoxes: { mode: "bothEmpties" },
    },
    subFilters: ["12kg", "48kg"],
  },
  buy_full_from_company: {
    label: "Buy fulls",
    labelKey: "activities.buy_full_from_company.label",
    icon: { arrow: "in-v", symbol: "full-cyl" },
    color: COMPANY_COLOR,
    filterGroup: "company",
    scope: "company",
    order: 5,
    surfaces: { addEntry: true, dailyReport: true, customerReview: false },
    card: {
      paidBadge: { mode: "ratio", direction: "out" },
      ledgerBoxes: { mode: "bothFullsAndWallet" },
    },
    subFilters: ["money_debt", "money_credit"],
  },
  payment_to_company: {
    label: "Payment to company",
    labelKey: "activities.payment_to_company.label",
    icon: { arrow: "out-v", symbol: "money" },
    color: COMPANY_COLOR,
    filterGroup: "company",
    scope: "company",
    order: 2,
    surfaces: { addEntry: true, dailyReport: true, customerReview: false },
    card: {
      paidBadge: { mode: "money", direction: "out" },
      ledgerBoxes: { mode: "walletOnly" },
    },
    subFilters: [],
  },
  payment_from_company: {
    label: "Payment from company",
    labelKey: "activities.payment_from_company.label",
    icon: { arrow: "in-v", symbol: "money" },
    color: COMPANY_COLOR,
    filterGroup: "company",
    scope: "company",
    order: 4,
    surfaces: { addEntry: true, dailyReport: true, customerReview: false },
    card: {
      paidBadge: { mode: "money", direction: "in" },
      ledgerBoxes: { mode: "walletOnly" },
    },
    subFilters: [],
  },
  adjust_company_balance: {
    label: "Adjust company balance",
    labelKey: "activities.adjust_company_balance.label",
    icon: { arrow: "none", symbol: "edit" },
    color: COMPANY_COLOR,
    filterGroup: "company",
    scope: "company",
    order: 6,
    surfaces: { addEntry: true, dailyReport: false, customerReview: false },
    card: {
      paidBadge: { mode: "none" },
      ledgerBoxes: { mode: "none" },
    },
    subFilters: ["12kg", "48kg", "money"],
  },
  expense: {
    label: "Expense",
    labelKey: "activities.expense.label",
    icon: { arrow: "none", symbol: "receipt" },
    color: MONEY_COLOR,
    filterGroup: "expenses",
    scope: "wallet",
    order: 1,
    surfaces: { addEntry: true, dailyReport: true, customerReview: false },
    card: {
      paidBadge: { mode: "money", direction: "out" },
      ledgerBoxes: { mode: "walletOnly" },
    },
    subFilters: [],
  },
  bank_to_wallet: {
    label: "Bank to wallet",
    labelKey: "activities.bank_to_wallet.label",
    icon: { arrow: "none", symbol: "bank-to-wallet" },
    color: MONEY_COLOR,
    filterGroup: "expenses",
    scope: "wallet",
    order: 2,
    surfaces: { addEntry: true, dailyReport: true, customerReview: false },
    card: {
      paidBadge: { mode: "money", direction: "in" },
      ledgerBoxes: { mode: "walletOnly" },
    },
    subFilters: [],
  },
  wallet_to_bank: {
    label: "Wallet to bank",
    labelKey: "activities.wallet_to_bank.label",
    icon: { arrow: "none", symbol: "wallet-to-bank" },
    color: MONEY_COLOR,
    filterGroup: "expenses",
    scope: "wallet",
    order: 3,
    surfaces: { addEntry: true, dailyReport: true, customerReview: false },
    card: {
      paidBadge: { mode: "money", direction: "out" },
      ledgerBoxes: { mode: "walletOnly" },
    },
    subFilters: [],
  },
  adjust_inventory: {
    label: "Adjust inventory",
    labelKey: "activities.adjust_inventory.label",
    icon: { arrow: "none", symbol: "cube" },
    color: LEDGER_COLOR,
    filterGroup: "ledger",
    scope: "inventory",
    order: 2,
    surfaces: { addEntry: true, dailyReport: true, customerReview: false },
    card: {
      paidBadge: { mode: "none" },
      ledgerBoxes: { mode: "allGas", wallet: "whenChanged" },
    },
    subFilters: ["12kg_full", "12kg_empty", "48kg_full", "48kg_empty"],
  },
  adjust_wallet: {
    label: "Adjust wallet",
    labelKey: "activities.adjust_wallet.label",
    icon: { arrow: "none", symbol: "wallet" },
    color: LEDGER_COLOR,
    filterGroup: "ledger",
    scope: "wallet",
    order: 1,
    surfaces: { addEntry: true, dailyReport: true, customerReview: false },
    card: {
      paidBadge: { mode: "none" },
      ledgerBoxes: { mode: "walletOnly" },
    },
    subFilters: [],
  },
} satisfies Record<string, ActivityKindMeta>;

export type ActivityKind = keyof typeof REGISTRY;
export const ACTIVITY_KIND_META: Record<ActivityKind, ActivityKindMeta> = REGISTRY;
export const ALL_ACTIVITY_KINDS = Object.keys(REGISTRY) as readonly ActivityKind[];

export const FILTER_GROUP_LABELS: Record<"customer" | "company" | "expenses" | "ledger", string> = {
  customer: "Customer",
  company: "Company",
  expenses: "Money",
  ledger: "Ledger",
};

export type ActivitySurface = keyof ActivityKindMeta["surfaces"];

export function isActivityKindVisibleOnSurface(
  kind: ActivityKind,
  surface: ActivitySurface
): boolean {
  return ACTIVITY_KIND_META[kind].surfaces[surface];
}

export function getActivityKindsForSurface(surface: ActivitySurface): ActivityKind[] {
  return ALL_ACTIVITY_KINDS.filter((kind) => isActivityKindVisibleOnSurface(kind, surface));
}

export function getActivityKindsForFilterGroup(
  group: ActivityFilterGroup,
  surface: ActivitySurface = "addEntry"
): ActivityKind[] {
  return ALL_ACTIVITY_KINDS
    .filter((kind) => {
      const meta = ACTIVITY_KIND_META[kind];
      return meta.filterGroup === group && meta.surfaces[surface];
    })
    .sort((left, right) => ACTIVITY_KIND_META[left].order - ACTIVITY_KIND_META[right].order);
}

type NormalizeContext = {
  order_mode?: string;
  money_direction?: string;
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
}): ActivityKind | null {
  return normalizeEventType(event.event_type, {
    order_mode: event.order_mode,
    money_direction: event.money_direction,
  });
}
