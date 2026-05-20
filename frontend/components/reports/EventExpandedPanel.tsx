import { type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { gasColor } from "@/constants/gas";
import { FontFamilies } from "@/constants/typography";

const ORDER_KINDS = new Set(["order", "replacement", "sell_full", "buy_empty_from_customer"]);

function DeltaBox({
  testID,
  label,
  before,
  after,
  format,
  accent,
  smallDelta,
  compact,
  valueStyle,
  badgeTone,
  singleValue,
  showNoChange,
}: {
  testID?: string;
  label: string;
  before: number;
  after: number;
  format: (v: number) => string;
  accent?: string;
  smallDelta?: boolean;
  compact?: boolean;
  valueStyle?: any;
  badgeTone?: "good" | "bad";
  singleValue?: number;
  showNoChange?: boolean;
}) {
  const delta = (after ?? 0) - (before ?? 0);
  const showSingle = typeof singleValue === "number";
  const isNoChange = !!showNoChange && !showSingle && delta === 0;
  const badgeStyle =
    isNoChange
      ? styles.deltaBadgeNeutral
      : badgeTone === "good"
      ? styles.deltaBadgePositive
      : badgeTone === "bad"
        ? styles.deltaBadgeNegative
        : delta >= 0
          ? styles.deltaBadgePositive
          : styles.deltaBadgeNegative;
  return (
    <View
      testID={testID}
      style={[styles.deltaBox, accent ? { borderColor: accent } : null, compact && styles.deltaBoxCompact]}
    >
      <Text style={styles.deltaBoxLabel}>{label}</Text>
      <View style={[styles.deltaBadge, badgeStyle, smallDelta && styles.deltaBadgeSmall]}>
        <Text style={[styles.deltaBadgeText, smallDelta && styles.deltaBadgeTextSmall]}>
          {isNoChange ? "No change" : `${delta >= 0 ? "+" : "-"}${format(Math.abs(delta))}`}
        </Text>
      </View>
      <View style={styles.deltaBoxRow}>
        {showSingle ? (
          <Text style={[styles.deltaBoxValue, valueStyle]}>{format(singleValue)}</Text>
        ) : (
          <>
            <Text style={[styles.deltaBoxValue, valueStyle]}>{format(before ?? 0)}</Text>
            <Text style={styles.deltaBoxArrow}>{"->"}</Text>
            <Text style={[styles.deltaBoxValue, valueStyle]}>{format(after ?? 0)}</Text>
          </>
        )}
      </View>
    </View>
  );
}

export default function EventExpandedPanel({
  ev,
  formatMoney,
  formatCount,
}: {
  ev: any;
  formatMoney: (v: number) => string;
  formatCount: (v: number) => string;
}) {
  const eventType = String(ev?.event_type ?? ev?.type ?? ev?.source_type ?? "event");

  const invBefore = ev?.inventory_before ?? null;
  const invAfter = ev?.inventory_after ?? null;
  const walletBefore = typeof ev?.wallet_before === "number" ? ev.wallet_before : null;
  const walletAfter = typeof ev?.wallet_after === "number" ? ev.wallet_after : null;
  const hasCash = typeof walletBefore === "number" && typeof walletAfter === "number";

  const full12Before = typeof invBefore?.full12 === "number" ? invBefore.full12 : null;
  const full12After = typeof invAfter?.full12 === "number" ? invAfter.full12 : null;
  const empty12Before = typeof invBefore?.empty12 === "number" ? invBefore.empty12 : null;
  const empty12After = typeof invAfter?.empty12 === "number" ? invAfter.empty12 : null;
  const full48Before = typeof invBefore?.full48 === "number" ? invBefore.full48 : null;
  const full48After = typeof invAfter?.full48 === "number" ? invAfter.full48 : null;
  const empty48Before = typeof invBefore?.empty48 === "number" ? invBefore.empty48 : null;
  const empty48After = typeof invAfter?.empty48 === "number" ? invAfter.empty48 : null;

  const gasType = ev?.gas_type;

  const valueOrZero = (value: number | null | undefined) => (typeof value === "number" ? value : 0);
  const has12InventoryState =
    full12Before != null || full12After != null || empty12Before != null || empty12After != null;
  const has48InventoryState =
    full48Before != null || full48After != null || empty48Before != null || empty48After != null;
  const has12InventoryChange =
    (full12Before != null && full12After != null && full12Before !== full12After) ||
    (empty12Before != null && empty12After != null && empty12Before !== empty12After);
  const has48InventoryChange =
    (full48Before != null && full48After != null && full48Before !== full48After) ||
    (empty48Before != null && empty48After != null && empty48Before !== empty48After);
  const hasCashChange = hasCash && walletBefore !== walletAfter;
  const touches12 =
    gasType === "12kg" ||
    (typeof ev?.buy12 === "number" && ev.buy12 !== 0) ||
    (typeof ev?.return12 === "number" && ev.return12 !== 0) ||
    has12InventoryChange;
  const touches48 =
    gasType === "48kg" ||
    (typeof ev?.buy48 === "number" && ev.buy48 !== 0) ||
    (typeof ev?.return48 === "number" && ev.return48 !== 0) ||
    has48InventoryChange;
  const inferredGasType =
    gasType === "12kg" || gasType === "48kg"
      ? gasType
      : touches12 && !touches48
        ? "12kg"
        : touches48 && !touches12
          ? "48kg"
          : null;

  const placeholderBox = (key: string) => (
    <View key={key} testID={key} style={[styles.deltaBox, styles.deltaBoxCompact, styles.deltaBoxPlaceholder]} />
  );

  const buildDeltaRow = (boxes: ReactNode[], key: string) => {
    if (boxes.length === 0) return null;
    return (
      <View key={key} testID={key} style={styles.eventExpandedRow}>
        {boxes}
      </View>
    );
  };

  const renderTopStateBox = ({
    key,
    label,
    before,
    after,
    format,
    accent,
  }: {
    key: string;
    label: string;
    before: number | null | undefined;
    after: number | null | undefined;
    format: (v: number) => string;
    accent?: string;
  }) => (
    <DeltaBox
      key={key}
      testID={key}
      label={label}
      before={valueOrZero(before)}
      after={valueOrZero(after)}
      format={format}
      accent={accent}
      compact
      showNoChange
    />
  );

  const renderRows = (boxes: ReactNode[]) => {
    const rows: ReactNode[] = [];
    for (let idx = 0; idx < boxes.length; idx += 3) {
      rows.push(buildDeltaRow(boxes.slice(idx, idx + 3), `row-${idx}`));
    }
    return <>{rows}</>;
  };

  const renderFixedRow = (boxes: ReactNode[], key: string) => <>{buildDeltaRow(boxes, key)}</>;

  const renderMixedLayout = ({
    include12,
    include48,
    includeCash,
    keyPrefix,
  }: {
    include12: boolean;
    include48: boolean;
    includeCash: boolean;
    keyPrefix: string;
  }) => (
    <>
      {include12
        ? buildDeltaRow(
            [
              renderTopStateBox({ key: `${keyPrefix}-12-full`, label: "12kg Full", before: full12Before, after: full12After, format: formatCount, accent: gasColor("12kg") }),
              renderTopStateBox({ key: `${keyPrefix}-12-empty`, label: "12kg Empty", before: empty12Before, after: empty12After, format: formatCount, accent: gasColor("12kg") }),
            ],
            `${keyPrefix}-12-row`
          )
        : null}
      {include48
        ? buildDeltaRow(
            [
              renderTopStateBox({ key: `${keyPrefix}-48-full`, label: "48kg Full", before: full48Before, after: full48After, format: formatCount, accent: gasColor("48kg") }),
              renderTopStateBox({ key: `${keyPrefix}-48-empty`, label: "48kg Empty", before: empty48Before, after: empty48After, format: formatCount, accent: gasColor("48kg") }),
            ],
            `${keyPrefix}-48-row`
          )
        : null}
      {includeCash
        ? buildDeltaRow(
            [
              placeholderBox(`${keyPrefix}-cash-left`),
              renderTopStateBox({ key: `${keyPrefix}-cash`, label: "Wallet", before: walletBefore, after: walletAfter, format: formatMoney }),
              placeholderBox(`${keyPrefix}-cash-right`),
            ],
            `${keyPrefix}-cash-row`
          )
        : null}
    </>
  );

  const renderGasTriplet = (targetGasType: "12kg" | "48kg") => {
    const is48 = targetGasType === "48kg";
    return renderFixedRow(
      [
        renderTopStateBox({ key: `${targetGasType}-full`, label: `${targetGasType} Full`, before: is48 ? full48Before : full12Before, after: is48 ? full48After : full12After, format: formatCount, accent: gasColor(targetGasType) }),
        renderTopStateBox({ key: `${targetGasType}-empty`, label: `${targetGasType} Empty`, before: is48 ? empty48Before : empty12Before, after: is48 ? empty48After : empty12After, format: formatCount, accent: gasColor(targetGasType) }),
        renderTopStateBox({ key: `${targetGasType}-cash`, label: "Wallet", before: walletBefore, after: walletAfter, format: formatMoney }),
      ],
      `${targetGasType}-triplet`
    );
  };

  const renderSparseGasState = (targetGasType: "12kg" | "48kg") => {
    const is48 = targetGasType === "48kg";
    const fullBefore = is48 ? full48Before : full12Before;
    const fullAfter = is48 ? full48After : full12After;
    const emptyBefore = is48 ? empty48Before : empty12Before;
    const emptyAfter = is48 ? empty48After : empty12After;
    const boxes = [
      fullBefore != null || fullAfter != null
        ? renderTopStateBox({ key: `${targetGasType}-sparse-full`, label: `${targetGasType} Full`, before: fullBefore, after: fullAfter, format: formatCount, accent: gasColor(targetGasType) })
        : null,
      emptyBefore != null || emptyAfter != null
        ? renderTopStateBox({ key: `${targetGasType}-sparse-empty`, label: `${targetGasType} Empty`, before: emptyBefore, after: emptyAfter, format: formatCount, accent: gasColor(targetGasType) })
        : null,
      hasCashChange
        ? renderTopStateBox({ key: `${targetGasType}-sparse-cash`, label: "Wallet", before: walletBefore, after: walletAfter, format: formatMoney })
        : null,
    ].filter(Boolean) as ReactNode[];
    if (boxes.length === 1) {
      return buildDeltaRow(
        [placeholderBox(`${targetGasType}-sparse-left`), boxes[0], placeholderBox(`${targetGasType}-sparse-right`)],
        `${targetGasType}-sparse-centered`
      );
    }
    return boxes.length > 0 ? renderRows(boxes) : null;
  };

  const renderCenteredWalletOnly = (keyPrefix: string) =>
    buildDeltaRow(
      [
        placeholderBox(`${keyPrefix}-cash-left`),
        renderTopStateBox({ key: `${keyPrefix}-cash`, label: "Wallet", before: walletBefore, after: walletAfter, format: formatMoney }),
        placeholderBox(`${keyPrefix}-cash-right`),
      ],
      `${keyPrefix}-cash-row`
    );

  const content = (() => {
    if (ORDER_KINDS.has(eventType) && inferredGasType) return renderGasTriplet(inferredGasType);
    if ((eventType === "collection_empty" || eventType === "customer_return_empties") && inferredGasType)
      return renderSparseGasState(inferredGasType);
    if (eventType === "collection_money" || eventType === "payment_from_customer" || eventType === "collection_payout")
      return renderCenteredWalletOnly(eventType);
    if (eventType === "expense" || eventType === "bank_deposit" || eventType === "cash_adjust" || eventType === "adjust_wallet")
      return renderCenteredWalletOnly(eventType);
    if (eventType === "refill" || eventType === "company_buy_full" || eventType === "buy_full_from_company") {
      if (touches12 && touches48) return renderMixedLayout({ include12: true, include48: true, includeCash: hasCash, keyPrefix: "mixed" });
      if (touches12) return renderGasTriplet("12kg");
      if (touches48) return renderGasTriplet("48kg");
      if (hasCash) return renderCenteredWalletOnly(eventType);
    }
    if (eventType === "adjust" || eventType === "adjust_inventory") {
      const cylinderBoxes = [
        has12InventoryState ? renderTopStateBox({ key: "adjust-12-full", label: "12kg Full", before: full12Before, after: full12After, format: formatCount, accent: gasColor("12kg") }) : null,
        has12InventoryState ? renderTopStateBox({ key: "adjust-12-empty", label: "12kg Empty", before: empty12Before, after: empty12After, format: formatCount, accent: gasColor("12kg") }) : null,
        has48InventoryState ? renderTopStateBox({ key: "adjust-48-full", label: "48kg Full", before: full48Before, after: full48After, format: formatCount, accent: gasColor("48kg") }) : null,
        has48InventoryState ? renderTopStateBox({ key: "adjust-48-empty", label: "48kg Empty", before: empty48Before, after: empty48After, format: formatCount, accent: gasColor("48kg") }) : null,
      ].filter(Boolean) as ReactNode[];
      if (has12InventoryState && has48InventoryState)
        return renderMixedLayout({ include12: true, include48: true, includeCash: hasCashChange, keyPrefix: "adjust-mixed" });
      if (cylinderBoxes.length > 0 && (has12InventoryChange || has48InventoryChange || !hasCashChange))
        return renderRows(cylinderBoxes);
      if (hasCash)
        return buildDeltaRow([renderTopStateBox({ key: "adjust-cash", label: "Wallet", before: walletBefore, after: walletAfter, format: formatMoney })], "adjust-cash-only");
    }
    if (inferredGasType) return renderGasTriplet(inferredGasType);
    if (hasCash) return renderCenteredWalletOnly(eventType);
    return <Text style={styles.eventExpandedEmpty}>No top-level state change for this activity.</Text>;
  })();

  return <View style={styles.eventExpandedPanel}>{content}</View>;
}

const styles = StyleSheet.create({
  eventExpandedRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  eventExpandedPanel: { paddingHorizontal: 12, paddingBottom: 8 },
  eventExpandedEmpty: { marginTop: 6, fontSize: 12, color: "#64748b", fontFamily: FontFamilies.semibold },
  deltaBox: {
    position: "relative",
    paddingTop: 32,
    paddingRight: 10,
    paddingBottom: 10,
    paddingLeft: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5f5",
    backgroundColor: "#f8fafc",
    minWidth: 140,
    minHeight: 84,
    flexGrow: 1,
  },
  deltaBoxCompact: { minWidth: 0, flex: 1 },
  deltaBoxPlaceholder: { opacity: 0 },
  deltaBoxLabel: { fontSize: 11, fontWeight: "800", color: "#0f172a", fontFamily: FontFamilies.bold },
  deltaBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#0f172a",
  },
  deltaBadgeNeutral: { backgroundColor: "#64748b" },
  deltaBadgePositive: { backgroundColor: "#16a34a" },
  deltaBadgeNegative: { backgroundColor: "#b91c1c" },
  deltaBadgeSmall: { paddingHorizontal: 5, paddingVertical: 1 },
  deltaBadgeText: { fontSize: 11, fontWeight: "900", color: "white", fontFamily: FontFamilies.extrabold },
  deltaBadgeTextSmall: { fontSize: 10 },
  deltaBoxRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6, minHeight: 18 },
  deltaBoxValue: { fontSize: 11, fontWeight: "900", color: "#0f172a", fontFamily: FontFamilies.extrabold },
  deltaBoxArrow: { fontSize: 11, fontWeight: "900", color: "#0a7ea4", fontFamily: FontFamilies.extrabold },
});
