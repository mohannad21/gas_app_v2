import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FontFamilies, FontSizes } from "@/constants/typography";
import { getCurrencySymbol } from "@/lib/money";
import { DailyReportCard } from "@/types/domain";

const formatMoney = (v: number) => `${getCurrencySymbol()}${Math.abs(Number(v || 0)).toFixed(0)}`;

type DaySummaryBoxProps = {
  card: DailyReportCard;
};

export default function DaySummaryBox({ card }: DaySummaryBoxProps) {
  const [expanded, setExpanded] = useState(false);
  const net = typeof card.net_today === "number" ? card.net_today : 0;
  const netLabel = `${net >= 0 ? "+" : "-"}${formatMoney(net)}`;
  const netColor = net > 0 ? "#0f766e" : net < 0 ? "#b91c1c" : "#64748b";
  const problems = Array.isArray(card.problems) ? card.problems : [];

  return (
    <View style={styles.box}>
      <Pressable style={styles.header} onPress={() => setExpanded((v) => !v)}>
        <Text style={styles.title}>Day summary</Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color="#64748b" />
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          <View style={styles.row}>
            <Text style={styles.label}>Net today</Text>
            <Text style={[styles.value, { color: netColor }]}>{netLabel}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>12kg sold</Text>
            <Text style={styles.value}>{card.sold_12kg ?? 0}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>48kg sold</Text>
            <Text style={styles.value}>{card.sold_48kg ?? 0}</Text>
          </View>
          {problems.length > 0 ? (
            <View style={styles.problemBlock}>
              {problems.map((line, i) => (
                <Text key={i} style={styles.problemLine} numberOfLines={2}>
                  ! {line}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={styles.allGood}>âœ… All settled</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  title: {
    fontSize: FontSizes.lg,
    fontFamily: FontFamilies.semibold,
    color: "#0f172a",
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  label: {
    fontSize: FontSizes.md,
    fontFamily: FontFamilies.regular,
    color: "#64748b",
  },
  value: {
    fontSize: FontSizes.md,
    fontFamily: FontFamilies.semibold,
    color: "#0f172a",
  },
  problemBlock: {
    marginTop: 4,
    gap: 3,
  },
  problemLine: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamilies.regular,
    color: "#b91c1c",
  },
  allGood: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamilies.regular,
    color: "#0f766e",
    marginTop: 4,
  },
});
