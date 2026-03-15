import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { FontFamilies, FontSizes } from "@/constants/typography";
import type { BalanceSummary } from "@/hooks/useBalancesSummary";
import { formatAggregateBalanceState } from "@/lib/balanceTransitions";

import CollapsibleSectionCard from "./CollapsibleSectionCard";

type CustomerBalancesSectionProps = {
  balanceSummary: BalanceSummary;
  formatMoney: (value: number) => string;
  formatCustomerCount: (count: number) => string;
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

  return lines.length > 0 ? lines : ["All settled"];
}

export default function CustomerBalancesSection({
  balanceSummary,
  formatMoney,
  formatCustomerCount,
  collapsed = false,
  onToggle,
  containerStyle,
}: CustomerBalancesSectionProps) {
  const customerLines = buildCustomerLines(balanceSummary, formatMoney);
  const customerCounts = [
    balanceSummary.money.receivable.count,
    balanceSummary.money.payable.count,
    balanceSummary.cyl12.receivable.count,
    balanceSummary.cyl12.payable.count,
    balanceSummary.cyl48.receivable.count,
    balanceSummary.cyl48.payable.count,
  ].reduce((max, value) => Math.max(max, value), 0);

  return (
    <CollapsibleSectionCard
      title="Customer Balances"
      collapsed={collapsed}
      onToggle={onToggle ?? (() => undefined)}
      containerStyle={[styles.card, containerStyle]}
      titleStyle={styles.title}
    >
      <View style={styles.content}>
        {customerLines.map((line) => (
          <Text key={line} style={styles.line}>
            {line}
          </Text>
        ))}
        {customerCounts > 0 ? (
          <Text style={styles.meta}>
            {formatCustomerCount(customerCounts)} tracked across money / 12kg / 48kg
          </Text>
        ) : null}
      </View>
    </CollapsibleSectionCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
  },
  title: {
    fontSize: FontSizes.md,
    fontWeight: "900",
    color: "#0f172a",
    fontFamily: FontFamilies.extrabold,
  },
  content: {
    gap: 8,
  },
  line: {
    color: "#0f172a",
    fontWeight: "600",
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.md,
  },
  meta: {
    color: "#64748b",
    fontWeight: "600",
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
});
