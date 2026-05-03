import type { BalanceTransition } from "@/types/domain";
import { getBalanceDirectionLabel, PAYMENT_DIRECTION_WORDING } from "@/lib/wording";
import { getCurrencySymbol, formatDisplayMoney } from "@/lib/money";

type BalanceScope = BalanceTransition["scope"];
type BalanceComponent = BalanceTransition["component"];

type FormatMoney = (value: number) => string;

type SharedOptions = {
  formatMoney?: FormatMoney;
};

type AggregateOptions = SharedOptions & {
  count?: number;
};

type TransitionOptions = SharedOptions & {
  mode?: "current" | "transition";
  collapseAllSettled?: boolean;
  includeDisplayName?: boolean;
  intent?: string;
  layout?: "compact" | "balance_row";
};

type TransitionInput = Partial<BalanceTransition> & {
  scope: BalanceScope;
  component: BalanceComponent;
  before: number;
  after: number;
};

const defaultFormatMoney: FormatMoney = (value) => formatDisplayMoney(value);

function formatMoneyValue(value: number, formatMoney: FormatMoney) {
  return `${formatMoney(Math.abs(value))} ${getCurrencySymbol()}`;
}

function formatCylinderValue(scope: BalanceScope, component: BalanceComponent, value: number) {
  const gasLabel = component === "cyl_12" ? "12kg" : "48kg";
  const qty = Math.abs(Number(value || 0));
  const unit =
    scope === "customer"
      ? value > 0
        ? qty === 1
          ? "empty cylinder"
          : "empty cylinders"
        : qty === 1
          ? "full cylinder"
          : "full cylinders"
      : value > 0
        ? qty === 1
          ? "full cylinder"
          : "full cylinders"
        : qty === 1
          ? "empty cylinder"
          : "empty cylinders";
  return `${qty}x${gasLabel} ${unit}`;
}

function formatComponentValue(
  scope: BalanceScope,
  component: BalanceComponent,
  value: number,
  formatMoney: FormatMoney
) {
  if (component === "money") {
    return formatMoneyValue(value, formatMoney);
  }
  return formatCylinderValue(scope, component, value);
}

function buildDirectionLabel(scope: BalanceScope, component: BalanceComponent, amount: number) {
  return getBalanceDirectionLabel(scope, Number(amount || 0), component);
}

function getComponentLabel(component: BalanceComponent) {
  if (component === "money") return "Money balance";
  if (component === "cyl_12") return "12kg balance";
  return "48kg balance";
}

function prefixWithDisplayName(line: string, transition: TransitionInput, includeDisplayName?: boolean) {
  if (!includeDisplayName) return line;
  const label = transition.display_name ?? transition.display_description ?? null;
  return label ? `${label}: ${line}` : line;
}

export function makeBalanceTransition(
  scope: BalanceScope,
  component: BalanceComponent,
  before: number,
  after: number,
  extra: Partial<BalanceTransition> = {}
): BalanceTransition {
  return {
    scope,
    component,
    before,
    after,
    display_name: extra.display_name ?? null,
    display_description: extra.display_description ?? null,
    intent: extra.intent ?? null,
  };
}

export function formatCurrentBalanceState(
  scope: BalanceScope,
  component: BalanceComponent,
  amount: number,
  options: SharedOptions = {}
) {
  const numeric = Number(amount || 0);
  if (numeric === 0) return PAYMENT_DIRECTION_WORDING.settled;
  const formatMoney = options.formatMoney ?? defaultFormatMoney;
  if (isDisplayZero(component, numeric, formatMoney)) return PAYMENT_DIRECTION_WORDING.settled;
  const label = buildDirectionLabel(scope, component, numeric);
  const value = formatComponentValue(scope, component, numeric, formatMoney);
  return `${label} ${value}`;
}

function getCompactDirectionLabel(scope: BalanceScope, component: BalanceComponent, value: number): string {
  if (Math.abs(value) < 0.01) return "";
  if (scope === "customer") {
    return value > 0 ? "debts" : "credit";
  }
  if (component === "money") {
    return value > 0 ? "debts" : "credit";
  }
  return value > 0 ? "credit" : "debts";
}

function getScopeLabel(scope: BalanceScope, component: BalanceComponent, afterValue: number): string {
  const dir = getCompactDirectionLabel(scope, component, afterValue);
  const preposition = dir === "credit" ? "for" : "on";
  const entity = scope === "customer" ? "customer" : "distributor";
  return `(${preposition} ${entity})`;
}

function formatCompactAmount(component: BalanceComponent, value: number, formatMoney: FormatMoney): string {
  if (component === "money") {
    return `${formatMoney(Math.abs(value))} ${getCurrencySymbol()}`;
  }
  return String(Math.abs(value));
}

function isDisplayZero(
  component: BalanceComponent,
  value: number,
  formatMoney: FormatMoney
): boolean {
  if (Math.abs(value) < 0.01) return true;
  if (component !== "money") return false;
  const formatted = formatMoney(Math.abs(value));
  return formatted === "0" || formatted === "0.00" || formatted === "0.0";
}

function formatTransitionRow(
  transition: TransitionInput,
  formatMoney: FormatMoney
) : string | null {
  const before = Number(transition.before ?? 0);
  const after = Number(transition.after ?? 0);
  if (isDisplayZero(transition.component, before, formatMoney) &&
      isDisplayZero(transition.component, after, formatMoney)) return null;
  const label = getComponentLabel(transition.component);
  const scope = getScopeLabel(transition.scope, transition.component, after);
  if (Math.abs(before - after) < 0.01) {
    if (isDisplayZero(transition.component, after, formatMoney)) return null;
    const dir = getCompactDirectionLabel(transition.scope, transition.component, after);
    const val = formatCompactAmount(transition.component, after, formatMoney);
    const balancePart = dir ? `${dir} ${val}` : val;
    return `${label}: unchanged — ${balancePart} ${scope}`;
  }
  const dirBefore = getCompactDirectionLabel(transition.scope, transition.component, before);
  const dirAfter = getCompactDirectionLabel(transition.scope, transition.component, after);
  const valBefore = formatCompactAmount(transition.component, before, formatMoney);
  const valAfter = formatCompactAmount(transition.component, after, formatMoney);
  const beforePart = dirBefore ? `${dirBefore} ${valBefore}` : valBefore;
  if (isDisplayZero(transition.component, before, formatMoney)) {
    const afterPart = dirAfter ? `${valAfter} ${dirAfter}` : valAfter;
    return `${label}: Settled → ${afterPart} ${scope}`;
  }
  if (isDisplayZero(transition.component, after, formatMoney)) {
    return `${label}: ${beforePart} → Settled`;
  }
  const afterPart = dirAfter ? `${valAfter} ${dirAfter}` : valAfter;
  return `${label}: ${beforePart} → ${afterPart} ${scope}`;
}

export function formatAggregateBalanceState(
  scope: BalanceScope,
  component: BalanceComponent,
  amount: number,
  options: AggregateOptions = {}
) {
  const base = formatCurrentBalanceState(scope, component, amount, options);
  const count = Number(options.count ?? 0);
  if (count <= 0) return base;
  const subject = count === 1 ? "customer" : "customers";
  return `${base} across ${count} ${subject}`;
}

export function formatBalanceTransitions(
  transitions: TransitionInput[] | null | undefined,
  options: TransitionOptions = {}
) {
  if (!Array.isArray(transitions) || transitions.length === 0) return [];

  const mode = options.mode ?? "transition";
  const formatMoney = options.formatMoney ?? defaultFormatMoney;
  const layout = options.layout ?? "compact";

  return transitions
    .map((transition) => {
      const before = Number(transition.before ?? 0);
      const after = Number(transition.after ?? 0);

      if (layout === "balance_row") {
        if (mode === "current") {
          if (after === 0 && options.collapseAllSettled) return null;
          const line = `${getComponentLabel(transition.component)}: ${formatCurrentBalanceState(
            transition.scope,
            transition.component,
            after,
            { formatMoney }
          )}`;
          return prefixWithDisplayName(line, transition, options.includeDisplayName);
        }
        const row = formatTransitionRow(transition, formatMoney);
        if (!row) return null;
        return prefixWithDisplayName(row, transition, options.includeDisplayName);
      }

      if (mode === "current") {
        if (after === 0 && options.collapseAllSettled) return null;
        return prefixWithDisplayName(
          formatCurrentBalanceState(transition.scope, transition.component, after, { formatMoney }),
          transition,
          options.includeDisplayName
        );
      }

      if (after === 0) {
        if (options.collapseAllSettled) return null;
        return prefixWithDisplayName(PAYMENT_DIRECTION_WORDING.settled, transition, options.includeDisplayName);
      }

      const current = formatCurrentBalanceState(transition.scope, transition.component, after, { formatMoney });
      if (before === after || before === 0) {
        return prefixWithDisplayName(current, transition, options.includeDisplayName);
      }

      const previous =
        Math.sign(before) !== Math.sign(after)
          ? formatCurrentBalanceState(transition.scope, transition.component, before, { formatMoney })
          : formatComponentValue(transition.scope, transition.component, before, formatMoney);
      return prefixWithDisplayName(`${current} (was ${previous})`, transition, options.includeDisplayName);
    })
    .filter((line): line is string => Boolean(line));
}

export type TransitionPillIntent = "good" | "bad" | "neutral";

export type TransitionPill = {
  text: string;
  intent: TransitionPillIntent;
};

export function formatTransitionPills(
  transitions: TransitionInput[] | null | undefined,
  options: { formatMoney?: FormatMoney } = {}
): TransitionPill[] {
  if (!Array.isArray(transitions) || transitions.length === 0) return [];
  const formatMoney = options.formatMoney ?? defaultFormatMoney;
  const result: TransitionPill[] = [];
  for (const transition of transitions) {
    const text = formatTransitionRow(transition, formatMoney);
    if (!text) continue;
    const before = Number(transition.before ?? 0);
    const after = Number(transition.after ?? 0);
    let intent: TransitionPillIntent;
    const beforeAbs = Math.abs(Number(transition.before ?? 0));
    const afterAbs = Math.abs(Number(transition.after ?? 0));
    if (Math.abs(beforeAbs - afterAbs) < 0.01) {
      intent = "neutral";
    } else if (transition.scope === "company" && (transition.component === "cyl_12" || transition.component === "cyl_48")) {
      intent = after > before ? "good" : "bad";
    } else {
      intent = afterAbs < beforeAbs ? "good" : "bad";
    }
    result.push({ text, intent });
  }
  return result;
}
