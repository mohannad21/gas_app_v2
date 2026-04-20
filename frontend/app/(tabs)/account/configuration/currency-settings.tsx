import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { useSystemSettings, useUpdateSystemSettings } from "@/hooks/useSystemSettings";
import { getCurrencyCode, getMoneyDecimals } from "@/lib/money";

const SUPPORTED_CURRENCIES = [
  { code: "USD", label: "USD — US Dollar ($)" },
  { code: "ILS", label: "ILS — Israeli Shekel (₪)" },
  { code: "EUR", label: "EUR — Euro (€)" },
  { code: "GBP", label: "GBP — British Pound (£)" },
  { code: "JOD", label: "JOD — Jordanian Dinar (JD)" },
  { code: "EGP", label: "EGP — Egyptian Pound (E£)" },
  { code: "SAR", label: "SAR — Saudi Riyal (﷼)" },
  { code: "AED", label: "AED — UAE Dirham (د.إ)" },
];

const DECIMAL_OPTIONS = [
  { value: 0, label: "0 — No decimals (e.g. 100)" },
  { value: 2, label: "2 — Two decimals (e.g. 100.00)" },
];

export default function CurrencySettingsScreen() {
  const router = useRouter();
  const settingsQuery = useSystemSettings();
  const updateMutation = useUpdateSystemSettings();

  const [selectedCode, setSelectedCode] = useState<string>(getCurrencyCode());
  const [selectedDecimals, setSelectedDecimals] = useState<number>(getMoneyDecimals());

  useEffect(() => {
    if (settingsQuery.data) {
      setSelectedCode(settingsQuery.data.currency_code);
      setSelectedDecimals(settingsQuery.data.money_decimals);
    }
  }, [settingsQuery.data]);

  const currentCode = settingsQuery.data?.currency_code ?? getCurrencyCode();
  const currentDecimals = settingsQuery.data?.money_decimals ?? getMoneyDecimals();
  const isDirty = selectedCode !== currentCode || selectedDecimals !== currentDecimals;

  async function handleSave() {
    await updateMutation.mutateAsync({
      currency_code: selectedCode,
      money_decimals: selectedDecimals,
    });
    router.back();
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Currency</Text>
      <View style={styles.optionGroup}>
        {SUPPORTED_CURRENCIES.map((c) => (
          <Pressable
            key={c.code}
            style={[styles.optionRow, selectedCode === c.code && styles.optionRowSelected]}
            onPress={() => setSelectedCode(c.code)}
          >
            <Text style={[styles.optionText, selectedCode === c.code && styles.optionTextSelected]}>
              {c.label}
            </Text>
            {selectedCode === c.code && <Text style={styles.checkmark}>✓</Text>}
          </Pressable>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Decimal Places</Text>
      <View style={styles.optionGroup}>
        {DECIMAL_OPTIONS.map((d) => (
          <Pressable
            key={d.value}
            style={[styles.optionRow, selectedDecimals === d.value && styles.optionRowSelected]}
            onPress={() => setSelectedDecimals(d.value)}
          >
            <Text style={[styles.optionText, selectedDecimals === d.value && styles.optionTextSelected]}>
              {d.label}
            </Text>
            {selectedDecimals === d.value && <Text style={styles.checkmark}>✓</Text>}
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.saveButton, (!isDirty || updateMutation.isPending) && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={!isDirty || updateMutation.isPending}
      >
        {updateMutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>Save</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f7f7f8",
  },
  content: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "NunitoSans-SemiBold",
    color: "#888",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  optionGroup: {
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
  },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee",
  },
  optionRowSelected: {
    backgroundColor: "#eff6ff",
  },
  optionText: {
    fontSize: 16,
    color: "#111",
  },
  optionTextSelected: {
    color: "#1d4ed8",
    fontFamily: "NunitoSans-SemiBold",
  },
  checkmark: {
    fontSize: 16,
    color: "#1d4ed8",
  },
  saveButton: {
    marginTop: 32,
    backgroundColor: "#1d4ed8",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveButtonDisabled: {
    backgroundColor: "#93c5fd",
  },
  saveButtonText: {
    fontSize: 16,
    color: "#fff",
    fontFamily: "NunitoSans-SemiBold",
  },
});
