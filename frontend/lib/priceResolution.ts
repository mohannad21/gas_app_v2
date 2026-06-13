import type { GasType } from "@/types/common";
import type { PriceSetting } from "@/types/price";

export type PriceValueField =
  | "selling_price"
  | "buying_price"
  | "selling_iron_price"
  | "buying_iron_price"
  | "company_iron_price";

export type PriceResolutionMode =
  | { mode: "latest" }
  | { mode: "effectiveAt"; target: Date };

function parseEffectiveTime(value: string): number | null {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

export function resolvePriceValue(
  prices: readonly PriceSetting[] | undefined,
  gasType: GasType,
  field: PriceValueField,
  resolution: PriceResolutionMode
): number {
  const targetTime = resolution.mode === "effectiveAt" ? resolution.target.getTime() : null;

  if (resolution.mode === "effectiveAt" && Number.isNaN(targetTime)) {
    return 0;
  }

  const matches = (prices ?? []).filter((entry) => {
    if (entry.gas_type !== gasType) return false;
    if (entry[field] === null || entry[field] === undefined) return false;

    if (resolution.mode === "latest") return true;

    const effectiveTime = parseEffectiveTime(entry.effective_from);
    return effectiveTime !== null && effectiveTime <= targetTime!;
  });

  matches.sort((a, b) => {
    const aTime = parseEffectiveTime(a.effective_from) ?? Number.NEGATIVE_INFINITY;
    const bTime = parseEffectiveTime(b.effective_from) ?? Number.NEGATIVE_INFINITY;
    return bTime - aTime;
  });

  const value = matches[0]?.[field];
  return typeof value === "number" ? value : 0;
}
