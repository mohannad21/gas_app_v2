import { StyleSheet, Text, TextInput, View } from "react-native";
import { CustomerType, GasType } from "@/types/domain";
import { gasColor } from "@/constants/gas";

export const gasTypes: GasType[] = ["12kg", "48kg"];
export const customerTypes: CustomerType[] = ["private", "industrial"];
const customerLabels: Record<CustomerType, string> = {
  private: "pri",
  industrial: "ind",
  other: "oth",
};

export type PriceInputs = Record<
  GasType,
  Record<CustomerType, { selling: string; buying: string }>
>;

export function createDefaultPriceInputs(): PriceInputs {
  return gasTypes.reduce((acc, gas) => {
    acc[gas] = customerTypes.reduce(
      (inner, type) => ({
        ...inner,
        [type]: { selling: "", buying: "" },
      }),
      {} as Record<CustomerType, { selling: string; buying: string }>
    );
    return acc;
  }, {} as PriceInputs);
}

type Props = {
  gasType: GasType;
  inputs: Record<CustomerType, { selling: string; buying: string }>;
  previousInputs?: Record<CustomerType, { selling: string; buying: string }>;
  onInputChange: (gas: GasType, type: CustomerType, field: "selling" | "buying", value: string) => void;
};

export function PriceMatrixSection({ gasType, inputs, previousInputs, onInputChange }: Props) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: gasColor(gasType) }]}>{gasType}</Text>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableCell, styles.headerLabel, styles.labelCell]} />
        <Text style={[styles.tableCell, styles.headerLabel, styles.inputCell]}>Buy</Text>
        <Text style={[styles.tableCell, styles.headerLabel, styles.inputCell]}>Sell</Text>
      </View>
      {customerTypes.map((type) => (
        <View key={`${gasType}-${type}`} style={styles.tableRow}>
          <Text style={[styles.rowLabel, styles.labelCell]}>{customerLabels[type] ?? type}</Text>
          <View style={[styles.inputCell, styles.inputStack]}>
            <Text style={styles.oldValue}>
              Old {previousInputs?.[type]?.buying?.trim() ? previousInputs[type].buying : "-"}
            </Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder="Buy"
              value={inputs[type]?.buying ?? ""}
              onChangeText={(value) => onInputChange(gasType, type, "buying", value)}
            />
          </View>
          <View style={[styles.inputCell, styles.inputStack]}>
            <Text style={styles.oldValue}>
              Old {previousInputs?.[type]?.selling?.trim() ? previousInputs[type].selling : "-"}
            </Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder="Sell"
              value={inputs[type]?.selling ?? ""}
              onChangeText={(value) => onInputChange(gasType, type, "selling", value)}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  sectionTitle: {
    fontWeight: "700",
    fontSize: 16,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    flexWrap: "nowrap",
  },
  tableCell: {
    flex: 1,
    fontSize: 12,
  },
  headerLabel: {
    color: "#666",
    fontWeight: "700",
  },
  rowLabel: {
    fontWeight: "700",
    textTransform: "lowercase",
  },
  labelCell: {
    flexBasis: 44,
    flexGrow: 0,
    flexShrink: 0,
  },
  inputCell: {
    flexBasis: 96,
    flexGrow: 1,
    flexShrink: 1,
  },
  inputStack: {
    gap: 4,
  },
  oldValue: {
    fontSize: 10,
    color: "#6b7280",
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#f2f6fa",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d0d7de",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
