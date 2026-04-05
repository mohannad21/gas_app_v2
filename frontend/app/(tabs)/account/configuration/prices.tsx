import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { usePriceSettings, useSavePriceSetting } from "@/hooks/usePrices";
import { formatDateTimeMedium } from "@/lib/date";
import { getCurrencyCode, getMoneyDecimals } from "@/lib/money";

import { gasTypes as GAS_TYPES } from "@/components/PriceMatrix";
import { GasType } from "@/types/domain";

function formatMoney(value: number | null | undefined) {
  if (value == null) {
    return "-";
  }
  return `${value.toFixed(getMoneyDecimals())} ${getCurrencyCode()}`;
}

export default function PricesConfigurationScreen() {
  const router = useRouter();
  const pricesQuery = usePriceSettings();
  const savePriceMutation = useSavePriceSetting();

  const [modalVisible, setModalVisible] = useState(false);
  const [gasType, setGasType] = useState<GasType>(GAS_TYPES[0]);
  const [sellingPrice, setSellingPrice] = useState("");
  const [buyingPrice, setBuyingPrice] = useState("");
  const [sellingIronPrice, setSellingIronPrice] = useState("");
  const [buyingIronPrice, setBuyingIronPrice] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function resetForm() {
    setGasType(GAS_TYPES[0]);
    setSellingPrice("");
    setBuyingPrice("");
    setSellingIronPrice("");
    setBuyingIronPrice("");
    setFormError(null);
  }

  function closeModal() {
    setModalVisible(false);
    resetForm();
  }

  async function handleSavePrice() {
    const selling = Number(sellingPrice);
    const buying = buyingPrice.trim() ? Number(buyingPrice) : 0;
    const sellingIron = sellingIronPrice.trim() ? Number(sellingIronPrice) : 0;
    const buyingIron = buyingIronPrice.trim() ? Number(buyingIronPrice) : 0;

    if (!sellingPrice.trim() || Number.isNaN(selling) || selling <= 0) {
      setFormError("Enter a valid selling price.");
      return;
    }
    if (buyingPrice.trim() && (Number.isNaN(buying) || buying < 0)) {
      setFormError("Enter a valid buying price.");
      return;
    }

    setFormError(null);
    try {
      await savePriceMutation.mutateAsync({
        gas_type: gasType,
        selling_price: selling,
        buying_price: buying,
        selling_iron_price: sellingIron,
        buying_iron_price: buyingIron,
      });
      closeModal();
    } catch {
      // Error toast is handled by the mutation hook.
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
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Current Prices</Text>
            {(pricesQuery.data ?? []).length === 0 ? (
              <Text style={styles.emptyText}>No prices configured yet.</Text>
            ) : (
              (pricesQuery.data ?? []).map((price) => (
                <View key={price.id} style={styles.itemRow}>
                  <View style={styles.itemMain}>
                    <Text style={styles.itemTitle}>{price.gas_type}</Text>
                    <Text style={styles.itemMeta}>Selling {formatMoney(price.selling_price)}</Text>
                    <Text style={styles.itemMeta}>Buying {formatMoney(price.buying_price ?? 0)}</Text>
                    {price.selling_iron_price != null ? (
                      <Text style={styles.itemMeta}>Iron selling {formatMoney(price.selling_iron_price)}</Text>
                    ) : null}
                    {price.buying_iron_price != null ? (
                      <Text style={styles.itemMeta}>Iron buying {formatMoney(price.buying_iron_price)}</Text>
                    ) : null}
                    <Text style={styles.itemMeta}>Effective {formatDateTimeMedium(price.effective_from, undefined, "-")}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.primaryButton} onPress={() => setModalVisible(true)}>
          <Text style={styles.primaryButtonText}>New Price</Text>
        </Pressable>
      </View>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={closeModal}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={styles.modalBackdrop}>
              <TouchableWithoutFeedback accessible={false}>
                <View style={styles.modalCard}>
                  <Text style={styles.modalTitle}>Add Price</Text>

                  <Text style={styles.fieldLabel}>Gas Type</Text>
                  <View style={styles.optionGrid}>
                    {GAS_TYPES.map((option) => {
                      const selected = option === gasType;
                      return (
                        <Pressable
                          key={option}
                          style={[styles.optionButton, selected && styles.optionButtonSelected]}
                          onPress={() => setGasType(option)}
                          disabled={savePriceMutation.isPending}
                        >
                          <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <TextInput
                    style={styles.input}
                    placeholder="Selling price"
                    keyboardType="decimal-pad"
                    value={sellingPrice}
                    onChangeText={setSellingPrice}
                    editable={!savePriceMutation.isPending}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Buying price"
                    keyboardType="decimal-pad"
                    value={buyingPrice}
                    onChangeText={setBuyingPrice}
                    editable={!savePriceMutation.isPending}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Selling iron price (optional)"
                    keyboardType="decimal-pad"
                    value={sellingIronPrice}
                    onChangeText={setSellingIronPrice}
                    editable={!savePriceMutation.isPending}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Buying iron price (optional)"
                    keyboardType="decimal-pad"
                    value={buyingIronPrice}
                    onChangeText={setBuyingIronPrice}
                    editable={!savePriceMutation.isPending}
                  />

                  {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

                  <View style={styles.modalActions}>
                    <Pressable style={styles.modalSecondaryButton} onPress={closeModal} disabled={savePriceMutation.isPending}>
                      <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalPrimaryButton, savePriceMutation.isPending && styles.buttonDisabled]}
                      onPress={handleSavePrice}
                      disabled={savePriceMutation.isPending}
                    >
                      {savePriceMutation.isPending ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.modalPrimaryButtonText}>Save Price</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f7f7f8",
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 112,
    gap: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  backButtonText: {
    fontSize: 20,
    color: "#111",
  },
  backButtonSpacer: {
    width: 36,
    height: 36,
  },
  title: {
    fontSize: 26,
    fontFamily: "NunitoSans-Bold",
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "NunitoSans-SemiBold",
    color: "#888",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    textTransform: "uppercase",
  },
  centerCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 10,
  },
  meta: {
    color: "#64748b",
    fontSize: 13,
    fontFamily: "NunitoSans-Regular",
  },
  errorText: {
    color: "#b00020",
    fontSize: 14,
    fontFamily: "NunitoSans-SemiBold",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  emptyText: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#64748b",
    fontSize: 14,
    fontFamily: "NunitoSans-Regular",
  },
  itemRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee",
  },
  itemMain: {
    gap: 6,
  },
  itemTitle: {
    fontSize: 16,
    color: "#111",
    fontFamily: "NunitoSans-SemiBold",
  },
  itemMeta: {
    fontSize: 13,
    color: "#64748b",
    fontFamily: "NunitoSans-Regular",
  },
  footer: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 24,
  },
  primaryButton: {
    backgroundColor: "#0a7ea4",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "NunitoSans-Bold",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    fontSize: 22,
    color: "#111",
    fontFamily: "NunitoSans-Bold",
  },
  fieldLabel: {
    fontSize: 13,
    color: "#64748b",
    fontFamily: "NunitoSans-SemiBold",
    textTransform: "uppercase",
  },
  optionGrid: {
    flexDirection: "row",
    gap: 10,
  },
  optionButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  optionButtonSelected: {
    borderColor: "#0a7ea4",
    backgroundColor: "#e0f2fe",
  },
  optionText: {
    fontSize: 15,
    color: "#111",
    fontFamily: "NunitoSans-SemiBold",
  },
  optionTextSelected: {
    color: "#075985",
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 4,
  },
  modalSecondaryButton: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  modalSecondaryButtonText: {
    fontSize: 15,
    color: "#64748b",
    fontFamily: "NunitoSans-SemiBold",
  },
  modalPrimaryButton: {
    minWidth: 120,
    borderRadius: 10,
    backgroundColor: "#0a7ea4",
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalPrimaryButtonText: {
    fontSize: 15,
    color: "#fff",
    fontFamily: "NunitoSans-Bold",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
