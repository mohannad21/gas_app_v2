import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";

import { Level3Tokens } from "@/constants/level3";
import { FontFamilies, FontSizes } from "@/constants/typography";
import { formatTransitionPills, type TransitionPill } from "@/lib/balanceTransitions";
import { formatDateTimeYMDHM } from "@/lib/date";
import { getCurrencySymbol } from "@/lib/money";
import { EVENT_LABELS } from "@/lib/eventLabels";
import { getEventColor } from "@/lib/reports/eventColors";
import { formatEventType } from "@/lib/reports/utils";
import type { ActivityKind } from "@/lib/activityKinds";
import { ACTIVITY_KIND_META, normalizeEventType } from "@/lib/activityKindMeta";
import { t } from "@/lib/i18n/translations";
import { DailyReportEvent } from "@/types/domain";
import ActivityIcon from "@/components/reports/ActivityIcon";

type ActivityTone = "customer" | "company" | "money" | "ledger";

type SlimActivityRowProps = {
  event: DailyReportEvent;
  formatMoney?: (value: number) => string;
  onDelete?: () => void;
  isDeleted?: boolean;
  showCreatedAt?: boolean;
  showEffectiveAtBottom?: boolean;
  highlight?: boolean;
};

const toDateOnly = (value?: string | null) => (value ? value.slice(0, 10) : "");

const formatMoneyValue = (amount: number, formatMoney: (v: number) => string) =>
  `${formatMoney(amount)} ${getCurrencySymbol()}`;

const takeNonZeroNumber = (...values: Array<number | null | undefined>) => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
      return value;
    }
  }
  return null;
};

const parseBankTransferAmountFromText = (value: string | null | undefined) => {
  if (!value) return null;
  const cleaned = String(value).replace(/,/g, "");
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

// Fallback-only adapter for older payloads that still send note objects instead of balance transitions.
const buildLegacyNoteText = (note: any, formatMoney: (v: number) => string) => {
  if (!note) return null;
  const after = Number(note.remaining_after ?? 0);
  if (!after) return null;
  const before = Number(note.remaining_before ?? 0);
  const withBefore = Number.isFinite(before) && before > 0;

  if (note.kind === "money") {
    const amountText = formatMoneyValue(after, formatMoney);
    if (note.direction === "customer_pays_you") {
      return `Customer still owes ${amountText}`;
    }
    if (note.direction === "you_pay_customer") {
      return withBefore
        ? `Credit for customer ${amountText} (was ${formatMoneyValue(before, formatMoney)})`
        : `Credit for customer ${amountText}`;
    }
    if (note.direction === "you_paid_customer_earlier") {
      return `Paid earlier ${amountText} to customer`;
    }
    if (note.direction === "customer_paid_earlier") {
      return `Paid earlier ${amountText}`;
    }
    if (note.direction === "customer_extra_paid") {
      return `Extra ${amountText}`;
    }
    if (note.direction === "you_pay_company") {
      return withBefore
        ? `Debts on distributor ${amountText} (was ${formatMoneyValue(before, formatMoney)})`
        : `Debts on distributor ${amountText}`;
    }
    if (note.direction === "you_paid_earlier") {
      return `Paid earlier ${amountText} to company`;
    }
    if (note.direction === "company_pays_you") {
      return `Credit for distributor ${amountText}`;
    }
  }

  const formatCyl = (qty: number, gas: string, unit: "empty" | "full") =>
    `${qty}x${gas} ${qty === 1 ? `${unit} cylinder` : `${unit} cylinders`}`;

  if (note.kind === "cyl_12" || note.kind === "cyl_48") {
    const gas = note.kind === "cyl_12" ? "12kg" : "48kg";
    const qtyText = formatCyl(after, gas, "empty");
    if (note.direction === "customer_returns_you") {
      return withBefore ? `Debts on customer ${qtyText} (was ${formatCyl(before, gas, "empty")})` : `Debts on customer ${qtyText}`;
    }
    if (note.direction === "you_return_company") {
      return withBefore ? `Debts on distributor ${qtyText} (was ${formatCyl(before, gas, "empty")})` : `Debts on distributor ${qtyText}`;
    }
    if (note.direction === "you_returned_earlier") {
      return `Returned earlier ${qtyText}`;
    }
  }

  if (note.kind === "cyl_full_12" || note.kind === "cyl_full_48") {
    const gas = note.kind === "cyl_full_12" ? "12kg" : "48kg";
    const qtyText = formatCyl(after, gas, "full");
    if (note.direction === "you_deliver_customer") {
      return withBefore ? `Credit for customer ${qtyText} (was ${formatCyl(before, gas, "full")})` : `Credit for customer ${qtyText}`;
    }
    if (note.direction === "company_delivers_you") {
      return withBefore ? `Credit for distributor ${qtyText} (was ${formatCyl(before, gas, "full")})` : `Credit for distributor ${qtyText}`;
    }
  }

  return null;
};

const _ORDER_KINDS = new Set<ActivityKind>(["replacement", "sell_full", "buy_empty_from_customer"]);
const _isOrderKind = (et: string) => {
  const k = normalizeEventType(et);
  return k !== null && _ORDER_KINDS.has(k);
};
const _isCollectionMoney = (et: string) => normalizeEventType(et) === "payment_from_customer";
const _isCollectionEmpty = (et: string) => normalizeEventType(et) === "customer_return_empties";
const _isCompanyPayment = (et: string) => {
  const k = normalizeEventType(et);
  return k === "payment_to_company" || k === "payment_from_company";
};
const _isCompanyBuyFull = (et: string) => normalizeEventType(et) === "buy_full_from_company";
const _isDistReturn = (et: string) => normalizeEventType(et) === "dist_return_empties";
const _isWalletAdjust = (et: string) => normalizeEventType(et) === "adjust_wallet";
const _isInventoryAdjust = (et: string) => normalizeEventType(et) === "adjust_inventory";

const toneForMeta = (meta: (typeof ACTIVITY_KIND_META)[keyof typeof ACTIVITY_KIND_META] | null): ActivityTone => {
  if (!meta) return "ledger";
  if (meta.filterGroup === "customer") return "customer";
  if (meta.filterGroup === "company") return "company";
  if (meta.filterGroup === "expenses") return "money";
  return "ledger";
};

const formatGasSummary = (qty12?: number | null, qty48?: number | null) => {
  const parts: string[] = [];
  if (qty12 && qty12 !== 0) parts.push(`${qty12}x 12kg`);
  if (qty48 && qty48 !== 0) parts.push(`${qty48}x 48kg`);
  return parts.length > 0 ? parts.join(" | ") : null;
};

const formatOrderMetric = (event: DailyReportEvent) => {
  const lines: string[] = [];
  const _fomKind = normalizeEventType(event.event_type, { order_mode: event.order_mode ?? undefined });
  const isSystemAttached = _fomKind === "replacement" || _fomKind === "sell_full";
  const resolvedSystemName = event.system_name ?? (event as any).system?.display_name ?? null;
  if (resolvedSystemName && isSystemAttached) lines.push(`System: ${resolvedSystemName}`);
  const gas = event.gas_type ? `${event.gas_type}` : "";
  const installed = Number(event.order_installed ?? 0);
  const received = Number(event.order_received ?? 0);
  if (installed > 0) lines.push(`Installed: ${installed}x ${gas}`);
  if (_fomKind !== "sell_full") {
    lines.push(`Received: ${received}x ${gas}`);
  }
  return lines.length > 0 ? lines.join("\n") : null;
};

const buildHeroAction = (event: DailyReportEvent, formatMoney: (v: number) => string) => {
  const _bhKind = normalizeEventType(event.event_type, {
    order_mode: event.order_mode ?? undefined,
  });
  // Order and refill have explicit formatting — always apply it first
  if (_isOrderKind(event.event_type)) {
    return formatOrderMetric(event);
  }
  if (_bhKind === "refill") {
    const bought = formatGasSummary(event.buy12, event.buy48);
    const returned = formatGasSummary(event.return12, event.return48);
    const lines: string[] = [];
    if (bought) lines.push(`Bought: ${bought}`);
    lines.push(`Returned: ${returned ?? `${Number(event.return12 ?? 0)}x 12kg | ${Number(event.return48 ?? 0)}x 48kg`}`);
    return lines.length > 0 ? lines.join("\n") : null;
  }
  if (_isCompanyBuyFull(event.event_type)) {
    const parts: string[] = [];
    if (event.buy12 && event.buy12 !== 0) parts.push(`${event.buy12}x 12kg`);
    if (event.buy48 && event.buy48 !== 0) parts.push(`${event.buy48}x 48kg`);
    return parts.length > 0 ? `Bought: ${parts.join(" | ")}` : null;
  }
  if (event.hero_primary) return event.hero_primary;
  if (event.hero_text) return event.hero_text;
  if (_isCollectionMoney(event.event_type)) {
    const amount = Number(event.money_received ?? event.money?.amount ?? 0);
    return amount ? `Payment from customer ${formatMoneyValue(amount, formatMoney)}` : "Payment from customer";
  }
  if (_bhKind === "payment_to_customer") {
    const amount = Number(event.money_amount ?? event.money?.amount ?? 0);
    return amount ? `Payment to customer ${formatMoneyValue(amount, formatMoney)}` : "Payment to customer";
  }
  if (_isCompanyPayment(event.event_type)) {
    const amount = Number(event.money_amount ?? event.money?.amount ?? 0);
    const direction = event.money_direction === "in" ? "Payment from company" : "Payment to company";
    return amount ? `${direction} ${formatMoneyValue(amount, formatMoney)}` : direction;
  }
  if (_isCollectionEmpty(event.event_type)) {
    const parts = formatGasSummary(event.return12, event.return48);
    return parts ? `Returned ${parts} empties` : "Returned empties";
  }
  if (_bhKind === "expense") {
    return null;
  }
  if (_isWalletAdjust(event.event_type)) {
    return event.reason ?? null;
  }
  if (_isInventoryAdjust(event.event_type)) {
    const gas = event.gas_type ? `${event.gas_type}` : null;
    const note = event.reason ?? null;
    if (gas && note) return `${gas} · ${note}`;
    if (gas) return gas;
    if (note) return note;
    return null;
  }
  if (_bhKind === "bank_to_wallet") return EVENT_LABELS.BANK_TO_WALLET;
  if (_bhKind === "wallet_to_bank") return EVENT_LABELS.WALLET_TO_BANK;
  return null;
};

const splitDisplayName = (value: string | null | undefined) => {
  if (!value) return { name: "", desc: "" };
  const separators = [" — ", " - "];
  for (const sep of separators) {
    const idx = value.indexOf(sep);
    if (idx > 0) {
      return { name: value.slice(0, idx), desc: value.slice(idx + sep.length) };
    }
  }
  return { name: value, desc: "" };
};

const transitionIntentForEvent = (event: DailyReportEvent) => {
  const _tiKind = normalizeEventType(event.event_type, {
    order_mode: event.order_mode ?? undefined,
    money_direction: event.money_direction ?? undefined,
  });
  if (_isOrderKind(event.event_type)) return "customer_order" as const;
  if (_isCollectionMoney(event.event_type)) return "customer_payment" as const;
  if (_tiKind === "payment_to_customer") return "customer_payout" as const;
  if (_isCollectionEmpty(event.event_type)) return "customer_return" as const;
  if (_isDistReturn(event.event_type)) return "company_settle" as const;
  if (_tiKind === "adjust_customer_balance") return "customer_adjust" as const;
  if (_isCompanyPayment(event.event_type)) return "company_payment_txn" as const;
  if (_isCompanyBuyFull(event.event_type)) return "company_buy_full" as const;
  if (_tiKind === "refill") return "company_refill" as const;
  return "generic" as const;
};

const pushEventTransition = (
  transitions: NonNullable<DailyReportEvent["balance_transitions"]>,
  scope: "customer" | "company",
  component: "money" | "cyl_12" | "cyl_48",
  beforeValue: number | null | undefined,
  afterValue: number | null | undefined
) => {
  if (beforeValue == null || afterValue == null) return;
  const before = Number(beforeValue);
  const after = Number(afterValue);
  if (Math.abs(before) < 0.01 && Math.abs(after) < 0.01) return;
  transitions.push({ scope, component, before, after });
};

const buildDisplayTransitions = (event: DailyReportEvent) => {
  if (_isWalletAdjust(event.event_type) || _isInventoryAdjust(event.event_type)) return [];
  const transitions: NonNullable<DailyReportEvent["balance_transitions"]> = [];
  const intent = transitionIntentForEvent(event);
  const isCompanyEvent = intent.startsWith("company_");

  if (isCompanyEvent) {
    pushEventTransition(transitions, "company", "money", event.company_before, event.company_after);
    pushEventTransition(transitions, "company", "cyl_12", event.company_12kg_before, event.company_12kg_after);
    pushEventTransition(transitions, "company", "cyl_48", event.company_48kg_before, event.company_48kg_after);
  } else {
    pushEventTransition(transitions, "customer", "money", event.customer_money_before, event.customer_money_after);
    pushEventTransition(transitions, "customer", "cyl_12", event.customer_12kg_before, event.customer_12kg_after);
    pushEventTransition(transitions, "customer", "cyl_48", event.customer_48kg_before, event.customer_48kg_after);
  }
  return transitions.length > 0 ? transitions : event.balance_transitions ?? [];
};

export default function SlimActivityRow({
  event,
  formatMoney,
  onDelete,
  isDeleted,
  showCreatedAt,
  showEffectiveAtBottom,
  highlight,
}: SlimActivityRowProps) {
  const fmtMoney = formatMoney ?? ((value: number) => String(value));
  const highlightAnim = useRef(new Animated.Value(0)).current;
  const eventType = String(event?.event_type ?? "event");
  const activityKind = normalizeEventType(eventType, {
    order_mode: event?.order_mode ?? undefined,
    money_direction: event?.money_direction ?? undefined,
  });
  const activityMeta = activityKind ? ACTIVITY_KIND_META[activityKind] : null;
  const activityTone = toneForMeta(activityMeta);
  const label = activityMeta
    ? t(activityMeta.labelKey) ?? event?.label ?? formatEventType(eventType, event?.order_mode)
    : event?.label ?? formatEventType(eventType, event?.order_mode);
  const counterparty = event?.counterparty;
  const isCustomer = counterparty?.type === "customer";
  const isCompany = counterparty?.type === "company";

  const headerNameRaw = activityKind === "expense"
      ? (event.expense_type || label)
      : event.display_name
      ? event.display_name
      : isCustomer
        ? (event.customer_name ?? counterparty?.display_name ?? "Customer")
        : isCompany
          ? "Company"
          : label;

  const headerDescBase = event.display_description ?? (isCustomer ? event.customer_description : event.reason);
  const { name: headerName, desc: headerDescFromName } = splitDisplayName(headerNameRaw);
  const headerDesc = headerDescFromName || headerDescBase || "";

  const heroActionBase = buildHeroAction(event, fmtMoney);
  const heroAction =
    heroActionBase && heroActionBase.trim() && heroActionBase !== headerName && heroActionBase !== label
      ? heroActionBase
      : null;
  const bankTransferText = String(
    event.hero_primary ?? event.hero_text ?? event.context_line ?? ""
  );
  const bankTransferDirection =
    activityKind === "bank_to_wallet"
      ? "in"
      : activityKind === "wallet_to_bank"
        ? "out"
        : "none";
  // Bank transfers use canonical event types in T9.
  const _isBankTransfer = activityKind === "bank_to_wallet" || activityKind === "wallet_to_bank";
  const bankTransferAmount =
    _isBankTransfer
      ? Math.abs(
          takeNonZeroNumber(
            typeof event.money_amount === "number" ? event.money_amount : null,
            typeof event.money_delta === "number" ? event.money_delta : null,
            typeof event.total_cost === "number" ? event.total_cost : null,
            typeof event.money?.amount === "number" ? event.money.amount : null,
            parseBankTransferAmountFromText(bankTransferText)
          ) ?? 0
        )
      : 0;
  const moneyAmount =
    _isBankTransfer
      ? bankTransferAmount
      : (_isCollectionMoney(event.event_type) || activityKind === "payment_to_customer")
      ? Number(event.money_amount ?? event.money_delta ?? 0)
      : _isCompanyPayment(event.event_type)
        ? Number(event.money_amount ?? event.money?.amount ?? 0)
        : typeof event?.money_delta === "number"
          ? event.money_delta
          : Number(event?.money_amount ?? 0);
  const moneyDirection =
    _isBankTransfer
      ? (event?.money_direction && event.money_direction !== "none" ? event.money_direction : bankTransferDirection)
      : event?.money_direction ?? event?.money?.verb ?? "none";
  const paymentAmount =
    (activityKind === "refill" || _isCompanyBuyFull(event.event_type))
      ? Number(event.paid_amount ?? 0)
      : Number(event.money_amount ?? event.money_received ?? event.money?.amount ?? 0);
  const paymentTotal =
    activityKind === "refill"
      ? Number(event.total_cost ?? 0)
      : _isOrderKind(event.event_type)
        ? Number(event.order_total ?? 0)
        : (_isCompanyPayment(event.event_type) || _isCompanyBuyFull(event.event_type))
          ? Number(event.total_cost ?? 0)
          : 0;
  const showPaymentRatio =
    (activityKind === "refill" ||
      _isOrderKind(event.event_type) ||
      _isCompanyBuyFull(event.event_type)) &&
    paymentTotal > 0;
  const moneyText =
    !showPaymentRatio && moneyDirection !== "none" && moneyAmount && !_isWalletAdjust(event.event_type)
      ? `${moneyDirection === "in" || moneyDirection === "received" ? "+" : "-"}${formatMoneyValue(
          moneyAmount,
          fmtMoney
        )}`
      : null;
  const ratioMoneyDirection =
    moneyDirection !== "none"
      ? moneyDirection
      : activityKind === "buy_empty_from_customer"
        ? "out"
        : _isOrderKind(event.event_type)
          ? "in"
          : (activityKind === "refill" || _isCompanyBuyFull(event.event_type))
            ? "out"
            : "none";
  const displayContextLine = _isOrderKind(event.event_type)
    ? (
        event.context_line
          ? event.context_line
              .replace(/^Order\b/, label)
              .split("System:")[0]
              .replace(/[·•\s]+$/, "")
          : label
      )
    : label;
  const createdAtLine = showCreatedAt && event.created_at ? `Created at: ${formatDateTimeYMDHM(event.created_at)}` : "";
  const effectiveAtLine =
    showEffectiveAtBottom && event.effective_at ? `Effective at: ${formatDateTimeYMDHM(event.effective_at)}` : "";
  const hasDateMismatch =
    Boolean(createdAtLine && effectiveAtLine) && toDateOnly(event.created_at) !== toDateOnly(event.effective_at);

  const transitionPills: TransitionPill[] = formatTransitionPills(buildDisplayTransitions(event), {
    formatMoney: fmtMoney,
  });
  const notes = transitionPills.length === 0 && Array.isArray(event?.notes) ? event.notes : [];
  const showNotes = transitionPills.length > 0 || notes.length > 0;
  const dotColor = getEventColor(eventType);
  const heroLines = heroAction ? heroAction.split("\n") : [];
  const actionToneStyle =
    activityTone === "customer"
      ? styles.actionTextCustomer
      : activityTone === "company"
        ? styles.actionTextCompany
        : activityTone === "money"
          ? styles.actionTextMoney
          : styles.actionTextLedger;
  const scopedPillStyle =
    activityTone === "customer"
      ? styles.pillCustomer
      : activityTone === "company"
        ? styles.pillCompany
        : activityTone === "money"
          ? styles.pillMoney
          : styles.pillLedger;
  const scopedPillTextStyle =
    activityTone === "customer"
      ? styles.pillCustomerText
      : activityTone === "company"
        ? styles.pillCompanyText
        : activityTone === "money"
          ? styles.pillMoneyText
          : styles.pillLedgerText;

  const hasActions = !!onDelete;

  useEffect(() => {
    if (!highlight) {
      highlightAnim.setValue(0);
      return;
    }
    highlightAnim.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(highlightAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.timing(highlightAnim, { toValue: 0, duration: 1200, useNativeDriver: false }),
      ]),
      { iterations: 5 }
    ).start();
  }, [highlight, highlightAnim]);

  return (
    <View style={[styles.row, isDeleted && styles.rowDeleted]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.highlightOverlay,
          {
            opacity: highlightAnim,
          },
        ]}
      />
      <View style={styles.railCol}>
        <ActivityIcon
          eventType={eventType}
          orderMode={event.order_mode}
          moneyDirection={moneyDirection}
          color={dotColor}
          size={40}
        />
        <View style={styles.rail} />
      </View>
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={[styles.actionText, actionToneStyle]} numberOfLines={1}>
            {displayContextLine}
          </Text>
          {showPaymentRatio ? (
            <Text style={styles.moneyText} numberOfLines={1}>
              <Text
                style={[
                  styles.moneyText,
                  ratioMoneyDirection === "in" || ratioMoneyDirection === "received" ? styles.moneyIn : styles.moneyOut,
                ]}
              >
                {ratioMoneyDirection === "in" || ratioMoneyDirection === "received" ? "+" : "-"}
                {formatMoneyValue(paymentAmount, fmtMoney)}
              </Text>
              <Text style={styles.moneyTotalText}> / {formatMoneyValue(paymentTotal, fmtMoney)}</Text>
            </Text>
          ) : moneyText ? (
            <Text
              style={[
                styles.moneyText,
                moneyDirection === "in" || moneyDirection === "received" ? styles.moneyIn : styles.moneyOut,
              ]}
              numberOfLines={1}
            >
              {moneyText}
            </Text>
          ) : null}
        </View>

        <Text style={styles.headerName} numberOfLines={1}>
          {headerName}
        </Text>
        {headerDesc ? (
          <Text style={styles.headerDesc} numberOfLines={1}>
            {headerDesc}
          </Text>
        ) : null}


        {heroLines.length > 0 ? (
          <View>
            {heroLines.map((line, index) => {
              const isReplacementSystemLine = _isOrderKind(event.event_type) && line.startsWith("System:");
              const isReplacementReceivedLine =
                activityKind === "replacement" &&
                line.startsWith("Received:");
              const isRefillReturnedLine = activityKind === "refill" && !!(event.buy12 || event.buy48) && line.startsWith("Returned:");
              return (
                <Text
                  key={`hero-${index}`}
                  style={[
                    styles.heroText,
                    (isReplacementSystemLine || isReplacementReceivedLine || isRefillReturnedLine) && styles.heroTextLabel,
                  ]}
                >
                  {line}
                </Text>
              );
            })}
          </View>
        ) : null}

        {showNotes ? (
          <View style={styles.statusRow}>
            <View style={styles.pillRow}>
              {notes.map((note, index) => {
                if (transitionPills.length > 0) return null;
                const text = buildLegacyNoteText(note, fmtMoney);
                if (!text) return null;
                return (
                  <View key={`note-${index}`} style={[styles.pill, scopedPillStyle]}>
                    <Text
                      style={[styles.pillText, scopedPillTextStyle]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {text}
                    </Text>
                  </View>
                );
              })}
              {transitionPills.map((pill, index) => (
                <View
                  key={`transition-${index}`}
                  style={[
                    styles.pill,
                    pill.intent === "good"
                      ? styles.pillGood
                      : pill.intent === "bad"
                        ? styles.pillDanger
                        : scopedPillStyle,
                  ]}
                >
                  <Text
                    style={[
                      styles.pillText,
                      pill.intent === "good"
                        ? styles.pillGoodText
                        : pill.intent === "bad"
                          ? styles.pillDangerText
                          : scopedPillTextStyle,
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {pill.text}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {createdAtLine || effectiveAtLine || hasActions || isDeleted ? (
          <View style={styles.actionsRow}>
            <View style={styles.timestampsBlock}>
              {isDeleted ? (
                <Text style={styles.deletedLabel}>Deleted</Text>
              ) : null}
              {createdAtLine ? (
                <Text style={[styles.contextText, hasDateMismatch && styles.contextTextAlert]}>{createdAtLine}</Text>
              ) : null}
              {effectiveAtLine ? (
                <Text style={[styles.contextText, hasDateMismatch && styles.contextTextAlert]}>{effectiveAtLine}</Text>
              ) : null}
            </View>
            {hasActions ? (
              <View style={styles.actionBtns}>
                {onDelete ? (
                  <Pressable
                    onPress={isDeleted ? undefined : onDelete}
                    style={[styles.actionBtn, isDeleted && styles.actionBtnDisabled]}
                    accessibilityLabel="Delete"
                  >
                    <Ionicons name="trash-outline" size={16} color={isDeleted ? "#94a3b8" : "#b91c1c"} />
                    <Text style={[styles.actionBtnText, styles.actionBtnTextDanger, isDeleted && styles.actionBtnTextDisabled]}>Delete</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 16,
    paddingLeft: 6,
    paddingRight: Level3Tokens.spacing.rowX,
    backgroundColor: "transparent",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eef2f7",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    position: "relative",
    overflow: "hidden",
  },
  highlightOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#dcfce7",
  },
  railCol: {
    width: 42,
    alignItems: "center",
    paddingTop: 0,
  },
  rail: {
    flex: 1,
    width: 1,
    backgroundColor: "#e5e7eb",
    marginTop: 8,
  },
  content: {
    flex: 1,
    gap: 5,
    paddingTop: 11,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  icon: {
    flexShrink: 0,
  },
  actionText: {
    flex: 1,
    fontSize: FontSizes.md,
    fontFamily: FontFamilies.regular,
  },
  actionTextCustomer: {
    color: "#0369a1",
  },
  actionTextCompany: {
    color: "#c2410c",
  },
  actionTextMoney: {
    color: "#0f766e",
  },
  actionTextLedger: {
    color: "#475569",
  },
  headerName: {
    flex: 1,
    fontSize: FontSizes.xxl,
    color: Level3Tokens.colors.textPrimary,
    fontFamily: FontFamilies.semibold,
  },
  headerDesc: {
    fontSize: FontSizes.md,
    color: Level3Tokens.colors.textMuted,
    fontFamily: FontFamilies.regular,
  },
  heroText: {
    fontSize: FontSizes.lg,
    color: Level3Tokens.colors.textSecondary,
    fontFamily: FontFamilies.medium,
  },
  heroTextLabel: {
    fontSize: FontSizes.md,
    color: Level3Tokens.colors.textMuted,
    fontFamily: FontFamilies.regular,
  },
  contextRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  contextText: {
    fontSize: FontSizes.xs,
    color: "#94a3b8",
    fontFamily: FontFamilies.regular,
  },
  contextTextAlert: {
    color: "#dc2626",
  },
  contextSpacer: {
    flex: 1,
  },
  moneyText: {
    fontSize: FontSizes.xxl,
    color: Level3Tokens.colors.money,
    fontFamily: FontFamilies.bold,
    textAlign: "right",
  },
  moneyTotalText: {
    fontSize: FontSizes.sm,
    color: Level3Tokens.colors.textMuted,
    fontFamily: FontFamilies.regular,
  },
  moneyIn: {
    color: "#0f766e",
  },
  moneyOut: {
    color: "#b91c1c",
  },
  okText: {
    fontSize: FontSizes.md,
    color: Level3Tokens.colors.settledText,
    fontFamily: FontFamilies.semibold,
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Level3Tokens.spacing.chipGap,
  },
  pill: {
    paddingHorizontal: Level3Tokens.spacing.chipPadX,
    paddingVertical: Level3Tokens.spacing.chipPadY,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamilies.medium,
  },
  pillCustomer: {
    backgroundColor: "#f0f9ff",
    borderColor: "#7dd3fc",
  },
  pillCustomerText: {
    color: "#0369a1",
  },
  pillCompany: {
    backgroundColor: "#fff7ed",
    borderColor: "#fdba74",
  },
  pillCompanyText: {
    color: "#c2410c",
  },
  pillMoney: {
    backgroundColor: "#f0fdfa",
    borderColor: "#5eead4",
  },
  pillMoneyText: {
    color: "#0f766e",
  },
  pillLedger: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
  },
  pillLedgerText: {
    color: "#475569",
  },
  pillWarning: {
    backgroundColor: "#fff7ed",
    borderColor: "#fdba74",
  },
  pillWarningText: {
    color: "#9a3412",
  },
  pillGood: {
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac",
  },
  pillGoodText: {
    color: "#15803d",
  },
  pillNeutral: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
  },
  pillNeutralText: {
    color: "#475569",
  },
  pillDanger: {
    backgroundColor: "#fee2e2",
    borderColor: "#fca5a5",
  },
  pillDangerText: {
    color: "#b91c1c",
  },
  rowDeleted: {
    opacity: 0.55,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    gap: 12,
  },
  timestampsBlock: {
    flex: 1,
    alignItems: "flex-start",
    gap: 2,
  },
  deletedLabel: {
    fontSize: FontSizes.sm,
    color: "#b91c1c",
    fontFamily: FontFamilies.semibold,
  },
  actionBtns: {
    flexDirection: "row",
    gap: 12,
    marginLeft: "auto",
    minHeight: 32,
    alignItems: "center",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "#f1f5f9",
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    fontSize: FontSizes.sm,
    color: "#0a7ea4",
    fontFamily: FontFamilies.semibold,
  },
  actionBtnTextDanger: {
    color: "#b91c1c",
  },
  actionBtnTextDisabled: {
    color: "#94a3b8",
  },
});
