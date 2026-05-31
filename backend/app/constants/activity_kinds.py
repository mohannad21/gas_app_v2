REPLACEMENT = "replacement"
SELL_FULL = "sell_full"
BUY_EMPTY_FROM_CUSTOMER = "buy_empty_from_customer"
PAYMENT_FROM_CUSTOMER = "payment_from_customer"
PAYMENT_TO_CUSTOMER = "payment_to_customer"
CUSTOMER_RETURN_EMPTIES = "customer_return_empties"
ADJUST_CUSTOMER_BALANCE = "adjust_customer_balance"
REFILL = "refill"
DIST_RETURN_EMPTIES = "dist_return_empties"
BUY_FULL_FROM_COMPANY = "buy_full_from_company"
PAYMENT_TO_COMPANY = "payment_to_company"
PAYMENT_FROM_COMPANY = "payment_from_company"
ADJUST_COMPANY_BALANCE = "adjust_company_balance"
ADJUST_INVENTORY = "adjust_inventory"
ADJUST_WALLET = "adjust_wallet"
EXPENSE = "expense"
BANK_TO_WALLET = "bank_to_wallet"
WALLET_TO_BANK = "wallet_to_bank"

ALL_KINDS: frozenset[str] = frozenset({
  REPLACEMENT,
  SELL_FULL,
  BUY_EMPTY_FROM_CUSTOMER,
  PAYMENT_FROM_CUSTOMER,
  PAYMENT_TO_CUSTOMER,
  CUSTOMER_RETURN_EMPTIES,
  ADJUST_CUSTOMER_BALANCE,
  REFILL,
  DIST_RETURN_EMPTIES,
  BUY_FULL_FROM_COMPANY,
  PAYMENT_TO_COMPANY,
  PAYMENT_FROM_COMPANY,
  ADJUST_COMPANY_BALANCE,
  ADJUST_INVENTORY,
  ADJUST_WALLET,
  EXPENSE,
  BANK_TO_WALLET,
  WALLET_TO_BANK,
})
