import { useMemo, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useCreateSystemType, useSystemTypes, useUpdateSystemType } from "@/hooks/useSystemTypes";

export default function SystemTypesScreen() {
  const typesQuery = useSystemTypes();
  const createType = useCreateSystemType();
  const updateType = useUpdateSystemType();
  const [newName, setNewName] = useState("");

  const rows = useMemo(() => typesQuery.data ?? [], [typesQuery.data]);

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      Alert.alert("Missing name", "Enter a system type name.");
      return;
    }
    await createType.mutateAsync(trimmed);
    setNewName("");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>System Types</Text>
      <Text style={styles.meta}>These options appear when creating systems.</Text>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Add new type"
          value={newName}
          onChangeText={setNewName}
        />
        <Pressable onPress={handleAdd} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>Add</Text>
        </Pressable>
      </View>

      {typesQuery.isLoading && <Text style={styles.meta}>Loading...</Text>}
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 10, paddingBottom: 20 }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowText}>{item.name}</Text>
            <Pressable
              onPress={() => updateType.mutateAsync({ id: item.id, payload: { is_active: !(item.is_active ?? true) } })}
              style={({ pressed }) => [
                styles.toggle,
                pressed && styles.pressed,
                item.is_active === false && styles.toggleInactive,
              ]}
            >
              <Text style={[styles.toggleText, item.is_active === false && styles.toggleTextInactive]}>
                {item.is_active === false ? "Inactive" : "Active"}
              </Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f7f7f8",
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  meta: {
    color: "#64748b",
    fontSize: 12,
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  input: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ccc",
  },
  primary: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  primaryText: {
    color: "#fff",
    fontWeight: "700",
  },
  row: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowText: {
    fontWeight: "700",
  },
  toggle: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#e0f2fe",
  },
  toggleInactive: {
    backgroundColor: "#fee2e2",
  },
  toggleText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  toggleTextInactive: {
    color: "#b00020",
  },
  pressed: {
    opacity: 0.9,
  },
});
