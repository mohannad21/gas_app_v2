import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import {
  useCreateExpenseCategory,
  useExpenseCategories,
  useToggleExpenseCategory,
} from "@/hooks/useExpenseCategories";

export default function ExpenseCategoriesConfigurationScreen() {
  const router = useRouter();
  const categoriesQuery = useExpenseCategories();
  const createCategoryMutation = useCreateExpenseCategory();
  const toggleCategoryMutation = useToggleExpenseCategory();
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const activeCategories = useMemo(
    () => (categoriesQuery.data ?? []).filter((item) => item.is_active),
    [categoriesQuery.data]
  );

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Category name is required.");
      return;
    }
    setFormError(null);
    try {
      await createCategoryMutation.mutateAsync(trimmed);
      setName("");
    } catch {
      // Error toast handled by hook.
    }
  }

  async function handleRemove(id: string) {
    try {
      await toggleCategoryMutation.mutateAsync({ id, isActive: false });
    } catch {
      // Error toast handled by hook.
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.replace("/(tabs)/account")} style={styles.backButton}>
            <Text style={styles.backButtonText}>{"<"}</Text>
          </Pressable>
          <Text style={styles.title}>Expense Categories</Text>
          <View style={styles.backButtonSpacer} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Add Category</Text>
          <View style={styles.editorRow}>
            <TextInput
              style={styles.input}
              placeholder="Category name"
              value={name}
              onChangeText={setName}
              editable={!createCategoryMutation.isPending}
            />
            <Pressable
              style={[styles.addButton, createCategoryMutation.isPending && styles.buttonDisabled]}
              onPress={handleCreate}
              disabled={createCategoryMutation.isPending}
            >
              {createCategoryMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.addButtonText}>Add</Text>
              )}
            </Pressable>
          </View>
          {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
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
            <Text style={styles.sectionTitle}>Active Categories</Text>
            {activeCategories.length === 0 ? (
              <Text style={styles.emptyText}>No expense categories yet.</Text>
            ) : (
              <View style={styles.chipWrap}>
                {activeCategories.map((item) => (
                  <View key={item.id} style={styles.chip}>
                    <Text style={styles.chipText}>{item.name}</Text>
                    <Pressable
                      onPress={() => handleRemove(item.id)}
                      disabled={toggleCategoryMutation.isPending}
                      hitSlop={8}
                    >
                      <Text style={styles.removeText}>x</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>
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
    paddingBottom: 32,
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
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "NunitoSans-SemiBold",
    color: "#888",
    textTransform: "uppercase",
  },
  editorRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  input: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  addButton: {
    minWidth: 84,
    borderRadius: 10,
    backgroundColor: "#0a7ea4",
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  addButtonText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "NunitoSans-Bold",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ecfeff",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#a5f3fc",
  },
  chipText: {
    color: "#0f172a",
    fontSize: 14,
    fontFamily: "NunitoSans-SemiBold",
  },
  removeText: {
    color: "#dc2626",
    fontSize: 16,
    fontFamily: "NunitoSans-Bold",
    lineHeight: 16,
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
  },
  emptyText: {
    color: "#64748b",
    fontSize: 14,
    fontFamily: "NunitoSans-Regular",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
