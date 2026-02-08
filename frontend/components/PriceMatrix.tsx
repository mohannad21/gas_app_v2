import { StyleSheet, Text, TextInput, View } from "react-native";
import { GasType } from "@/types/domain";
import { gasColor } from "@/constants/gas";

export const gasTypes: GasType[] = ["12kg", "48kg"];

export type PriceInputs = Record<
  GasType,
  { selling: string; buying: string; selling_iron: string; buying_iron: string }
>;

export function createDefaultPriceInputs(): PriceInputs {
  return gasTypes.reduce((acc, gas) => {
    acc[gas] = { selling: "", buying: "", selling_iron: "", buying_iron: "" };
    return acc;
  }, {} as PriceInputs);
}

type Props = {
  gasType: GasType;
  inputs: { selling: string; buying: string; selling_iron: string; buying_iron: string };
  previousInputs?: { selling: string; buying: string; selling_iron: string; buying_iron: string };
  onInputChange: (
    gas: GasType,
    field: "selling" | "buying" | "selling_iron" | "buying_iron",
    value: string
  ) => void;
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
      <View key={`${gasType}-prices`} style={styles.tableRow}>
        <Text style={[styles.rowLabel, styles.labelCell]}>gas</Text>
        <View style={[styles.inputCell, styles.inputStack]}>
          <Text style={styles.oldValue}>
            Old {previousInputs?.buying?.trim() ? previousInputs.buying : "-"}
          </Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder="Buy"
            value={inputs.buying ?? ""}
            onChangeText={(value) => onInputChange(gasType, "buying", value)}
          />
        </View>
        <View style={[styles.inputCell, styles.inputStack]}>
          <Text style={styles.oldValue}>
            Old {previousInputs?.selling?.trim() ? previousInputs.selling : "-"}
          </Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder="Sell"
            value={inputs.selling ?? ""}
            onChangeText={(value) => onInputChange(gasType, "selling", value)}
          />
        </View>
      </View>
      <View key={`${gasType}-iron-prices`} style={styles.tableRow}>
        <Text style={[styles.rowLabel, styles.labelCell]}>iron</Text>
        <View style={[styles.inputCell, styles.inputStack]}>
          <Text style={styles.oldValue}>
            Old {previousInputs?.buying_iron?.trim() ? previousInputs.buying_iron : "-"}
          </Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder="Buy"
            value={inputs.buying_iron ?? ""}
            onChangeText={(value) => onInputChange(gasType, "buying_iron", value)}
          />
        </View>
        <View style={[styles.inputCell, styles.inputStack]}>
          <Text style={styles.oldValue}>
            Old {previousInputs?.selling_iron?.trim() ? previousInputs.selling_iron : "-"}
          </Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder="Sell"
            value={inputs.selling_iron ?? ""}
            onChangeText={(value) => onInputChange(gasType, "selling_iron", value)}
          />
        </View>
      </View>
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
