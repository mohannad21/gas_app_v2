import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Level3Tokens } from "@/constants/level3";
import { FontFamilies, FontSizes } from "@/constants/typography";
import { formatBalanceTransitions } from "@/lib/balanceTransitions";
import { getEventColor } from "@/lib/reports/eventColors";
import { DailyReportV2Event } from "@/types/domain";
import { getActivityIcon } from "@/components/reports/ActivityIcon";

type SlimActivityRowProps = {
  event: DailyReportV2Event;
  formatMoney?: (value: number) => string;
  onEdit?: () => void;
  onDelete?: () => void;
  isDeleted?: boolean;
};

const formatMoneyValue = (amount: number, formatMoney: (v: number) => string) => `₪${formatMoney(amount)}`;

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
      return withBefore
        ? `Customer still owes you ${amountText} (was ${formatMoneyValue(before, formatMoney)})`
        : `Customer pays you ${amountText}`;
    }
    if (note.direction === "you_pay_customer") {
      return withBefore
        ? `You still owe customer ${amountText} (was ${formatMoneyValue(before, formatMoney)})`
        : `You pay customer ${amountText}`;
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
        ? `You still owe company ${amountText} (was ${formatMoneyValue(before, formatMoney)})`
        : `You pay company ${amountText}`;
    }
    if (note.direction === "you_paid_earlier") {
      return `Paid earlier ${amountText} to company`;
    }
    if (note.direction === "company_pays_you") {
      return `Company owes you ${amountText}`;
    }
  }

  const formatCyl = (qty: number, gas: string, unit: "empty" | "full") =>
    `${qty}x${gas} ${unit}${qty === 1 ? "" : "s"}`;

  if (note.kind === "cyl_12" || note.kind === "cyl_48") {
    const gas = note.kind === "cyl_12" ? "12kg" : "48kg";
    const qtyText = formatCyl(after, gas, "empty");
    if (note.direction === "customer_returns_you") {
      return withBefore ? `Customer still owes you ${qtyText} (was ${before})` : `Customer returns ${qtyText}`;
    }
    if (note.direction === "you_return_company") {
      return withBefore ? `You still owe company ${qtyText} (was ${before})` : `You return company ${qtyText}`;
    }
    if (note.direction === "you_returned_earlier") {
      return `Returned earlier ${qtyText}`;
    }
  }

  if (note.kind === "cyl_full_12" || note.kind === "cyl_full_48") {
    const gas = note.kind === "cyl_full_12" ? "12kg" : "48kg";
    const qtyText = formatCyl(after, gas, "full");
    if (note.direction === "you_deliver_customer") {
      return `You deliver customer ${qtyText}`;
    }
    if (note.direction === "company_delivers_you") {
      return `Extra ${qtyText}`;
    }
  }

  return null;
};

const formatGasSummary = (qty12?: number | null, qty48?: number | null) => {
  const parts: string[] = [];
  if (qty12 && qty12 !== 0) parts.push(`${qty12}x12kg`);
  if (qty48 && qty48 !== 0) parts.push(`${qty48}x48kg`);
  return parts.length > 0 ? parts.join(" | ") : null;
};

const formatOrderMetric = (event: DailyReportV2Event) => {
  const gas = event.gas_type ? `${event.gas_type}` : "";
  const installed = Number(event.order_installed ?? 0);
  const received = Number(event.order_received ?? 0);
  if (event.order_mode === "replacement" && installed > 0) {
    return `Installed ${installed}x${gas}`;
  }
  if (event.order_mode === "sell_iron" && installed > 0) {
    return `Sold ${installed}x${gas}`;
  }
  if (event.order_mode === "buy_iron") {
    const qty = received > 0 ? received : installed;
    if (qty > 0) return `Bought ${qty}x${gas}`;
  }
  return null;
};

const buildHeroAction = (event: DailyReportV2Event, formatMoney: (v: number) => string) => {
  if (event.hero_primary) return event.hero_primary;
  if (event.hero_text) return event.hero_text;
  if (event.event_type === "order") {
    return formatOrderMetric(event);
  }
  if (event.event_type === "refill") {
    const parts = formatGasSummary(event.buy12, event.buy48);
    return parts ? `Bought ${parts}` : null;
  }
  if (event.event_type === "company_buy_iron") {
    const parts = formatGasSummary(event.buy12, event.buy48);
    return parts ? `Bought ${parts}` : null;
  }
  if (event.event_type === "collection_money") {
    const amount = Number(event.money_received ?? event.money?.amount ?? 0);
    return amount ? `Payment from customer ${formatMoneyValue(amount, formatMoney)}` : "Payment from customer";
  }
  if (event.event_type === "collection_payout") {
    const amount = Number(event.money_amount ?? event.money?.amount ?? 0);
    return amount ? `Payment to customer ${formatMoneyValue(amount, formatMoney)}` : "Payment to customer";
  }
  if (event.event_type === "company_payment") {
    const amount = Number(event.money_amount ?? event.money?.amount ?? 0);
    const direction = event.money_direction === "in" ? "Payment from company" : "Payment to company";
    return amount ? `${direction} ${formatMoneyValue(amount, formatMoney)}` : direction;
  }
  if (event.event_type === "collection_empty") {
    const parts = formatGasSummary(event.return12, event.return48);
    return parts ? `Returned ${parts} empties` : "Returned empties";
  }
  if (event.event_type === "expense") {
    return null;
  }
  if (event.event_type === "cash_adjust") {
    return event.reason ?? null;
  }
  if (event.event_type === "adjust") {
    const gas = event.gas_type ? `${event.gas_type}` : null;
    const note = event.reason ?? null;
    if (gas && note) return `${gas} · ${note}`;
    if (gas) return gas;
    if (note) return note;
    return null;
  }
  if (event.event_type === "bank_deposit") {
    return event.label ?? event.display_name ?? "Wallet Transfer";
  }
  return event.label ?? null;
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

const transitionIntentForEvent = (event: DailyReportV2Event) => {
  if (event.event_type === "order") return "customer_order" as const;
  if (event.event_type === "collection_money") return "customer_payment" as const;
  if (event.event_type === "collection_payout") return "customer_payout" as const;
  if (event.event_type === "collection_empty") return "customer_return" as const;
  if (event.event_type === "customer_adjust") return "customer_adjust" as const;
  if (event.event_type === "company_payment") return "company_payment" as const;
  if (event.event_type === "company_buy_iron") return "company_buy_iron" as const;
  if (event.event_type === "refill") {
    const isSettleOnly =
      event.label === "Returned empties" ||
      (!(event.buy12 || event.buy48) && !!(event.return12 || event.return48) &&
        !event.total_cost && !event.paid_now);
    return isSettleOnly ? ("company_settle" as const) : ("company_refill" as const);
  }
  return "generic" as const;
};

export default function SlimActivityRow({ event, formatMoney, onEdit, onDelete, isDeleted }: SlimActivityRowProps) {
  const fmtMoney = formatMoney ?? ((value: number) => String(value));
  const eventType = String(event?.event_type ?? "event");
  const label = event?.label ?? eventType;
  const counterparty = event?.counterparty;
  const isCustomer = counterparty?.type === "customer";
  const isCompany = counterparty?.type === "company";

  const headerNameRaw = event.event_type === "expense"
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
  const moneyAmount = typeof event?.money_delta === "number" ? event.money_delta : Number(event?.money_amount ?? 0);
  const moneyDirection = event?.money_direction ?? event?.money?.verb ?? "none";
  const moneyText =
    moneyDirection !== "none" && moneyAmount
      ? `${moneyDirection === "in" || moneyDirection === "received" ? "+" : "-"}${formatMoneyValue(
          moneyAmount,
          fmtMoney
        )}`
      : null;

  const transitionLines = formatBalanceTransitions(event?.balance_transitions, {
    mode: "transition",
    collapseAllSettled: true,
    intent: transitionIntentForEvent(event),
    formatMoney: fmtMoney,
  });
  const notes = transitionLines.length === 0 && Array.isArray(event?.notes) ? event.notes : [];
  const showOk = event?.status === "atomic_ok" && event?.event_type !== "expense";
  const showSettled = event?.status === "balance_settled";
  const showNotes = transitionLines.length > 0 || notes.length > 0;
  const showStatus = (showOk || showSettled) && transitionLines.length === 0;
  const okLabel = showSettled ? "✅ Balance settled" : "✅ OK";
  const dotColor = getEventColor(eventType);
  const activityIcon = getActivityIcon(eventType, event.order_mode, moneyDirection);

  const hasActions = !!(onEdit || onDelete);

  return (
    <View style={[styles.row, isDeleted && styles.rowDeleted]}>
      <View style={styles.railCol}>
        <Ionicons name={activityIcon} size={22} color={dotColor} style={styles.icon} />
        <View style={styles.rail} />
      </View>
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.actionText} numberOfLines={1}>
            {event.context_line ?? label}
          </Text>
          {moneyText ? (
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
          {headerDesc ? <Text style={styles.headerDesc}>{` — ${headerDesc}`}</Text> : null}
        </Text>


        {heroAction ? (
          <Text style={styles.heroText} numberOfLines={1}>
            {heroAction}
          </Text>
        ) : null}

        {showStatus && !showNotes ? <Text style={styles.okText}>{okLabel}</Text> : null}

        {showNotes ? (
          <View style={styles.statusRow}>
            <View style={styles.pillRow}>
              {notes.map((note, index) => {
                if (transitionLines.length > 0) return null;
                const text = buildLegacyNoteText(note, fmtMoney);
                if (!text) return null;
                return (
                  <View key={`note-${index}`} style={[styles.pill, styles.pillWarning]}>
                    <Text
                      style={[styles.pillText, styles.pillWarningText]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {text}
                    </Text>
                  </View>
                );
              })}
              {transitionLines.map((text, index) => (
                <View key={`transition-${index}`} style={[styles.pill, styles.pillWarning]}>
                  <Text
                    style={[styles.pillText, styles.pillWarningText]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {text}
                  </Text>
                </View>
              ))}
            </View>
            {showStatus ? <Text style={styles.okText}>{okLabel}</Text> : null}
          </View>
        ) : null}

        {hasActions ? (
          <View style={styles.actionsRow}>
            {isDeleted ? (
              <Text style={styles.deletedLabel}>Deleted</Text>
            ) : null}
            <View style={styles.actionBtns}>
              {onEdit ? (
                <Pressable
                  onPress={isDeleted ? undefined : onEdit}
                  style={[styles.actionBtn, isDeleted && styles.actionBtnDisabled]}
                  accessibilityLabel="Edit"
                >
                  <Ionicons name="create-outline" size={16} color={isDeleted ? "#94a3b8" : "#0a7ea4"} />
                  <Text style={[styles.actionBtnText, isDeleted && styles.actionBtnTextDisabled]}>Edit</Text>
                </Pressable>
              ) : null}
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
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: Level3Tokens.spacing.rowY,
    paddingHorizontal: Level3Tokens.spacing.rowX,
    backgroundColor: Level3Tokens.colors.rowBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Level3Tokens.colors.border,
    flexDirection: "row",
    gap: 10,
  },
  railCol: {
    width: 28,
    alignItems: "center",
  },
  rail: {
    flex: 1,
    width: 2,
    backgroundColor: Level3Tokens.colors.border,
    marginTop: 4,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  icon: {
    flexShrink: 0,
  },
  actionText: {
    flex: 1,
    fontSize: FontSizes.md,
    color: Level3Tokens.colors.textMuted,
    fontFamily: FontFamilies.regular,
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
  contextRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  contextText: {
    fontSize: FontSizes.sm,
    color: Level3Tokens.colors.textMuted,
    fontFamily: FontFamilies.regular,
    flex: 1,
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
    fontSize: FontSizes.md,
    fontFamily: FontFamilies.medium,
  },
  pillWarning: {
    backgroundColor: "#fff7ed",
    borderColor: "#fdba74",
  },
  pillWarningText: {
    color: "#9a3412",
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



