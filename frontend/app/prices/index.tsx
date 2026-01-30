import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { usePriceSettings } from "@/hooks/usePrices";
import { GasType, PriceSetting } from "@/types/domain";
import { gasTypes } from "@/components/PriceMatrix";
import { gasColor } from "@/constants/gas";

export default function PricesScreen() {
  const { data, isLoading, error } = usePriceSettings();
  const groupedPrices = useMemo(
    () =>
      gasTypes.reduce((acc, gas) => {
        acc[gas] = (data ?? []).filter((entry) => entry.gas_type === gas);
        return acc;
      }, {} as Record<GasType, PriceSetting[]>),
    [data]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Gas Price Settings</Text>
      {isLoading && <Text style={styles.meta}>Loading…</Text>}
      {error && <Text style={styles.error}>Failed to load prices</Text>}

      <Text style={[styles.label, { marginTop: 18 }]}>Current prices</Text>
      {gasTypes.map((gas) => (
        <View key={`group-${gas}`} style={styles.priceGroup}>
          <Text style={[styles.sectionHeader, { color: gasColor(gas) }]}>{gas}</Text>
          {(groupedPrices[gas] ?? []).map((p) => (
            <View key={p.id} style={styles.priceRow}>
              <Text style={styles.meta}>
                Sell ${p.selling_price}
                {p.buying_price ? ` • Buy $${p.buying_price}` : ""}
              </Text>
              <Text style={styles.meta}>From {p.effective_from}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f7f7f8",
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  label: {
    fontWeight: "700",
    marginTop: 12,
  },
  meta: {
    color: "#444",
  },
  error: {
    color: "#b00020",
  },
  priceRow: {
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 10,
    marginTop: 6,
    gap: 2,
  },
  priceGroup: {
    marginTop: 12,
  },
  sectionHeader: {
    fontWeight: "700",
    marginBottom: 4,
  },
});
