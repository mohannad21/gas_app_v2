export type ActivityToggleState = "target" | "zero";
export type ActivityToggleVariant = "payment" | "receive" | "return";
export type ActivityToggleColorRole = "success" | "danger";

export type ActivityToggleSnapshot = {
  state: ActivityToggleState;
  fieldValue: number;
  colorRole: ActivityToggleColorRole;
};

export type ActivityToggleSnap = {
  state: ActivityToggleState;
} | null;

export type ActivityToggleFieldKey =
  | "replacement_cylinders"
  | "replacement_money"
  | "payment_from_customer_money"
  | "payment_to_customer_money"
  | "customer_return_empties_12kg"
  | "customer_return_empties_48kg"
  | "sell_full_money"
  | "buy_empty_from_customer_money"
  | "refill_12kg_return"
  | "refill_48kg_return"
  | "refill_money"
  | "buy_full_from_company_money"
  | "dist_return_empties_12kg"
  | "dist_return_empties_48kg"
  | "payment_from_company_money"
  | "payment_to_company_money";

export const ACTIVITY_TOGGLE_VARIANTS: Record<ActivityToggleFieldKey, ActivityToggleVariant> = {
  replacement_cylinders: "receive",
  replacement_money: "payment",
  payment_from_customer_money: "payment",
  payment_to_customer_money: "payment",
  customer_return_empties_12kg: "return",
  customer_return_empties_48kg: "return",
  sell_full_money: "payment",
  buy_empty_from_customer_money: "payment",
  refill_12kg_return: "return",
  refill_48kg_return: "return",
  refill_money: "payment",
  buy_full_from_company_money: "payment",
  dist_return_empties_12kg: "return",
  dist_return_empties_48kg: "return",
  payment_from_company_money: "receive",
  payment_to_company_money: "payment",
};

export function getActivityToggleVariant(field: ActivityToggleFieldKey): ActivityToggleVariant {
  return ACTIVITY_TOGGLE_VARIANTS[field];
}

export function getActivityToggleSnapshot(
  state: ActivityToggleState,
  target: number
): ActivityToggleSnapshot {
  if (state === "zero") {
    return { state, fieldValue: 0, colorRole: "danger" };
  }

  return { state, fieldValue: target, colorRole: "success" };
}

export function initActivityToggle(target: number): ActivityToggleSnapshot {
  return getActivityToggleSnapshot("target", target);
}

export function applyActivityToggleTap(
  current: ActivityToggleState,
  target: number
): ActivityToggleSnapshot {
  return getActivityToggleSnapshot(current === "target" ? "zero" : "target", target);
}

export function computeActivityToggleSnap(
  fieldValue: number,
  target: number
): ActivityToggleSnap {
  const normalizedFieldValue = Number(fieldValue) || 0;

  if (normalizedFieldValue === target) return { state: "target" };
  if (normalizedFieldValue === 0) return { state: "zero" };
  return null;
}

export function applyActivityToggleTargetChange(params: {
  previousFieldValue: number;
  previousTarget: number;
  nextTarget: number;
  previousState: ActivityToggleState;
}): { state: ActivityToggleState; fieldValue: number } {
  const previousFieldValue = Number(params.previousFieldValue) || 0;

  if (params.previousState === "target" && previousFieldValue === params.previousTarget) {
    return { state: "target", fieldValue: params.nextTarget };
  }

  return {
    state: params.previousState,
    fieldValue: previousFieldValue,
  };
}
