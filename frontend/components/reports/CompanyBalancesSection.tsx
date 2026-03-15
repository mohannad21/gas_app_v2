import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { FontFamilies, FontSizes } from "@/constants/typography";
import type { CompanySummary } from "@/hooks/useBalancesSummary";
import { formatCurrentBalanceState } from "@/lib/balanceTransitions";
import CollapsibleSectionCard from "@/components/reports/CollapsibleSectionCard";

type CompanyBalancesSectionProps = {
  companySummary: CompanySummary;
  companyBalancesReady: boolean;
  formatMoney: (value: number) => string;
  formatCount: (value: number) => string;
  collapsed?: boolean;
  onToggle?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
};

function buildCompanyLines(companySummary: CompanySummary, formatMoney: (value: number) => string) {
  const moneyNet = companySummary.payCash > 0 ? companySummary.payCash : -companySummary.receiveCash;
  const cyl12Net = companySummary.receive12 > 0 ? companySummary.receive12 : -companySummary.give12;
  const cyl48Net = companySummary.receive48 > 0 ? companySummary.receive48 : -companySummary.give48;

  const lines = [
    moneyNet !== 0 ? formatCurrentBalanceState("company", "money", moneyNet, { formatMoney }) : null,
    cyl12Net !== 0 ? formatCurrentBalanceState("company", "cyl_12", cyl12Net, { formatMoney }) : null,
    cyl48Net !== 0 ? formatCurrentBalanceState("company", "cyl_48", cyl48Net, { formatMoney }) : null,
  ].filter(Boolean) as string[];

  return lines.length > 0 ? lines : ["All settled"];
}

export default function CompanyBalancesSection({
  companySummary,
  companyBalancesReady,
  formatMoney,
  formatCount,
  collapsed = false,
  onToggle,
  containerStyle,
}: CompanyBalancesSectionProps) {
  const companyLines = buildCompanyLines(companySummary, formatMoney);

  return (
    <CollapsibleSectionCard
      title="Company Balances"
      collapsed={collapsed}
      onToggle={onToggle ?? (() => undefined)}
      containerStyle={[styles.card, containerStyle]}
      titleStyle={styles.title}
    >
      <View style={styles.content}>
        {!companyBalancesReady ? (
          <Text style={styles.line}>Current company balances unavailable</Text>
        ) : (
          companyLines.map((line) => (
            <Text key={line} style={styles.line}>
              {line}
            </Text>
          ))
        )}
        {companyBalancesReady ? (
          <Text style={styles.meta}>
            12kg {formatCount(companySummary.receive12 + companySummary.give12)} | 48kg{" "}
            {formatCount(companySummary.receive48 + companySummary.give48)}
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
