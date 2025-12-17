import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CustomerType, GasType } from "@/types/domain";

export const gasTypes: GasType[] = ["12kg", "48kg"];
export const customerTypes: CustomerType[] = ["private", "industrial"];

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
  onInputChange: (gas: GasType, type: CustomerType, field: "selling" | "buying", value: string) => void;
  onSave: (gas: GasType, type: CustomerType) => void;
  canSave?: (gas: GasType, type: CustomerType) => boolean;
  saving?: boolean;
};

export function PriceMatrixSection({ gasType, inputs, onInputChange, onSave, canSave, saving }: Props) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{gasType}</Text>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableCell, styles.headerLabel]} />
        <Text style={[styles.tableCell, styles.headerLabel]}>Buying</Text>
        <Text style={[styles.tableCell, styles.headerLabel]}>Selling</Text>
        <Text style={[styles.tableCell, styles.headerLabel, styles.actionCell]}>Action</Text>
      </View>
      {customerTypes.map((type) => (
        <View key={`${gasType}-${type}`} style={styles.tableRow}>
          <Text style={styles.rowLabel}>{type}</Text>
          <View style={styles.inputGroup}>
            <TextInput
              style={[styles.input, styles.shortInput]}
              keyboardType="numeric"
              placeholder="Buy"
              value={inputs[type]?.buying ?? ""}
              onChangeText={(value) => onInputChange(gasType, type, "buying", value)}
            />
            <TextInput
              style={[styles.input, styles.shortInput]}
              keyboardType="numeric"
              placeholder="Sell"
              value={inputs[type]?.selling ?? ""}
              onChangeText={(value) => onInputChange(gasType, type, "selling", value)}
            />
          </View>
          <Pressable
            style={[
              styles.saveBtn,
              (saving || (canSave && !canSave(gasType, type))) && styles.disabled,
            ]}
            onPress={() => onSave(gasType, type)}
            disabled={saving || (canSave ? !canSave(gasType, type) : false)}
          >
            <Text style={[styles.saveText, (canSave && !canSave(gasType, type)) && styles.disabledText]}>
              {saving ? "Saving..." : "Save"}
            </Text>
          </Pressable>
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
    minWidth: 90,
    marginRight: 4,
  },
  input: {
    backgroundColor: "#f2f6fa",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d0d7de",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  shortInput: {
    width: 100,
  },
  inputGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  saveBtn: {
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: {
    color: "#fff",
    fontWeight: "700",
  },
  disabledText: {
    color: "#e0e0e0",
  },
  actionCell: {
    flex: 0.8,
  },
  disabled: {
    opacity: 0.6,
  },
});
