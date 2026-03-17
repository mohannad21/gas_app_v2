import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { FontFamilies, FontSizes } from "@/constants/typography";
import type { CompanySummary } from "@/hooks/useBalancesSummary";

type CompanyBalancesSectionProps = {
  companySummary: CompanySummary;
  companyBalancesReady: boolean;
  formatMoney: (value: number) => string;
  formatCount: (value: number) => string;
  containerStyle?: StyleProp<ViewStyle>;
};

type CompanySummaryBox = {
  label: string;
  value: string;
};

function formatSignedValue(value: number, formatter: (value: number) => string, suffix?: string) {
  const numeric = Number(value || 0);
  const sign = numeric > 0 ? "+" : numeric < 0 ? "-" : "";
  const formatted = formatter(Math.abs(numeric));
  return suffix ? `${sign}${formatted} ${suffix}` : `${sign}${formatted}`;
}

function buildCompanyBoxes(
  companySummary: CompanySummary,
  formatMoney: (value: number) => string,
  formatCount: (value: number) => string
): CompanySummaryBox[] {
  const moneyNet = companySummary.payCash > 0 ? companySummary.payCash : -companySummary.receiveCash;
  const cyl12Net = companySummary.receive12 > 0 ? companySummary.receive12 : -companySummary.give12;
  const cyl48Net = companySummary.receive48 > 0 ? companySummary.receive48 : -companySummary.give48;

  return [
    { label: "Wallet balance", value: formatSignedValue(moneyNet, formatMoney, "shekels") },
    { label: "12kg balance", value: formatSignedValue(cyl12Net, formatCount, "cyl") },
    { label: "48kg balance", value: formatSignedValue(cyl48Net, formatCount, "cyl") },
  ];
}

export default function CompanyBalancesSection({
  companySummary,
  companyBalancesReady,
  formatMoney,
  formatCount,
  containerStyle,
}: CompanyBalancesSectionProps) {
  const companyBoxes = buildCompanyBoxes(companySummary, formatMoney, formatCount);

  return (
    <View style={[styles.card, containerStyle]}>
      {companyBalancesReady ? (
        <>
          <View style={styles.row}>
            {companyBoxes.map((box) => (
              <View key={box.label} style={styles.box}>
                <Text style={styles.label}>{box.label}</Text>
                <Text style={styles.value}>{box.value}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.meta}>+ = you owe company. - = company owes you.</Text>
        </>
      ) : (
        <View style={styles.box}>
          <Text style={styles.label}>Wallet balance</Text>
          <Text style={styles.value}>Unavailable</Text>
        </View>
      )}
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
    minHeight: 78,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 4,
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
    lineHeight: 18,
  },
  meta: {
    color: "#64748b",
    fontWeight: "600",
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.xs,
  },
});
