import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { usePriceSettings, useSavePriceSetting } from "@/hooks/usePrices";
import PriceInputForm, { PriceFormValues } from "@/components/PriceInputForm";

const DEFAULT_VALUES: PriceFormValues = {
  sell12: 0, sell48: 0,
  buy12: 0, buy48: 0,
  buyIron12: 0, buyIron48: 0,
  companyIron12: 0, companyIron48: 0,
  sellIron12: 0, sellIron48: 0,
};

export default function PricesConfigurationScreen() {
  const router = useRouter();
  const pricesQuery = usePriceSettings();
  const savePriceMutation = useSavePriceSetting();
  const [values, setValues] = useState<PriceFormValues>(DEFAULT_VALUES);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!pricesQuery.data) return;
    const find = (gas: "12kg" | "48kg") =>
      pricesQuery.data!
        .filter((p) => p.gas_type === gas)
        .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
    const p12 = find("12kg");
    const p48 = find("48kg");
    setValues({
      sell12: p12?.selling_price ?? 0,
      sell48: p48?.selling_price ?? 0,
      buy12: p12?.buying_price ?? 0,
      buy48: p48?.buying_price ?? 0,
      buyIron12: p12?.buying_iron_price ?? 0,
      buyIron48: p48?.buying_iron_price ?? 0,
      companyIron12: p12?.company_iron_price ?? 0,
      companyIron48: p48?.company_iron_price ?? 0,
      sellIron12: p12?.selling_iron_price ?? 0,
      sellIron48: p48?.selling_iron_price ?? 0,
    });
  }, [pricesQuery.data]);

  function handleChange(key: keyof PriceFormValues, value: number) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!values.sell12 || values.sell12 <= 0) {
      setFormError("Enter a valid 12kg selling price.");
      return;
    }
    if (!values.sell48 || values.sell48 <= 0) {
      setFormError("Enter a valid 48kg selling price.");
      return;
    }
    setFormError(null);
    try {
      await savePriceMutation.mutateAsync({
        gas_type: "12kg",
        selling_price: values.sell12,
        buying_price: values.buy12,
        buying_iron_price: values.buyIron12,
        company_iron_price: values.companyIron12,
        selling_iron_price: values.sellIron12,
      });
      await savePriceMutation.mutateAsync({
        gas_type: "48kg",
        selling_price: values.sell48,
        buying_price: values.buy48,
        buying_iron_price: values.buyIron48,
        company_iron_price: values.companyIron48,
        selling_iron_price: values.sellIron48,
      });
    } catch {
      // Error toast handled by mutation hook.
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>{"<"}</Text>
          </Pressable>
          <Text style={styles.title}>Prices</Text>
          <View style={styles.backButtonSpacer} />
        </View>

        {pricesQuery.isLoading ? (
          <View style={styles.centerCard}>
            <ActivityIndicator size="small" color="#0a7ea4" />
            <Text style={styles.meta}>Loading prices...</Text>
          </View>
        ) : null}

        {pricesQuery.isError ? (
          <View style={styles.centerCard}>
            <Text style={styles.errorText}>Could not load prices.</Text>
          </View>
        ) : null}

        {!pricesQuery.isLoading && !pricesQuery.isError ? (
          <PriceInputForm
            values={values}
            onChange={handleChange}
            disabled={savePriceMutation.isPending}
          />
        ) : null}

        {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.primaryButton, savePriceMutation.isPending && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={savePriceMutation.isPending || pricesQuery.isLoading}
        >
          {savePriceMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Save Prices</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f6f7f9" },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 112, gap: 0 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  backButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  backButtonText: { fontSize: 20, color: "#111" },
  backButtonSpacer: { width: 36, height: 36 },
  title: { fontSize: 26, fontFamily: "NunitoSans-Bold" },
  centerCard: { backgroundColor: "#fff", borderRadius: 12, paddingVertical: 24, paddingHorizontal: 16, alignItems: "center", gap: 10 },
  meta: { color: "#64748b", fontSize: 13, fontFamily: "NunitoSans-Regular" },
  errorText: { color: "#b00020", fontSize: 14, fontFamily: "NunitoSans-SemiBold", marginTop: 8 },
  footer: { position: "absolute", left: 20, right: 20, bottom: 24 },
  primaryButton: { backgroundColor: "#0a7ea4", borderRadius: 12, paddingVertical: 15, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontSize: 16, fontFamily: "NunitoSans-Bold" },
  buttonDisabled: { opacity: 0.6 },
});
