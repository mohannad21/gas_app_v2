import { useEffect, useMemo, useState } from "react";
import { FlatList, View, Text, StyleSheet, TextInput, Pressable, Platform } from "react-native";
import { useActivities } from "@/hooks/useActivities";
import { useCustomers } from "@/hooks/useCustomers";
import { useLocalSearchParams, useRouter } from "expo-router";

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const typeLabel: Record<string, string> = {
  order: "Order",
  customer: "Customer",
  price: "Price",
  system: "System",
  inventory: "Inventory",
};

const actionStyleMap: Record<string, string> = {
  created: "created",
  updated: "updated",
  deleted: "deleted",
};

export default function ActivityScreen() {
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useActivities(search);
  const customersQuery = useCustomers();
  const customers = customersQuery.data ?? [];
  const params = useLocalSearchParams();
  const router = useRouter();
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const param = Array.isArray(params.flash) ? params.flash[0] : params.flash;
    if (!param) return;
    const message =
      param === "order-created"
        ? "Order created"
        : param === "customer-created"
          ? "Customer created"
          : null;
    if (message) {
      setFlash(message);
      router.setParams({ flash: undefined });
    }
  }, [params.flash, router]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Activity</Text>
      {flash && (
        <View style={styles.flash}>
          <Text style={styles.flashText}>{flash}</Text>
          <Pressable onPress={() => setFlash(null)} hitSlop={8}>
            <Text style={styles.flashClose}>×</Text>
          </Pressable>
        </View>
      )}
      <TextInput
        style={styles.input}
        placeholder="Search by customer name/phone/notes"
        value={search}
        onChangeText={setSearch}
      />
      <Pressable onPress={() => setSearch("")} style={styles.clearBtn}>
        <Text style={styles.clearText}>Clear</Text>
      </Pressable>
      {isLoading && <Text style={styles.meta}>Loading...</Text>}
      {error && <Text style={styles.error}>Failed to load activity.</Text>}
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={!isLoading ? <Text style={styles.meta}>No activity yet.</Text> : null}
        renderItem={({ item }) => {
          const metaItems = item.metadata
            ? item.metadata.split(";").map((entry) => entry.trim()).filter(Boolean)
            : [];
          const actionVariant = actionStyleMap[item.action] ?? "updated";
          const customerName = customers.find((c) => c.id === item.customer_id)?.name;
          const createdAt = new Date(item.created_at);
          return (
            <View style={styles.card}>
              <View style={styles.badgeRow}>
                <Text style={styles.badge}>{typeLabel[item.type] ?? "Event"}</Text>
                <Text style={[styles.actionTag, styles[`action${capitalize(actionVariant)}`]]}>
                  {item.action}
                </Text>
              </View>
              {customerName ? (
                <Text style={styles.customerName}>{customerName}</Text>
              ) : null}
              <Text style={styles.description}>{item.description}</Text>
              {metaItems.length > 0 && (
                <View style={styles.metaDetailRow}>
                  {metaItems.map((entry) => (
                    <Text key={entry} style={styles.metaDetail}>
                      {entry.replace("=", ": ")}
                    </Text>
                  ))}
                </View>
              )}
              <Text style={styles.timeLabel}>Date: {createdAt.toLocaleString()}</Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const cardShadow = Platform.select({
  web: { boxShadow: "0px 6px 12px rgba(0,0,0,0.08)" },
  default: {
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f7f7f8",
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 12,
  },
  listContent: {
    gap: 10,
    paddingBottom: 12,
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ccc",
    marginBottom: 6,
  },
  clearBtn: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "#e8eef1",
    borderRadius: 8,
    marginBottom: 6,
  },
  clearText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  separator: {
    height: 4,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    ...(cardShadow as object),
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  badge: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0a7ea4",
  },
  actionTag: {
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: "hidden",
  },
  actionCreated: {
    backgroundColor: "#e6f4ea",
    color: "#1c7f3a",
  },
  actionUpdated: {
    backgroundColor: "#def0ff",
    color: "#0a4c7d",
  },
  actionDeleted: {
    backgroundColor: "#fdecea",
    color: "#b00020",
  },
  timeLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  customerName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  metaDetailRow: {
    gap: 4,
    paddingTop: 4,
  },
  metaDetail: {
    fontSize: 12,
    color: "#444",
  },
  description: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  time: {
    fontSize: 12,
    color: "#666",
  },
  meta: {
    color: "#666",
    marginBottom: 8,
  },
  error: {
    color: "#b00020",
    marginBottom: 8,
  },
  flash: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#e6f4ea",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  flashText: {
    color: "#1c7f3a",
    fontWeight: "700",
  },
  flashClose: {
    color: "#1c7f3a",
    fontWeight: "800",
    fontSize: 16,
    paddingHorizontal: 6,
  },
});
