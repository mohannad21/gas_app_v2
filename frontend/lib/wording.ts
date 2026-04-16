export const PAYMENT_DIRECTION_WORDING = {
  settled: "Settled",
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
