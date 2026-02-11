export type CustomerOrderMode = "replacement" | "sell_iron" | "buy_iron" | "payment" | "return" | "adjust" | string;

export function calcCustomerMoneyDelta(
  mode: CustomerOrderMode | null | undefined,
  total: number,
  paid: number
): number {
  return mode === "buy_iron" ? paid - total : total - paid;
}

export function calcCustomerCylinderDelta(
  mode: CustomerOrderMode | null | undefined,
  installed: number,
  received: number
): number {
  if (mode === "replacement" || mode === "return") {
    return installed - received;
  }
  return 0;
}

export function calcCompanyCylinderLedgerDelta(buy: number, ret: number): number {
  return ret - buy;
}

export function calcCompanyCylinderUiResult(buy: number, ret: number): number {
  return buy - ret;
}

export function calcMoneyUiResult(total: number, paid: number): number {
  return total - paid;
}
