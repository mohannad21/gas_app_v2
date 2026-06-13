import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";

import { AppColors } from "@/constants/colors";
import {
  DEFAULT_PRICE_FORM_VALUES,
  PRICE_FAMILY_TABS,
  PRICE_SECTIONS,
  PRICE_SECTION_TABS,
  type PriceFamilyKey,
  type PriceFormValues,
  type PriceSectionKey,
} from "@/constants/prices";
import { usePriceSettings, useSavePriceSetting } from "@/hooks/usePrices";
import PriceInputForm from "@/components/PriceInputForm";

export default function PricesConfigurationScreen() {
  const pricesQuery = usePriceSettings();
  const savePriceMutation = useSavePriceSetting();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const [values, setValues] = useState<PriceFormValues>(DEFAULT_PRICE_FORM_VALUES);
  const [savedValues, setSavedValues] = useState<PriceFormValues>(DEFAULT_PRICE_FORM_VALUES);
  const [formError, setFormError] = useState<string | null>(null);
  const [activeFamily, setActiveFamily] = useState<PriceFamilyKey>("gas");
  const [activeGasSection, setActiveGasSection] = useState<PriceSectionKey>("gasBuyFromCompany");
  const [activeIronSection, setActiveIronSection] = useState<PriceSectionKey>("ironBuyFromCustomer");

  const activeSectionKey = activeFamily === "gas" ? activeGasSection : activeIronSection;

  useEffect(() => {
    if (!section) return;

    const validKeys = Object.keys(PRICE_SECTIONS) as PriceSectionKey[];
    if (!validKeys.includes(section as PriceSectionKey)) return;

    const sectionKey = section as PriceSectionKey;
    const family = PRICE_SECTIONS[sectionKey].family;

    setActiveFamily(family);
    if (family === "gas") {
      setActiveGasSection(sectionKey);
    } else {
      setActiveIronSection(sectionKey);
    }
  }, [section]);

  function handleFamilyPress(family: PriceFamilyKey) {
    setActiveFamily(family);
  }

  function handleSectionPress(sectionKey: PriceSectionKey) {
    const section = PRICE_SECTIONS[sectionKey];
    if (section.family === "gas") {
      setActiveGasSection(sectionKey);
      return;
    }
    setActiveIronSection(sectionKey);
  }

  useEffect(() => {
    if (!pricesQuery.data) return;
    const find = (gas: "12kg" | "48kg") =>
      pricesQuery.data!
        .filter((p) => p.gas_type === gas)
        .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
    const p12 = find("12kg");
    const p48 = find("48kg");
    const loaded: PriceFormValues = {
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
    };
    setValues(loaded);
    setSavedValues(loaded);
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
      <Stack.Screen options={{ title: "Prices", headerBackTitle: "Account" }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
          <>
            <View style={styles.tabsBlock}>
              <View style={styles.familyTabRow} testID="price-family-tabs">
                {PRICE_FAMILY_TABS.map((tab) => {
                  const active = tab.key === activeFamily;
                  return (
                    <Pressable
                      key={tab.key}
                      testID={`price-family-${tab.key}`}
                      style={[styles.familyTabButton, active && styles.familyTabButtonActive]}
                      onPress={() => handleFamilyPress(tab.key)}
                    >
                      <Text style={[styles.familyTabText, active && styles.familyTabTextActive]}>{tab.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.sectionTabRow} testID="price-section-tabs">
                {PRICE_SECTION_TABS[activeFamily].map((sectionKey) => {
                  const active = sectionKey === activeSectionKey;
                  const section = PRICE_SECTIONS[sectionKey];
                  return (
                    <Pressable
                      key={sectionKey}
                      testID={`price-section-${sectionKey}`}
                      style={[styles.sectionTabButton, active && styles.sectionTabButtonActive]}
                      onPress={() => handleSectionPress(sectionKey)}
                    >
                      <Text
                        style={[styles.sectionTabText, active && styles.sectionTabTextActive]}
                        numberOfLines={2}
                        adjustsFontSizeToFit
                        minimumFontScale={0.85}
                      >
                        {section.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <PriceInputForm
              sectionKey={activeSectionKey}
              values={values}
              previousValues={savedValues}
              onChange={handleChange}
              disabled={savePriceMutation.isPending}
            />
          </>
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
  tabsBlock: {
    gap: 12,
    marginBottom: 16,
  },
  familyTabRow: {
    flexDirection: "row",
    backgroundColor: AppColors.surface.card,
    borderColor: AppColors.border.default,
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
  },
  familyTabButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: 10,
    paddingVertical: 10,
  },
  familyTabButtonActive: {
    backgroundColor: AppColors.text.primary,
  },
  familyTabText: {
    color: AppColors.text.muted,
    fontFamily: "NunitoSans-Bold",
    fontSize: 14,
  },
  familyTabTextActive: {
    color: AppColors.text.inverse,
  },
  sectionTabRow: {
    flexDirection: "row",
    gap: 10,
  },
  sectionTabButton: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AppColors.surface.card,
    borderColor: AppColors.border.default,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 50,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  sectionTabButtonActive: {
    borderColor: AppColors.text.primary,
  },
  sectionTabText: {
    color: AppColors.text.muted,
    fontFamily: "NunitoSans-Bold",
    fontSize: 13,
    lineHeight: 16,
    textAlign: "center",
  },
  sectionTabTextActive: {
    color: AppColors.text.primary,
  },
  centerCard: { backgroundColor: "#fff", borderRadius: 12, paddingVertical: 24, paddingHorizontal: 16, alignItems: "center", gap: 10 },
  meta: { color: "#64748b", fontSize: 13, fontFamily: "NunitoSans-Regular" },
  errorText: { color: "#b00020", fontSize: 14, fontFamily: "NunitoSans-SemiBold", marginTop: 8 },
  footer: { position: "absolute", left: 20, right: 20, bottom: 24 },
  primaryButton: { backgroundColor: "#0a7ea4", borderRadius: 12, paddingVertical: 15, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontSize: 16, fontFamily: "NunitoSans-Bold" },
  buttonDisabled: { opacity: 0.6 },
});
