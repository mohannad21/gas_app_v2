import { MaterialCommunityIcons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { FontFamilies, FontSizes } from "@/constants/typography";
import { getCurrencySymbol } from "@/lib/money";
import { DailyReportCard } from "@/types/domain";

type DayPickerStripProps = {
  rows: DailyReportCard[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
};

const DayCard = memo(function DayCard({
  item,
  selected,
  onSelect,
}: {
  item: DailyReportCard;
  selected: boolean;
  onSelect: (date: string) => void;
}) {
  const d = new Date(item.date + "T00:00:00");
  const dayNum = d.getDate();
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const net = typeof item.net_today === "number" ? item.net_today : 0;
  const netStr = `${net >= 0 ? "+" : ""}${getCurrencySymbol()}${Math.abs(net)}`;
  const netColor = net > 0 ? "#0f766e" : net < 0 ? "#b91c1c" : "#64748b";
  const dayNumStyle = selected ? [styles.dayNum, styles.textAccent] : styles.dayNum;
  const monthStyle = selected ? [styles.monthText, styles.textAccentSoft] : styles.monthText;

  return (
    <Pressable
      onPress={() => onSelect(item.date)}
      style={[styles.card, selected && styles.cardSelected]}
      testID={`day-card-${item.date}`}
    >
      <View style={styles.topRow} testID={`day-card-top-${item.date}`}>
        <View style={styles.topBlock}>
          <Text style={dayNumStyle}>{dayNum}</Text>
          <Text style={monthStyle}>{month}</Text>
        </View>
        {item.has_refill ? (
          <MaterialCommunityIcons name="truck-delivery" size={16} color={selected ? "#0a7ea4" : "#f59e0b"} />
        ) : (
          <View style={styles.truckPlaceholder} />
        )}
      </View>

      <View style={styles.centerSpacer} testID={`day-card-center-${item.date}`} />

      <View style={styles.bottomBlock} testID={`day-card-bottom-${item.date}`}>
        <View style={styles.metricsColumn}>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>12kg</Text>
            <Text style={styles.metricValue}>{item.sold_12kg ?? 0}</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>48kg</Text>
            <Text style={styles.metricValue}>{item.sold_48kg ?? 0}</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Net</Text>
            <Text style={[styles.metricValue, { color: netColor }]} numberOfLines={1}>
              {netStr}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
});

export default function DayPickerStrip({ rows, selectedDate, onSelect }: DayPickerStripProps) {
  return (
    <View style={{ height: 180, backgroundColor: "#fff" }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.strip}
      >
        {rows.map((item) => (
          <DayCard key={item.date} item={item} selected={item.date === selectedDate} onSelect={onSelect} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    height: 170,
  },
  strip: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 20,
    gap: 8,
  },
  card: {
    width: 90,
    height: 136,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: "space-between",
    gap: 4,
  },
  cardSelected: {
    borderColor: "#0a7ea4",
    borderWidth: 2,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    minHeight: 18,
  },
  topBlock: {
    alignItems: "flex-start",
    gap: 1,
  },
  dayNum: {
    fontSize: FontSizes.title,
    fontFamily: FontFamilies.extrabold,
    color: "#0f172a",
    lineHeight: 24,
  },
  monthText: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamilies.semibold,
    color: "#64748b",
    textTransform: "uppercase",
  },
  centerSpacer: {
    flex: 1,
  },
  bottomBlock: {
    gap: 2,
  },
  metricsColumn: {
    gap: 1,
  },
  metricRow: {
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  metricLabel: {
    fontSize: 9,
    lineHeight: 9,
    color: "#64748b",
    fontFamily: FontFamilies.semibold,
  },
  metricValue: {
    fontSize: 11,
    lineHeight: 11,
    color: "#0f172a",
    fontFamily: FontFamilies.extrabold,
  },
  textAccent: {
    color: "#0a7ea4",
  },
  textAccentSoft: {
    color: "#0369a1",
  },
  truckPlaceholder: {
    width: 16,
    height: 16,
  },
});
