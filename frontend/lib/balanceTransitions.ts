import type { BalanceTransition } from "@/types/domain";
import { getBalanceDirectionLabel, PAYMENT_DIRECTION_WORDING } from "@/lib/wording";

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
};

type TransitionInput = Partial<BalanceTransition> & {
  scope: BalanceScope;
  component: BalanceComponent;
  before: number;
  after: number;
};

const defaultFormatMoney: FormatMoney = (value) => String(Number(value || 0));

function formatMoneyValue(value: number, formatMoney: FormatMoney) {
  return `EUR ${formatMoney(Math.abs(value))}`;
}

function formatCylinderValue(component: BalanceComponent, value: number) {
  const gasLabel = component === "cyl_12" ? "12kg" : "48kg";
  const qty = Math.abs(Number(value || 0));
  return `${qty}x${gasLabel} ${qty === 1 ? "empty" : "empties"}`;
}

function formatComponentValue(component: BalanceComponent, value: number, formatMoney: FormatMoney) {
  if (component === "money") {
    return formatMoneyValue(value, formatMoney);
  }
  return formatCylinderValue(component, value);
}

function buildDirectionLabel(scope: BalanceScope, component: BalanceComponent, amount: number) {
  return getBalanceDirectionLabel(scope, Number(amount || 0));
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
  const label = buildDirectionLabel(scope, component, numeric);
  const value = formatComponentValue(component, numeric, formatMoney);
  return `${label} ${value}`;
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

  return transitions
    .map((transition) => {
      const before = Number(transition.before ?? 0);
      const after = Number(transition.after ?? 0);

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
          : formatComponentValue(transition.component, before, formatMoney);
      return prefixWithDisplayName(`${current} (was ${previous})`, transition, options.includeDisplayName);
    })
    .filter((line): line is string => Boolean(line));
}
