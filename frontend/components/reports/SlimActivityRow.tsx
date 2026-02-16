import { StyleSheet, Text, View } from "react-native";

import { Level3Tokens } from "@/constants/level3";
import { FontFamilies, FontSizes } from "@/constants/typography";
import { DailyReportV2Event } from "@/types/domain";

type SlimActivityRowProps = {
  event: DailyReportV2Event;
  formatMoney?: (value: number) => string;
};

const getEventColor = (eventType: string) => {
  const palette: Record<string, string> = {
    order: "#0a7ea4",
    refill: "#f97316",
    expense: "#16a34a",
    init: "#8b5cf6",
    adjust: "#64748b",
    cash_adjust: "#64748b",
    collection_money: "#22c55e",
    collection_payout: "#ef4444",
    collection_empty: "#14b8a6",
    company_payment: "#2563eb",
    company_buy_iron: "#f59e0b",
    bank_deposit: "#0ea5e9",
  };
  return palette[eventType] ?? "#0a7ea4";
};

const formatMoneyValue = (amount: number, formatMoney: (v: number) => string) => `₪${formatMoney(amount)}`;

const buildNoteText = (note: any, formatMoney: (v: number) => string) => {
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
    if (note.direction === "you_pay_company") {
      return withBefore
        ? `You still owe company ${amountText} (was ${formatMoneyValue(before, formatMoney)})`
        : `You pay company ${amountText}`;
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
  }

  if (note.kind === "cyl_full_12" || note.kind === "cyl_full_48") {
    const gas = note.kind === "cyl_full_12" ? "12kg" : "48kg";
    const qtyText = formatCyl(after, gas, "full");
    if (note.direction === "you_deliver_customer") {
      return `You deliver customer ${qtyText}`;
    }
    if (note.direction === "company_delivers_you") {
      return `Company delivers you ${qtyText}`;
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
    return amount ? `Collected ${formatMoneyValue(amount, formatMoney)}` : "Collected";
  }
  if (event.event_type === "collection_empty") {
    const parts = formatGasSummary(event.return12, event.return48);
    return parts ? `Returned ${parts} empties` : "Returned empties";
  }
  if (event.event_type === "expense") {
    return event.expense_type ?? "Expense";
  }
  if (event.event_type === "cash_adjust") {
    return "Cash Adjustment";
  }
  if (event.event_type === "bank_deposit") {
    return "Deposit";
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

export default function SlimActivityRow({ event, formatMoney }: SlimActivityRowProps) {
  const fmtMoney = formatMoney ?? ((value: number) => String(value));
  const eventType = String(event?.event_type ?? "event");
  const label = event?.label ?? eventType;
  const counterparty = event?.counterparty;
  const isCustomer = counterparty?.type === "customer";
  const isCompany = counterparty?.type === "company";

  const headerNameRaw = event.display_name
    ? event.display_name
    : isCustomer
    ? event.customer_name ?? counterparty?.display_name ?? "Customer"
    : isCompany
    ? "Company"
    : event.expense_type ?? label;

  const headerDescBase = event.display_description ?? (isCustomer ? event.customer_description : event.reason);
  const { name: headerName, desc: headerDescFromName } = splitDisplayName(headerNameRaw);
  const headerDesc = headerDescFromName || headerDescBase || "";

  const heroAction = buildHeroAction(event, fmtMoney) ?? label;
  const moneyAmount = typeof event?.money_delta === "number" ? event.money_delta : Number(event?.money_amount ?? 0);
  const moneyDirection = event?.money_direction ?? event?.money?.verb ?? "none";
  const moneyText =
    moneyDirection !== "none" && moneyAmount
      ? `${moneyDirection === "in" || moneyDirection === "received" ? "+" : "-"}${formatMoneyValue(
          moneyAmount,
          fmtMoney
        )}`
      : null;

  const notes = Array.isArray(event?.notes) ? event.notes : [];
  const showOk = event?.status === "atomic_ok" && event?.event_type !== "expense";
  const showSettled = event?.status === "balance_settled";
  const showNotes = notes.length > 0;
  const showStatus = showOk || showSettled;
  const okLabel = showSettled ? "✅ Balance settled" : "✅ OK";
  const dotColor = getEventColor(eventType);

  return (
    <View style={styles.row}>
      <View style={styles.railCol}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <View style={styles.rail} />
      </View>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.headerName} numberOfLines={1}>
            {headerName}
            {headerDesc ? <Text style={styles.headerDesc}>{` — ${headerDesc}`}</Text> : null}
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

        <Text style={styles.heroText} numberOfLines={1}>
          {heroAction}
        </Text>

        {event.context_line || (showStatus && !showNotes) ? (
          <View style={styles.contextRow}>
            {event.context_line ? (
              <Text style={styles.contextText} numberOfLines={1}>
                {event.context_line}
              </Text>
            ) : (
              <View style={styles.contextSpacer} />
            )}
            {showStatus && !showNotes ? <Text style={styles.okText}>{okLabel}</Text> : null}
          </View>
        ) : null}

        {showNotes ? (
          <View style={styles.statusRow}>
            <View style={styles.pillRow}>
              {notes.map((note, index) => {
                const text = buildNoteText(note, fmtMoney);
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
            </View>
            {showStatus ? <Text style={styles.okText}>{okLabel}</Text> : null}
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
    width: 18,
    alignItems: "center",
  },
  rail: {
    flex: 1,
    width: 2,
    backgroundColor: Level3Tokens.colors.border,
    marginTop: 6,
  },
  content: {
    flex: 1,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
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
});
