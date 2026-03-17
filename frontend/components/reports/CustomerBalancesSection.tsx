import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { FontFamilies, FontSizes } from "@/constants/typography";
import type { BalanceSummary } from "@/hooks/useBalancesSummary";

type CustomerBalancesSectionProps = {
  balanceSummary: BalanceSummary;
  formatMoney: (value: number) => string;
  formatCustomerCount: (count: number) => string;
  containerStyle?: StyleProp<ViewStyle>;
};

type CustomerSummaryBox = {
  label: string;
  countLabel: string;
  value: string;
};

function buildCustomerBoxes(
  balanceSummary: BalanceSummary,
  formatMoney: (value: number) => string,
  formatCustomerCount: (count: number) => string
): CustomerSummaryBox[] {
  return [
    {
      label: "Wallet debt",
      count: balanceSummary.money.receivable.count,
      value: formatMoney(balanceSummary.money.receivable.total),
    },
    {
      label: "12kg debt",
      count: balanceSummary.cyl12.receivable.count,
      value: String(balanceSummary.cyl12.receivable.total),
    },
    {
      label: "48kg debt",
      count: balanceSummary.cyl48.receivable.count,
      value: String(balanceSummary.cyl48.receivable.total),
    },
    {
      label: "Wallet credit",
      count: balanceSummary.money.payable.count,
      value: formatMoney(balanceSummary.money.payable.total),
    },
    {
      label: "12kg credit",
      count: balanceSummary.cyl12.payable.count,
      value: String(balanceSummary.cyl12.payable.total),
    },
    {
      label: "48kg credit",
      count: balanceSummary.cyl48.payable.count,
      value: String(balanceSummary.cyl48.payable.total),
    },
  ].map((entry) => ({
    value: entry.label.startsWith("Wallet") ? `${entry.value} shekels` : `${entry.value} cyl`,
    countLabel: formatCustomerCount(entry.count),
    label: entry.label,
  }));
}

export default function CustomerBalancesSection({
  balanceSummary,
  formatMoney,
  formatCustomerCount,
  containerStyle,
}: CustomerBalancesSectionProps) {
  const customerBoxes = buildCustomerBoxes(balanceSummary, formatMoney, formatCustomerCount);
  const rows = [customerBoxes.slice(0, 3), customerBoxes.slice(3, 6)];

  return (
    <View style={[styles.card, containerStyle]}>
      {rows.map((row, rowIndex) => (
        <View key={`customer-summary-row-${rowIndex}`} style={styles.row}>
          {row.map((box) => (
            <View key={box.label} style={styles.box}>
              <Text style={styles.label}>{box.label}</Text>
              <Text style={styles.value}>{box.value}</Text>
              <Text style={styles.meta}>{box.countLabel}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    gap: 8,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  box: {
    flex: 1,
    minHeight: 74,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  label: {
    color: "#475569",
    fontWeight: "800",
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.xs,
  },
  value: {
    color: "#0f172a",
    fontWeight: "900",
    fontFamily: FontFamilies.extrabold,
    fontSize: FontSizes.sm,
    lineHeight: 16,
  },
  meta: {
    marginTop: "auto",
    color: "#64748b",
    fontWeight: "700",
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.xs,
  },
});
