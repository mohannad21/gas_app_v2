import { MaterialCommunityIcons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Line, Path, Rect } from "react-native-svg";

import { FontFamilies, FontSizes } from "@/constants/typography";
import { DailyReportV2Card } from "@/types/domain";

function CylIcon({
  variant,
  size = 18,
  color,
}: {
  variant: "12kg" | "48kg";
  size?: number;
  color: string;
}) {
  const isLarge = variant === "48kg";
  const h = size * 2;
  return (
    <Svg width={size * 0.55} height={h} viewBox="0 0 100 200" preserveAspectRatio="xMidYMax meet" color={color}>
      {isLarge ? (
        <>
          <Rect x="15" y="50" width="70" height="130" rx="10" fill="#B7D7E8" stroke={color} strokeWidth="4" />
          <Line x1="15" y1="115" x2="85" y2="115" stroke={color} strokeWidth="3" />
          <Path d="M30 50V35C30 30 35 25 40 25H60C65 25 70 30 70 35V50" fill="none" stroke={color} strokeWidth="4" />
          <Rect x="25" y="180" width="50" height="10" rx="2" fill={color} />
        </>
      ) : (
        <>
          <Rect x="20" y="115" width="60" height="65" rx="10" fill="#B7D7E8" stroke={color} strokeWidth="4" />
          <Line x1="20" y1="147" x2="80" y2="147" stroke={color} strokeWidth="3" />
          <Path d="M35 115V100C35 97 38 95 40 95H60C62 95 65 97 65 100V115" fill="none" stroke={color} strokeWidth="4" />
          <Rect x="30" y="180" width="40" height="10" rx="2" fill={color} />
        </>
      )}
    </Svg>
  );
}

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
  const dayName = d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const dayNum = d.getDate();
  const net = typeof item.net_today === "number" ? item.net_today : 0;
  const netStr = `${net >= 0 ? "+" : ""}₪${Math.abs(net)}`;
  const cylColor = selected ? "#fff" : "#0f172a";

  const netColor = selected ? "#fff" : net > 0 ? "#0f766e" : net < 0 ? "#b91c1c" : "#64748b";

  return (
    <Pressable
      onPress={() => onSelect(item.date)}
      style={[styles.card, selected && styles.cardSelected]}
      testID={`day-card-${item.date}`}
    >
      <View style={styles.topRow} testID={`day-card-top-${item.date}`}>
        <View style={styles.cylRow}>
          <CylIcon variant="12kg" size={14} color={cylColor} />
          <Text style={[styles.cylCount, { color: cylColor }]}>{item.sold_12kg ?? 0}</Text>
        </View>
        <Text style={[styles.netText, { color: netColor }]}>{netStr}</Text>
      </View>

      <View style={styles.centerBlock} testID={`day-card-center-${item.date}`}>
        <Text style={[styles.dayName, selected && styles.textWhite]}>{dayName}</Text>
        <Text style={[styles.dayNum, selected && styles.textWhite]}>{dayNum}</Text>
      </View>

      <View style={styles.bottomRow} testID={`day-card-bottom-${item.date}`}>
        <View style={styles.cylRow}>
          <CylIcon variant="48kg" size={14} color={cylColor} />
          <Text style={[styles.cylCount, { color: cylColor }]}>{item.sold_48kg ?? 0}</Text>
        </View>
        {item.has_refill ? (
          <MaterialCommunityIcons name="truck-delivery" size={16} color={selected ? "#fff" : "#f59e0b"} />
        ) : (
          <View style={styles.truckPlaceholder} />
        )}
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
    gap: 4,
  },
  cardSelected: {
    backgroundColor: "#0a7ea4",
    borderColor: "#0a7ea4",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 26,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 26,
  },
  centerBlock: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    paddingVertical: 6,
  },
  cylRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cylCount: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamilies.semibold,
    color: "#0f172a",
  },
  netText: {
    fontSize: FontSizes.sm,
    fontFamily: FontFamilies.semibold,
  },
  dayName: {
    fontSize: FontSizes.xs,
    fontFamily: FontFamilies.semibold,
    color: "#64748b",
    letterSpacing: 0.5,
  },
  dayNum: {
    fontSize: FontSizes.title,
    fontFamily: FontFamilies.extrabold,
    color: "#0f172a",
    lineHeight: 28,
  },
  textWhite: {
    color: "#fff",
  },
  truckPlaceholder: {
    width: 18,
    height: 18,
  },
});
