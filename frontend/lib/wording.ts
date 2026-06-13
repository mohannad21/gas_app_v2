export const PAYMENT_DIRECTION_WORDING = {
  settled: "Settled",
  buttons: {
    receive: "Receive",
    pay: "Pay",
  },
  customer: {
    owesYou: (value: string) => `Debts on customer ${value}`,
    youOwe: (value: string) => `Credit for customer ${value}`,
    paymentFrom: "Payment from customer",
    paymentTo: "Payment to customer",
  },
  company: {
    youOwe: (value: string) => `Debts on distributor ${value}`,
    owesYou: (value: string) => `Credit for distributor ${value}`,
    paymentTo: "Payment to company",
    paymentFrom: "Payment from company",
  },
  reportShort: {
    paymentFromCustomer: "From Customer",
    paymentToCustomer: "To Customer",
    paymentToCompany: "To Company",
    paymentFromCompany: "From Company",
    companyPayment: "Company Payment",
  },
} as const;

export function getBalanceDirectionLabel(
  scope: "customer" | "company",
  amount: number,
  component: "money" | "cyl_12" | "cyl_48" = "money"
) {
  if (scope === "customer") {
    return amount > 0 ? "Debts on customer" : "Credit for customer";
  }
  if (component === "money") {
    return amount > 0 ? "Debts on distributor" : "Credit for distributor";
  }
  return amount > 0 ? "Credit for distributor" : "Debts on distributor";
}

export const CUSTOMER_WORDING = {
  cylinders: "Cylinders",
  money: "Money",
  installed: "Installed",
  received: "Received",
  total: "Total",
  paid: "Paid",
  returned: "Returned",
  returnedWithOld: "Returned all",
  didntReturn: "Didn't return",
  paid_: "Paid",
  paidWithDebt: "Paid all",
  didntPay: "Didn't pay",
  returnAll: "Return all",
  payAll: "Pay all",
  didntReceive: "Didn't receive",
  receiveAll: "Receive all",
  notes: "Note (optional)",
  cylinderDebt: (n: number, gas: string) =>
    PAYMENT_DIRECTION_WORDING.customer.owesYou(`${n} ${gas} ${n === 1 ? "empty cylinder" : "empty cylinders"}`),
  cylinderCredit: (n: number, gas: string) =>
    PAYMENT_DIRECTION_WORDING.customer.youOwe(`${n} ${gas} ${n === 1 ? "empty cylinder" : "empty cylinders"}`),
  cylinderSettled: PAYMENT_DIRECTION_WORDING.settled,
  moneyDebt: (n: string) => PAYMENT_DIRECTION_WORDING.customer.owesYou(n),
  moneyCredit: (n: string) => PAYMENT_DIRECTION_WORDING.customer.youOwe(n),
  moneySettled: PAYMENT_DIRECTION_WORDING.settled,
} as const;

export const REPORT_WORDING = {
  actions: {
    delete: "Delete",
    deleted: "Deleted",
  },
  timestamps: {
    createdAt: "Created at",
    effectiveAt: "Effective at",
  },
  hero: {
    system: "System",
    installed: "Installed",
    received: "Received",
    bought: "Bought",
    returned: "Returned",
    returnedEmpties: "Returned empties",
  },
  expanded: {
    noChange: "No change",
    noTopLevelStateChange: "No top-level state change for this activity.",
  },
  ledgerBoxes: {
    full12: "12kg Full",
    empty12: "12kg Empty",
    full48: "48kg Full",
    empty48: "48kg Empty",
    wallet: "Wallet",
  },
  sections: {
    customerBalances: "Customer Balances",
    companyBalances: "Company Balances",
  },
  buttons: {
    adjustBalances: "Adjust balances",
    adjustInventory: "Adjust Inventory",
    adjustWallet: "Adjust Wallet",
  },
  states: {
    unavailable: "Unavailable",
  },
  metrics: {
    net: "Net",
  },
} as const;

export const BALANCE_SUMMARY_WORDING = {
  labels: {
    moneyDebt: "Money debt",
    cyl12Debt: "12kg debt",
    cyl48Debt: "48kg debt",
    moneyCredit: "Money credit",
    cyl12Credit: "12kg credit",
    cyl48Credit: "48kg credit",
  },
  componentLabels: {
    money: "Money balance",
    cyl12: "12kg balance",
    cyl48: "48kg balance",
  },
  units: {
    cylinderShort: "cyl",
    emptyCylinder: "empty cylinder",
    emptyCylinders: "empty cylinders",
    fullCylinder: "full cylinder",
    fullCylinders: "full cylinders",
  },
} as const;

export const LEGACY_BALANCE_NOTE_WORDING = {
  customerStillOwes: (value: string) => `Customer still owes ${value}`,
  paidEarlierToCustomer: (value: string) => `Paid earlier ${value} to customer`,
  paidEarlier: (value: string) => `Paid earlier ${value}`,
  extra: (value: string) => `Extra ${value}`,
  paidEarlierToCompany: (value: string) => `Paid earlier ${value} to company`,
  returnedEarlier: (value: string) => `Returned earlier ${value}`,
  withPrevious: (current: string, previous: string) => `${current} (was ${previous})`,
} as const;

export function getLedgerBoxLabel(gas: "12kg" | "48kg", state: "full" | "empty"): string {
  if (gas === "12kg") {
    return state === "full" ? REPORT_WORDING.ledgerBoxes.full12 : REPORT_WORDING.ledgerBoxes.empty12;
  }
  return state === "full" ? REPORT_WORDING.ledgerBoxes.full48 : REPORT_WORDING.ledgerBoxes.empty48;
}

export function formatCylinderUnitLabel(qty: number, state: "full" | "empty"): string {
  if (state === "full") {
    return qty === 1 ? BALANCE_SUMMARY_WORDING.units.fullCylinder : BALANCE_SUMMARY_WORDING.units.fullCylinders;
  }
  return qty === 1 ? BALANCE_SUMMARY_WORDING.units.emptyCylinder : BALANCE_SUMMARY_WORDING.units.emptyCylinders;
}

export function formatReportTimestampLabel(kind: keyof typeof REPORT_WORDING.timestamps, value: string): string {
  return `${REPORT_WORDING.timestamps[kind]}: ${value}`;
}

export const ACTIVITY_SORT_WORDING = {
  title: "Sort by",
  recommended: "recommended",
  labels: {
    created_desc: "created date (recent on top)",
    created_asc: "created date (recent on bottom)",
    effective_desc: "Effective date (recent on top)",
    effective_asc: "Effective date (recent on bottom)",
  },
} as const;

export const SCREEN_STATE_WORDING = {
  loading: "Loading...",
  loadingActivities: "Loading activities...",
  failedReports: "Failed to load reports.",
  failedActivities: "Failed to load activities.",
  noActivitiesDay: "No activities on this day.",
  noActivitiesFilter: "No matching activities for this filter.",
  noCustomerActivities: "No customer activities yet.",
  noCustomerActivitiesFilter: "No customer activities match these filters.",
  noMoneyActivities: "No money activities yet.",
  noMoneyActivitiesFilter: "No money activities match these filters.",
  failedCustomerActivities: "Could not load customer activities.",
  noActivitiesMatchFilter: "No activities match this filter yet.",
  failedCustomerLoad: "Failed to load customer activities.",
  failedMoneyLoad: "Failed to load money activities.",
  noCompanyActivitiesFilter: "No company activities match these filters.",
  noLedgerActivitiesFilter: "No ledger adjustments match these filters.",
  customerNotFound: "Customer not found.",
} as const;

export const ADD_ENTRY_CTA_WORDING = {
  newCustomerActivity: "+ New Customer Activity",
  newCompanyActivity: "+ New Company Activity",
  addMoneyActivity: "+ Add Money Activity",
  newLedgerAdjustment: "+ New Ledger Adjustment",
} as const;

export const EXPENSE_MODAL_WORDING = {
  title: "Add Expense",
  preset: "Preset",
  custom: "Custom",
  typeLabel: "Type",
  amountLabel: "Amount",
  noteLabel: "Note",
  notePlaceholder: "Optional",
  typePlaceholder: "e.g., toll, parking",
  done: "Done",
  cancel: "Cancel",
  save: "Save",
} as const;
