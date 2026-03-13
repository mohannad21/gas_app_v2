import { DEFAULT_CURRENCY_CODE } from "@/constants/currency";

let moneyDecimals = 2;
let currencyCode = DEFAULT_CURRENCY_CODE;

export function setMoneyDecimals(value?: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    moneyDecimals = Math.max(0, Math.trunc(value));
  }
}

export function getMoneyDecimals() {
  return moneyDecimals;
}

export function setCurrencyCode(code?: string) {
  if (typeof code === "string" && code.trim()) {
    currencyCode = code.trim();
  }
}

export function getCurrencyCode() {
  return currencyCode;
}

export function toMinorUnits(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return 0;
  const factor = 10 ** moneyDecimals;
  return Math.round(value * factor);
}

export function fromMinorUnits(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return 0;
  const factor = 10 ** moneyDecimals;
  return value / factor;
}


