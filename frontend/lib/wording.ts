export const PAYMENT_DIRECTION_WORDING = {
  settled: "Settled",
  customer: {
    owesYou: (value: string) => `Customer owes you ${value}`,
    youOwe: (value: string) => `You owe customer ${value}`,
    paymentFrom: "Payment from customer",
    paymentTo: "Payment to customer",
  },
  company: {
    youOwe: (value: string) => `You owe company ${value}`,
    owesYou: (value: string) => `Company owes you ${value}`,
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

export function getBalanceDirectionLabel(scope: "customer" | "company", amount: number) {
  if (scope === "customer") {
    return amount > 0 ? "Customer owes you" : "You owe customer";
  }
  return amount > 0 ? "You owe company" : "Company owes you";
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
