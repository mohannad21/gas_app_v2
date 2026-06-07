import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { FontFamilies, FontSizes } from "@/constants/typography";
import { getCurrencySymbol } from "@/lib/money";
import type { CompanySummary } from "@/hooks/useBalancesSummary";
import {
  BALANCE_SUMMARY_WORDING,
  getBalanceDirectionLabel,
  PAYMENT_DIRECTION_WORDING,
  REPORT_WORDING,
} from "@/lib/wording";

type CompanyBalancesSectionProps = {
  companySummary: CompanySummary;
  companyBalancesReady: boolean;
  formatMoney: (value: number) => string;
  formatCount: (value: number) => string;
  containerStyle?: StyleProp<ViewStyle>;
  initiallyExpanded?: boolean;
};

type CompanySummaryBox = {
  label: string;
  value: string;
  direction: string;
  rawValue: number;
};

function getCompanyBoxDirection(component: "money" | "cyl_12" | "cyl_48", value: number): string {
  if (value === 0) return PAYMENT_DIRECTION_WORDING.settled;
  return getBalanceDirectionLabel("company", value, component);
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
    {
      label: BALANCE_SUMMARY_WORDING.componentLabels.money,
      value: `${formatMoney(Math.abs(moneyNet))} ${getCurrencySymbol()}`,
      direction: getCompanyBoxDirection("money", moneyNet),
      rawValue: moneyNet,
    },
    {
      label: BALANCE_SUMMARY_WORDING.componentLabels.cyl12,
      value: `${formatCount(Math.abs(cyl12Net))} ${BALANCE_SUMMARY_WORDING.units.cylinderShort}`,
      direction: getCompanyBoxDirection("cyl_12", cyl12Net),
      rawValue: cyl12Net,
    },
    {
      label: BALANCE_SUMMARY_WORDING.componentLabels.cyl48,
      value: `${formatCount(Math.abs(cyl48Net))} ${BALANCE_SUMMARY_WORDING.units.cylinderShort}`,
      direction: getCompanyBoxDirection("cyl_48", cyl48Net),
      rawValue: cyl48Net,
    },
  ];
}

function getCompanyValueColor(box: CompanySummaryBox) {
  if (box.rawValue === 0) return "#0f172a";
  const companyDebtLabel = getBalanceDirectionLabel("company", 1, "money");
  return box.direction === companyDebtLabel ? "#b42318" : "#16a34a";
}

export default function CompanyBalancesSection({
  companySummary,
  companyBalancesReady,
  formatMoney,
  formatCount,
  containerStyle,
  initiallyExpanded = false,
}: CompanyBalancesSectionProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const companyBoxes = useMemo(
    () => buildCompanyBoxes(companySummary, formatMoney, formatCount),
    [companySummary, formatCount, formatMoney]
  );

  return (
    <View style={[styles.section, containerStyle]}>
      <Pressable style={styles.header} onPress={() => setExpanded((value) => !value)} accessibilityRole="button">
        <Text style={styles.headerTitle}>{REPORT_WORDING.sections.companyBalances}</Text>
        <Ionicons name={expanded ? "chevron-down" : "chevron-forward"} size={18} color="#0f172a" />
      </Pressable>
      {expanded ? (
        <View style={styles.content}>
          <View style={styles.row}>
            {(companyBalancesReady
              ? companyBoxes
              : companyBoxes.map((box) => ({
                  ...box,
                  value: REPORT_WORDING.states.unavailable,
                  direction: REPORT_WORDING.states.unavailable,
                  rawValue: 0,
                }))
            ).map((box) => (
              <View key={box.label} style={styles.box}>
                <Text style={styles.label}>{box.label}</Text>
                <Text style={[styles.value, { color: getCompanyValueColor(box) }]}>{box.value}</Text>
                <Text style={styles.meta}>{box.direction}</Text>
              </View>
            ))}
          </View>
          <Pressable
            style={[styles.adjustButton, !companyBalancesReady && styles.adjustButtonDisabled]}
            disabled={!companyBalancesReady}
            onPress={() => router.push("/inventory/company-balance-adjust")}
          >
            <Text style={styles.adjustButtonText}>{REPORT_WORDING.buttons.adjustBalances}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  headerTitle: {
    color: "#0f172a",
    fontWeight: "800",
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.sm,
  },
  content: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  adjustButton: {
    marginTop: 10,
    alignSelf: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#0a7ea4",
  },
  adjustButtonDisabled: {
    opacity: 0.5,
  },
  adjustButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.xs,
  },
  box: {
    flex: 1,
    minHeight: 88,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
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
    marginTop: "auto",
    color: "#64748b",
    fontWeight: "700",
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.xs,
  },
});
