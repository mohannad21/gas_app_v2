import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Spacing } from "@/constants/spacing";
import { FontFamilies, FontSizes } from "@/constants/typography";
import type { BalanceSummary, CompanySummary } from "@/hooks/useBalancesSummary";
import { formatAggregateBalanceState, formatCurrentBalanceState } from "@/lib/balanceTransitions";

type BalancesCardProps = {
  balanceSummary: BalanceSummary;
  companySummary: CompanySummary;
  formatCustomerCount: (count: number) => string;
  formatMoney: (value: number) => string;
  formatCount: (value: number) => string;
  companyBalancesReady?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
};

function buildCustomerLines(balanceSummary: BalanceSummary, formatMoney: (value: number) => string) {
  const lines = [
    balanceSummary.money.receivable.total > 0
      ? formatAggregateBalanceState("customer", "money", balanceSummary.money.receivable.total, {
          count: balanceSummary.money.receivable.count,
          formatMoney,
        })
      : null,
    balanceSummary.money.payable.total > 0
      ? formatAggregateBalanceState("customer", "money", -balanceSummary.money.payable.total, {
          count: balanceSummary.money.payable.count,
          formatMoney,
        })
      : null,
    balanceSummary.cyl12.receivable.total > 0
      ? formatAggregateBalanceState("customer", "cyl_12", balanceSummary.cyl12.receivable.total, {
          count: balanceSummary.cyl12.receivable.count,
          formatMoney,
        })
      : null,
    balanceSummary.cyl12.payable.total > 0
      ? formatAggregateBalanceState("customer", "cyl_12", -balanceSummary.cyl12.payable.total, {
          count: balanceSummary.cyl12.payable.count,
          formatMoney,
        })
      : null,
    balanceSummary.cyl48.receivable.total > 0
      ? formatAggregateBalanceState("customer", "cyl_48", balanceSummary.cyl48.receivable.total, {
          count: balanceSummary.cyl48.receivable.count,
          formatMoney,
        })
      : null,
    balanceSummary.cyl48.payable.total > 0
      ? formatAggregateBalanceState("customer", "cyl_48", -balanceSummary.cyl48.payable.total, {
          count: balanceSummary.cyl48.payable.count,
          formatMoney,
        })
      : null,
  ].filter(Boolean) as string[];
  return lines.length > 0 ? lines : ["All settled ✅"];
}

function buildCompanyLines(companySummary: CompanySummary, formatMoney: (value: number) => string) {
  const moneyNet = companySummary.payCash > 0 ? companySummary.payCash : -companySummary.receiveCash;
  const cyl12Net = companySummary.receive12 > 0 ? companySummary.receive12 : -companySummary.give12;
  const cyl48Net = companySummary.receive48 > 0 ? companySummary.receive48 : -companySummary.give48;
  const lines = [
    moneyNet !== 0 ? formatCurrentBalanceState("company", "money", moneyNet, { formatMoney }) : null,
    cyl12Net !== 0 ? formatCurrentBalanceState("company", "cyl_12", cyl12Net, { formatMoney }) : null,
    cyl48Net !== 0 ? formatCurrentBalanceState("company", "cyl_48", cyl48Net, { formatMoney }) : null,
  ].filter(Boolean) as string[];
  return lines.length > 0 ? lines : ["All settled ✅"];
}

export default function BalancesCard({
  balanceSummary,
  companySummary,
  formatCustomerCount,
  formatMoney,
  formatCount,
  companyBalancesReady = true,
  collapsed = false,
  onToggle,
  containerStyle,
}: BalancesCardProps) {
  const customerDisplayLines = buildCustomerLines(balanceSummary, formatMoney);
  const companyDisplayLines = buildCompanyLines(companySummary, formatMoney);
  const customerCounts = [
    balanceSummary.money.receivable.count,
    balanceSummary.money.payable.count,
    balanceSummary.cyl12.receivable.count,
    balanceSummary.cyl12.payable.count,
    balanceSummary.cyl48.receivable.count,
    balanceSummary.cyl48.payable.count,
  ].reduce((max, value) => Math.max(max, value), 0);

  const content = (
    <>
      <View style={styles.headerRow}>
        <Text style={styles.topSummaryTitle}>Current Balances</Text>
        {onToggle ? (
          <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={16} color="#0a7ea4" />
        ) : null}
      </View>
      {collapsed ? null : (
        <View style={styles.balanceSplitRow}>
          <View style={styles.balanceColumn}>
            <Text style={styles.balancePanelTitle}>Customers</Text>
            {customerDisplayLines.map((line, index) => (
              <Text key={`${line}-${index}`} style={styles.relationshipLine}>
                {line}
              </Text>
            ))}
            {customerCounts > 0 ? (
              <Text style={styles.relationshipMeta}>
                {formatCustomerCount(customerCounts)} tracked across money / 12kg / 48kg
              </Text>
            ) : null}
          </View>
          <View style={styles.balanceColumn}>
            <Text style={styles.balancePanelTitle}>Company</Text>
            {!companyBalancesReady ? (
              <Text style={styles.relationshipLine}>Current company balances unavailable</Text>
            ) : (
              companyDisplayLines.map((line, index) => (
                <Text key={`${line}-${index}`} style={styles.relationshipLine}>
                  {line}
                </Text>
              ))
            )}
            {companyBalancesReady ? (
              <Text style={styles.relationshipMeta}>
                12kg {formatCount(companySummary.receive12 + companySummary.give12)} | 48kg{" "}
                {formatCount(companySummary.receive48 + companySummary.give48)}
              </Text>
            ) : null}
          </View>
        </View>
      )}
    </>
  );

  if (onToggle) {
    return (
      <Pressable onPress={onToggle} style={[styles.topSummaryCard, styles.balancesCard, containerStyle]}>
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.topSummaryCard, styles.balancesCard, containerStyle]}>{content}</View>;
}

const styles = StyleSheet.create({
  topSummaryCard: {
    marginTop: -12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  balancesCard: {
    backgroundColor: "white",
    borderColor: "#e2e8f0",
  },
  balanceSplitRow: { flexDirection: "row", gap: Spacing.xl, marginTop: Spacing.lg },
  balanceColumn: { flex: 1, gap: Spacing.sm },
  balancePanelTitle: {
    fontSize: FontSizes.md,
    fontWeight: "900",
    fontFamily: FontFamilies.extrabold,
    color: "#0f172a",
    marginBottom: Spacing.sm,
  },
  topSummaryTitle: {
    fontSize: FontSizes.md,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 0,
    fontFamily: FontFamilies.extrabold,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  relationshipLine: {
    color: "#0f172a",
    fontWeight: "600",
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.md,
  },
  relationshipMeta: {
    color: "#64748b",
    fontWeight: "600",
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
});

