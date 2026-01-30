import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { gasColor } from "@/constants/gas";
import { FontFamilies, FontSizes } from "@/constants/typography";
import { Spacing } from "@/constants/spacing";

type BalanceBucket = { count: number; total: number };
export type BalanceSummary = {
  money: { receivable: BalanceBucket; payable: BalanceBucket };
  cyl12: { receivable: BalanceBucket; payable: BalanceBucket };
  cyl48: { receivable: BalanceBucket; payable: BalanceBucket };
};

export type CompanySummary = {
  give12: number;
  receive12: number;
  give48: number;
  receive48: number;
  payCash: number;
  receiveCash: number;
};

type BalancesCardProps = {
  balanceSummary: BalanceSummary;
  companySummary: CompanySummary;
  formatCustomerCount: (count: number) => string;
  formatMoney: (value: number) => string;
  formatCount: (value: number) => string;
  collapsed?: boolean;
  onToggle?: () => void;
};

export default function BalancesCard({
  balanceSummary,
  companySummary,
  formatCustomerCount,
  formatMoney,
  formatCount,
  collapsed = false,
  onToggle,
}: BalancesCardProps) {
  const content = (
    <>
      <View style={styles.headerRow}>
        <Text style={styles.topSummaryTitle}>Balances</Text>
        {onToggle ? (
          <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={16} color="#0a7ea4" />
        ) : null}
      </View>
      {collapsed ? null : (
        <View style={styles.balanceSplitRow}>
          <View style={styles.balanceColumn}>
            <Text style={styles.balancePanelTitle}>Customers</Text>
              <Text style={styles.relationshipLine}>
                <Text style={{ color: gasColor("12kg") }}>12kg</Text>: you give{" "}
                {formatCustomerCount(balanceSummary.cyl12.payable.count)}{" "}
                {formatCount(balanceSummary.cyl12.payable.total)}
              </Text>
              <Text style={styles.relationshipLine}>
                <Text style={{ color: gasColor("12kg") }}>12kg</Text>:{" "}
                {formatCustomerCount(balanceSummary.cyl12.receivable.count)} give you{" "}
                {formatCount(balanceSummary.cyl12.receivable.total)}
              </Text>
              <Text style={styles.relationshipLine}>
                <Text style={{ color: gasColor("48kg") }}>48kg</Text>: you give{" "}
                {formatCustomerCount(balanceSummary.cyl48.payable.count)}{" "}
                {formatCount(balanceSummary.cyl48.payable.total)}
              </Text>
              <Text style={styles.relationshipLine}>
                <Text style={{ color: gasColor("48kg") }}>48kg</Text>:{" "}
                {formatCustomerCount(balanceSummary.cyl48.receivable.count)} give you{" "}
                {formatCount(balanceSummary.cyl48.receivable.total)}
              </Text>
              <Text style={styles.relationshipLine}>
                cash: you pay {formatCustomerCount(balanceSummary.money.payable.count)}{" "}
                {formatMoney(balanceSummary.money.payable.total)}
              </Text>
              <Text style={styles.relationshipLine}>
                cash: {formatCustomerCount(balanceSummary.money.receivable.count)} pay you{" "}
                {formatMoney(balanceSummary.money.receivable.total)}
              </Text>
          </View>
          <View style={styles.balanceColumn}>
            <Text style={styles.balancePanelTitle}>Cmpny</Text>
            <Text style={styles.relationshipLine}>
              <Text style={{ color: gasColor("12kg") }}>12kg</Text>: you give cmpny{" "}
              {formatCount(companySummary.give12)}
            </Text>
            <Text style={styles.relationshipLine}>
              <Text style={{ color: gasColor("12kg") }}>12kg</Text>: cmpny gives you{" "}
              {formatCount(companySummary.receive12)}
            </Text>
            <Text style={styles.relationshipLine}>
              <Text style={{ color: gasColor("48kg") }}>48kg</Text>: you give cmpny{" "}
              {formatCount(companySummary.give48)}
            </Text>
            <Text style={styles.relationshipLine}>
              <Text style={{ color: gasColor("48kg") }}>48kg</Text>: cmpny gives you{" "}
              {formatCount(companySummary.receive48)}
            </Text>
            <Text style={styles.relationshipLine}>
              cash: you pay cmpny {formatMoney(companySummary.payCash)}
            </Text>
            <Text style={styles.relationshipLine}>
              cash: cmpny pays you {formatMoney(companySummary.receiveCash)}
            </Text>
          </View>
        </View>
      )}
    </>
  );

  if (onToggle) {
    return (
      <Pressable onPress={onToggle} style={[styles.topSummaryCard, styles.balancesCard]}>
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.topSummaryCard, styles.balancesCard]}>{content}</View>;
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
  balanceColumn: { flex: 1, gap: Spacing.md },
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
});
