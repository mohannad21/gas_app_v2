import type { BalanceTransition } from "@/types/domain";

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

export type BalanceTransitionTone = "debt" | "credit" | "settled" | "neutral";

export type FormattedBalanceTransitionLine = {
  text: string;
  tone: BalanceTransitionTone;
};

const defaultFormatMoney: FormatMoney = (value) => String(Number(value || 0));

function formatMoneyValue(value: number, formatMoney: FormatMoney) {
  return `EUR ${formatMoney(Math.abs(value))}`;
}

function getGasLabel(component: BalanceComponent) {
  return component === "cyl_12" ? "12kg" : "48kg";
}

function formatCylinderValue(_scope: BalanceScope, component: BalanceComponent, value: number) {
  const gasLabel = component === "cyl_12" ? "12kg" : "48kg";
  const qty = Math.abs(Number(value || 0));
  const numeric = Number(value || 0);
  const singularUnit = numeric >= 0 ? "empty" : "full";
  const pluralUnit = numeric >= 0 ? "empties" : "fulls";
  return `${qty}x${gasLabel} ${qty === 1 ? singularUnit : pluralUnit}`;
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

function buildDirectionLabel(
  scope: BalanceScope,
  component: BalanceComponent,
  amount: number,
  phase: "current" | "still" | "now" = "current"
) {
  const positive = Number(amount || 0) > 0;
  const transitionWord = phase === "still" ? " still" : phase === "now" ? " now" : "";
  if (scope === "customer") {
    if (component === "money") {
      return positive ? `Customer${transitionWord} owes you` : `You${transitionWord} owe customer`;
    }
    return positive ? `Customer${transitionWord} owes you` : `You${transitionWord} owe customer`;
  }
  if (component === "money") {
    return positive ? `You${transitionWord} owe company` : `Company${transitionWord} owes you`;
  }
  return positive ? `You${transitionWord} owe company` : `Company${transitionWord} owes you`;
}

function getBalanceTone(amount: number): BalanceTransitionTone {
  const numeric = Number(amount || 0);
  if (numeric === 0) return "settled";
  return numeric > 0 ? "debt" : "credit";
}

function getSettledLabel(component: BalanceComponent) {
  if (component === "money") return "Money settled";
  return `${getGasLabel(component)} settled`;
}

function formatPreviousValue(
  _scope: BalanceScope,
  component: BalanceComponent,
  value: number,
  formatMoney: FormatMoney
) {
  if (component === "money") {
    return formatMoneyValue(value, formatMoney);
  }
  return String(Math.abs(Number(value || 0)));
}

function prefixWithDisplayName(line: string, transition: TransitionInput, includeDisplayName?: boolean) {
  if (!includeDisplayName) return line;
  const label = transition.display_name ?? transition.display_description ?? null;
  return label ? `${label}: ${line}` : line;
}

function prefixLine(
  line: FormattedBalanceTransitionLine,
  transition: TransitionInput,
  includeDisplayName?: boolean
): FormattedBalanceTransitionLine {
  return {
    ...line,
    text: prefixWithDisplayName(line.text, transition, includeDisplayName),
  };
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
  options: SharedOptions & { phase?: "current" | "still" | "now" } = {}
) {
  const numeric = Number(amount || 0);
  if (numeric === 0) return "Settled";
  const formatMoney = options.formatMoney ?? defaultFormatMoney;
  const label = buildDirectionLabel(scope, component, numeric, options.phase);
  const value = formatComponentValue(scope, component, numeric, formatMoney);
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
  return formatBalanceTransitionLines(transitions, options).map((line) => line.text);
}

export function formatBalanceTransitionLines(
  transitions: TransitionInput[] | null | undefined,
  options: TransitionOptions = {}
) {
  if (!Array.isArray(transitions) || transitions.length === 0) return [];

  const mode = options.mode ?? "transition";
  const formatMoney = options.formatMoney ?? defaultFormatMoney;

  return transitions
    .flatMap((transition) => {
      const before = Number(transition.before ?? 0);
      const after = Number(transition.after ?? 0);

      if (mode === "current") {
        if (after === 0 && options.collapseAllSettled) return [];
        return [
          prefixLine(
            {
              text:
                after === 0
                  ? getSettledLabel(transition.component)
                  : formatCurrentBalanceState(transition.scope, transition.component, after, { formatMoney }),
              tone: getBalanceTone(after),
            },
            transition,
            options.includeDisplayName
          ),
        ];
      }

      if (after === 0) {
        if (options.collapseAllSettled) return [];
        return [
          prefixLine(
            {
              text: getSettledLabel(transition.component),
              tone: "settled",
            },
            transition,
            options.includeDisplayName
          ),
        ];
      }

      if (before === 0) {
        return [
          prefixLine(
            {
              text: formatCurrentBalanceState(transition.scope, transition.component, after, {
                formatMoney,
                phase: "now",
              }),
              tone: getBalanceTone(after),
            },
            transition,
            options.includeDisplayName
          ),
        ];
      }

      if (Math.sign(before) === Math.sign(after)) {
        if (before === after) {
          return [
            prefixLine(
              {
                text: formatCurrentBalanceState(transition.scope, transition.component, after, { formatMoney }),
                tone: getBalanceTone(after),
              },
              transition,
              options.includeDisplayName
            ),
          ];
        }

        return [
          prefixLine(
            {
              text: `${formatCurrentBalanceState(transition.scope, transition.component, after, {
                formatMoney,
                phase: "still",
              })} (was ${formatPreviousValue(transition.scope, transition.component, before, formatMoney)})`,
              tone: getBalanceTone(after),
            },
            transition,
            options.includeDisplayName
          ),
        ];
      }

      return [
        prefixLine(
          {
            text: getSettledLabel(transition.component),
            tone: "settled",
          },
          transition,
          options.includeDisplayName
        ),
        prefixLine(
          {
            text: formatCurrentBalanceState(transition.scope, transition.component, after, {
              formatMoney,
              phase: "now",
            }),
            tone: getBalanceTone(after),
          },
          transition,
          options.includeDisplayName
        ),
      ];
    })
    .filter((line): line is FormattedBalanceTransitionLine => Boolean(line?.text));
}
