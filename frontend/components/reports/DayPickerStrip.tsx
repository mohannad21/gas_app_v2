import { MaterialCommunityIcons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { FontFamilies, FontSizes } from "@/constants/typography";
import { DailyReportV2Card } from "@/types/domain";

type DayPickerStripProps = {
  rows: DailyReportV2Card[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
};

const DayCard = memo(function DayCard({
  item,
  selected,
  onSelect,
}: {
  item: DailyReportV2Card;
  selected: boolean;
  onSelect: (date: string) => void;
}) {
  const d = new Date(item.date + "T00:00:00");
  const dayNum = d.getDate();
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const net = typeof item.net_today === "number" ? item.net_today : 0;
  const netStr = `${net >= 0 ? "+" : ""}₪${Math.abs(net)}`;
  const netColor = selected ? "#fff" : net > 0 ? "#0f766e" : net < 0 ? "#b91c1c" : "#64748b";
  const metricBoxStyle = selected ? styles.metricBoxSelected : styles.metricBox;
  const metricLabelStyle = selected ? styles.metricLabelSelected : styles.metricLabel;
  const metricValueStyle = selected ? styles.metricValueSelected : styles.metricValue;

  return (
    <Pressable
      onPress={() => onSelect(item.date)}
      style={[styles.card, selected && styles.cardSelected]}
      testID={`day-card-${item.date}`}
    >
      <View style={styles.topBlock} testID={`day-card-top-${item.date}`}>
        <Text style={[styles.dayNum, selected && styles.textWhite]}>{dayNum}</Text>
        <Text style={[styles.monthText, selected && styles.textWhite]}>{month}</Text>
      </View>

      <View style={styles.centerSpacer} testID={`day-card-center-${item.date}`} />

      <View style={styles.bottomBlock} testID={`day-card-bottom-${item.date}`}>
        <View style={styles.metricsColumn}>
          <View style={metricBoxStyle}>
            <Text style={metricLabelStyle}>12kg</Text>
            <Text style={metricValueStyle}>{item.sold_12kg ?? 0}</Text>
          </View>
          <View style={metricBoxStyle}>
            <Text style={metricLabelStyle}>48kg</Text>
            <Text style={metricValueStyle}>{item.sold_48kg ?? 0}</Text>
          </View>
          <View style={metricBoxStyle}>
            <Text style={metricLabelStyle}>Net</Text>
            <Text style={[metricValueStyle, { color: netColor }]} numberOfLines={1}>
              {netStr}
            </Text>
          </View>
        </View>
        <View style={styles.refillRow}>
          <View style={styles.refillSpacer} />
          {item.has_refill ? (
            <MaterialCommunityIcons name="truck-delivery" size={16} color={selected ? "#fff" : "#f59e0b"} />
          ) : (
            <View style={styles.truckPlaceholder} />
          )}
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
    height: 140,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 8,
    paddingVertical: 10,
    justifyContent: "space-between",
    gap: 8,
  },
  cardSelected: {
    backgroundColor: "#0a7ea4",
    borderColor: "#0a7ea4",
  },
  topBlock: {
    alignItems: "flex-start",
    gap: 2,
  },
  dayNum: {
    fontSize: FontSizes.title,
    fontFamily: FontFamilies.extrabold,
    color: "#0f172a",
    lineHeight: 28,
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
    gap: 8,
  },
  metricsColumn: {
    gap: 4,
  },
  metricBox: {
    minHeight: 26,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  metricBoxSelected: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.28)",
  },
  metricLabel: {
    fontSize: 9,
    lineHeight: 10,
    color: "#64748b",
    fontFamily: FontFamilies.semibold,
  },
  metricLabelSelected: {
    color: "rgba(255,255,255,0.78)",
  },
  metricValue: {
    fontSize: 11,
    lineHeight: 13,
    color: "#0f172a",
    fontFamily: FontFamilies.extrabold,
  },
  metricValueSelected: {
    color: "#fff",
  },
  refillRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 18,
  },
  refillSpacer: {
    flex: 1,
  },
  textWhite: {
    color: "#fff",
  },
  truckPlaceholder: {
    width: 18,
    height: 18,
  },
});
