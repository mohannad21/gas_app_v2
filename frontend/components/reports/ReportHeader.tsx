import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Line, Path, Rect } from "react-native-svg";
import { FontFamilies, FontSizes } from "@/constants/typography";
import { Spacing } from "@/constants/spacing";

type ReportHeaderProps = {
  inventory: {
    full12: string;
    empty12: string;
    full48: string;
    empty48: string;
  };
  cashEnd: string;
  onAdjustInventory: () => void;
  onAdjustCash: () => void;
};

export default function ReportHeader({
  inventory,
  cashEnd,
  onAdjustInventory,
  onAdjustCash,
}: ReportHeaderProps) {
  return (
    <View style={styles.stickyHeaderContent}>
      <View style={styles.headerRow}>
        <InventoryTile value={inventory.full12} gas="12kg" filled />
        <InventoryTile value={inventory.empty12} gas="12kg" filled={false} />
        <InventoryTile value={inventory.full48} gas="48kg" filled />
        <InventoryTile value={inventory.empty48} gas="48kg" filled={false} />
        <CashTile value={cashEnd} />
      </View>
      <View style={styles.adjustButtonRow}>
        <TouchableOpacity onPress={onAdjustInventory} activeOpacity={0.85} style={styles.adjustButton}>
          <Text style={styles.adjustButtonText}>Adjust Inventory</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onAdjustCash} activeOpacity={0.85} style={styles.adjustButton}>
          <Text style={styles.adjustButtonText}>Adjust Wallet</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CylinderIcon({ variant, filled }: { variant: "12kg" | "48kg"; filled: boolean }) {
  const fillColor = filled ? "#B7D7E8" : "transparent";
  const isLarge = variant === "48kg";
  const width = 26;
  const height = 52;
  const viewBox = "0 0 100 200";

  return (
    <View style={styles.cylinderBox}>
      <Svg width={width} height={height} viewBox={viewBox} preserveAspectRatio="xMidYMax meet">
        {isLarge ? (
          <>
            <Rect x="15" y="50" width="70" height="130" rx="10" fill={fillColor} stroke="black" strokeWidth="4" />
            <Line x1="15" y1="115" x2="85" y2="115" stroke="black" strokeWidth="3" />
            <Path
              d="M30 50V35C30 30 35 25 40 25H60C65 25 70 30 70 35V50"
              fill="none"
              stroke="black"
              strokeWidth="4"
            />
            <Rect x="25" y="180" width="50" height="10" rx="2" fill="black" />
          </>
        ) : (
          <>
            <Rect x="20" y="115" width="60" height="65" rx="10" fill={fillColor} stroke="black" strokeWidth="4" />
            <Line x1="20" y1="147" x2="80" y2="147" stroke="black" strokeWidth="3" />
            <Path
              d="M35 115V100C35 97 38 95 40 95H60C62 95 65 97 65 100V115"
              fill="none"
              stroke="black"
              strokeWidth="4"
            />
            <Rect x="30" y="180" width="40" height="10" rx="2" fill="black" />
          </>
        )}
      </Svg>
    </View>
  );
}

function InventoryTile({ value, gas, filled }: { value: string; gas: "12kg" | "48kg"; filled: boolean }) {
  return (
    <View style={styles.inventoryTile}>
      <CylinderIcon variant={gas} filled={filled} />
      <Text style={styles.inventoryValue}>{value}</Text>
    </View>
  );
}

function CashTile({ value }: { value: string }) {
  return (
    <View style={styles.inventoryTile}>
      <Ionicons name="logo-usd" size={20} color="#0a7ea4" />
      <Text style={styles.inventoryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stickyHeaderContent: { flex: 1, gap: Spacing.sm },
  headerRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: Spacing.md,
  },
  inventoryTile: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.sm,
    minHeight: 74,
  },
  inventoryValue: {
    fontSize: FontSizes.sm,
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 2,
    fontFamily: FontFamilies.extrabold,
  },
  cylinderBox: {
    height: 44,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  adjustButtonRow: { marginTop: Spacing.sm, flexDirection: "row", gap: Spacing.md },
  adjustButton: {
    flex: 1,
    marginTop: 0,
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
    paddingVertical: Spacing.lg,
    alignItems: "center",
  },
  adjustButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontFamily: FontFamilies.bold,
    fontSize: FontSizes.md,
  },
});

