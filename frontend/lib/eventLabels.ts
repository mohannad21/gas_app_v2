// Single source of truth for all event type display labels.
// Update here to change a name everywhere in the app simultaneously.

export const EVENT_LABELS = {
  // Customer activities
  ORDER_REPLACEMENT: "Replacement",
  ORDER_SELL_FULL: "Sold full",
  ORDER_BUY_EMPTY: "Bought empty",
  COLLECTION_MONEY: "Customer paid",
  COLLECTION_PAYOUT: "Paid customer",
  COLLECTION_EMPTY: "Returned empties",
  CUSTOMER_ADJUSTMENT: "Balance adjustment",

  // Company activities
  REFILL: "Refill",
  COMPANY_PAYMENT_OUT: "Paid company",
  COMPANY_PAYMENT_IN: "Company paid",
  COMPANY_BUY_FULL: "Bought full",
  COMPANY_RETURN: "Returned empties",
  COMPANY_ADJUSTMENT: "Balance adjustment",

  // Money activities
  EXPENSE: "Expense",
  WALLET_TO_BANK: "Wallet to bank",
  BANK_TO_WALLET: "Bank to wallet",

  // Ledger
  INVENTORY_ADJUSTMENT: "Inventory adjustment",
  WALLET_ADJUSTMENT: "Wallet adjustment",

  // Other
  OPENING_BALANCE: "Opening balance",
} as const;
