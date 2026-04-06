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

import {
  useCreateExpenseCategory,
  useExpenseCategories,
  useToggleExpenseCategory,
} from "@/hooks/useExpenseCategories";
import { useExpenses } from "@/hooks/useExpenses";
import { formatDateMedium } from "@/lib/date";
import { getCurrencyCode, getMoneyDecimals } from "@/lib/money";

function statusTone(isActive: boolean) {
  return isActive
    ? { backgroundColor: "#dcfce7", color: "#166534", label: "Active", action: "Disable" }
    : { backgroundColor: "#fee2e2", color: "#991b1b", label: "Inactive", action: "Enable" };
}

export default function ExpenseCategoriesConfigurationScreen() {
  const router = useRouter();
  const categoriesQuery = useExpenseCategories();
  const createCategoryMutation = useCreateExpenseCategory();
  const toggleCategoryMutation = useToggleExpenseCategory();
  const expensesQuery = useExpenses();
  const recentExpenses = (expensesQuery.data ?? []).slice(0, 15);

  function formatMoney(value: number) {
    return `${value.toFixed(getMoneyDecimals())} ${getCurrencyCode()}`;
  }

  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function resetForm() {
    setName("");
    setFormError(null);
  }

  function closeModal() {
    setModalVisible(false);
    resetForm();
  }

  async function handleCreate() {
    if (!name.trim()) {
      setFormError("Category name is required.");
      return;
    }
    setFormError(null);
    try {
      await createCategoryMutation.mutateAsync(name.trim());
      closeModal();
    } catch {
      // Error toast handled by hook.
    }
  }

  async function handleToggle(id: string, current: boolean) {
    try {
      await toggleCategoryMutation.mutateAsync({ id, isActive: !current });
    } catch {
      // Error toast handled by hook.
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>{"<"}</Text>
          </Pressable>
          <Text style={styles.title}>Expense Categories</Text>
          <View style={styles.backButtonSpacer} />
        </View>

        {categoriesQuery.isLoading ? (
          <View style={styles.centerCard}>
            <ActivityIndicator size="small" color="#0a7ea4" />
            <Text style={styles.meta}>Loading categories...</Text>
          </View>
        ) : null}

        {categoriesQuery.isError ? (
          <View style={styles.centerCard}>
            <Text style={styles.errorText}>Could not load expense categories.</Text>
          </View>
        ) : null}

        {!categoriesQuery.isLoading && !categoriesQuery.isError ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Available Categories</Text>
            {(categoriesQuery.data ?? []).length === 0 ? (
              <Text style={styles.emptyText}>No expense categories yet.</Text>
            ) : (
              (categoriesQuery.data ?? []).map((item) => {
                const tone = statusTone(item.is_active);
                return (
                  <Pressable
                    key={item.id}
                    style={styles.itemRow}
                    onPress={() => handleToggle(item.id, item.is_active)}
                    disabled={toggleCategoryMutation.isPending}
                  >
                    <View style={styles.itemMain}>
                      <Text style={styles.itemTitle}>{item.name}</Text>
                      <View style={styles.itemMetaRow}>
                        <View style={[styles.badge, { backgroundColor: tone.backgroundColor }]}>
                          <Text style={[styles.badgeText, { color: tone.color }]}>{tone.label}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.actionButton}>
                      <Text style={styles.actionText}>{tone.action}</Text>
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Expenses</Text>
          {expensesQuery.isLoading ? (
            <Text style={styles.emptyText}>Loading...</Text>
          ) : recentExpenses.length === 0 ? (
            <Text style={styles.emptyText}>No expenses recorded yet.</Text>
          ) : (
            recentExpenses.map((expense) => (
              <View key={expense.id} style={styles.itemRow}>
                <View style={styles.itemMain}>
                  <Text style={styles.itemTitle}>
                    {expense.expense_type.charAt(0).toUpperCase() + expense.expense_type.slice(1)}
                  </Text>
                  <Text style={styles.itemMeta}>{formatDateMedium(expense.date, undefined, "-")}</Text>
                </View>
                <Text style={styles.expenseAmount}>{formatMoney(expense.amount)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.primaryButton} onPress={() => setModalVisible(true)}>
          <Text style={styles.primaryButtonText}>Add Category</Text>
        </Pressable>
      </View>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={closeModal}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={styles.modalBackdrop}>
              <TouchableWithoutFeedback accessible={false}>
                <View style={styles.modalCard}>
                  <Text style={styles.modalTitle}>Add Expense Category</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Category name"
                    value={name}
                    onChangeText={setName}
                    editable={!createCategoryMutation.isPending}
                  />

                  {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

                  <View style={styles.modalActions}>
                    <Pressable style={styles.modalSecondaryButton} onPress={closeModal} disabled={createCategoryMutation.isPending}>
                      <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalPrimaryButton, createCategoryMutation.isPending && styles.buttonDisabled]}
                      onPress={handleCreate}
                      disabled={createCategoryMutation.isPending}
                    >
                      {createCategoryMutation.isPending ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.modalPrimaryButtonText}>Add Category</Text>
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
    paddingBottom: 160,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee",
  },
  itemMain: {
    flex: 1,
    gap: 6,
  },
  itemTitle: {
    fontSize: 16,
    color: "#111",
    fontFamily: "NunitoSans-SemiBold",
  },
  itemMeta: {
    fontSize: 12,
    color: "#64748b",
    fontFamily: "NunitoSans-Regular",
  },
  itemMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: "NunitoSans-Bold",
  },
  actionButton: {
    borderRadius: 999,
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionText: {
    color: "#0369a1",
    fontSize: 13,
    fontFamily: "NunitoSans-Bold",
  },
  expenseAmount: {
    fontSize: 14,
    fontFamily: "NunitoSans-SemiBold",
    color: "#111",
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
