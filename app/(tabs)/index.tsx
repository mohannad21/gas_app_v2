import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Linking, View, Text, StyleSheet, TextInput, Pressable, Platform, InputAccessoryView, Keyboard } from "react-native";
import { useActivities } from "@/hooks/useActivities";
import { useCustomers } from "@/hooks/useCustomers";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Activity, ActivityType } from "@/types/domain";
import * as Clipboard from "expo-clipboard";
import { showToast } from "@/lib/toast";

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

const typeFilters: Array<{ id: "all" | ActivityType; label: string }> = [
  { id: "all", label: "All" },
  { id: "order", label: "Orders" },
  { id: "customer", label: "Customers" },
  { id: "system", label: "Systems" },
  { id: "price", label: "Prices" },
  { id: "inventory", label: "Inventory" },
];

function parseMetadata(metadata?: string | null) {
  if (!metadata) return {};
  return metadata
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, entry) => {
      const [key, ...rest] = entry.split("=");
      if (!key || rest.length === 0) return acc;
      acc[key.trim()] = rest.join("=").trim();
      return acc;
    }, {});
}

function resolveActivityTarget(activity: Activity) {
  const meta = parseMetadata(activity.metadata);
  const entityId = activity.entity_id ?? (activity.type === "order" ? meta.order : undefined);
  if (activity.type === "customer") {
    const customerId = activity.entity_id ?? activity.customer_id ?? meta.customer;
    if (customerId) return { path: `/customers/${customerId}`, label: "Customer" };
  }
  if (activity.type === "order" && entityId) return { path: `/orders/${entityId}`, label: "Order" };
  if (activity.type === "system" && entityId) return { path: `/systems/${entityId}`, label: "System" };
  if (activity.type === "price") return { path: "/prices", label: "Prices" };
  if (activity.type === "inventory") return { path: "/(tabs)/reports", label: "Reports" };
  return null;
}

export default function ActivityScreen() {
  const accessoryId = Platform.OS === "ios" ? "homeAccessory" : undefined;
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ActivityType>("all");
  const { data, isLoading, error } = useActivities();
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

  const customersById = useMemo(() => {
    const map: Record<string, { name: string; phone?: string }> = {};
    customers.forEach((c) => {
      map[c.id] = { name: c.name, phone: c.phone };
    });
    return map;
  }, [customers]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? []).filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (!term) return true;
      const customerName = item.customer_id ? customersById[item.customer_id]?.name ?? "" : "";
      const haystack = [
        item.description,
        item.metadata ?? "",
        item.action,
        item.type,
        customerName,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [data, search, typeFilter, customersById]);

  async function handleCopy(value: string) {
    try {
      await Clipboard.setStringAsync(value);
      showToast("Copied");
    } catch {
      Alert.alert("Copy failed", "Could not copy to clipboard.");
    }
  }

  function handleCall(phone?: string) {
    const sanitized = phone?.replace(/[^0-9+]/g, "") ?? "";
    if (!sanitized) {
      Alert.alert("No phone", "This customer has no valid phone number.");
      return;
    }
    Alert.alert("Call customer?", sanitized, [
      { text: "Cancel", style: "cancel" },
      { text: "Call", onPress: () => Linking.openURL(`tel:${sanitized}`) },
    ]);
  }

  return (
    <>
      <View style={styles.container}>
      <Text style={styles.title}>Activity</Text>
      {flash && (
        <View style={styles.flash}>
          <Text style={styles.flashText}>{flash}</Text>
          <Pressable onPress={() => setFlash(null)} hitSlop={8}>
            <Text style={styles.flashClose}>x</Text>
          </Pressable>
        </View>
      )}
      <TextInput
        style={styles.input}
        placeholder="Search activity"
        value={search}
        onChangeText={setSearch}
        inputAccessoryViewID={accessoryId}
      />
      <View style={styles.filterRow}>
        {typeFilters.map((filter) => {
          const active = typeFilter === filter.id;
          return (
            <Pressable
              key={filter.id}
              onPress={() => setTypeFilter(filter.id)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{filter.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable onPress={() => setSearch("")} style={styles.clearBtn}>
        <Text style={styles.clearText}>Clear</Text>
      </Pressable>
      {isLoading && <Text style={styles.meta}>Loading...</Text>}
      {error && <Text style={styles.error}>Failed to load activity.</Text>}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={!isLoading ? <Text style={styles.meta}>No activity found.</Text> : null}
        renderItem={({ item }) => {
          const metaItems = item.metadata
            ? item.metadata.split(";").map((entry) => entry.trim()).filter(Boolean)
            : [];
          const actionVariant = actionStyleMap[item.action] ?? "updated";
          const customer = item.customer_id ? customersById[item.customer_id] : undefined;
          const createdAt = new Date(item.created_at);
          const actionStyle =
            actionVariant === "created"
              ? styles.actionCreated
              : actionVariant === "deleted"
                ? styles.actionDeleted
                : styles.actionUpdated;
          const target = resolveActivityTarget(item);
          return (
            <Pressable
              onPress={() => (target ? router.push(target.path) : undefined)}
              disabled={!target}
              style={({ pressed }) => [
                styles.card,
                pressed && target ? styles.cardPressed : null,
                !target ? styles.cardDisabled : null,
              ]}
            >
              <View style={styles.badgeRow}>
                <Text style={styles.badge}>{typeLabel[item.type] ?? "Event"}</Text>
                <Text style={[styles.actionTag, actionStyle]}>{item.action}</Text>
              </View>
              {customer?.name ? (
                <Text style={styles.customerName}>{customer.name}</Text>
              ) : null}
              <Text style={styles.description}>{item.description}</Text>
              {customer?.name ? (
                <View style={styles.quickActions}>
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation();
                      handleCall(customer.phone);
                    }}
                    style={styles.quickBtn}
                  >
                    <Text style={styles.quickText}>Call</Text>
                  </Pressable>
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation();
                      router.push(`/orders/new?customerId=${item.customer_id}`);
                    }}
                    style={styles.quickBtn}
                  >
                    <Text style={styles.quickText}>New order</Text>
                  </Pressable>
                </View>
              ) : null}
              {metaItems.length > 0 && (
                <View style={styles.metaDetailRow}>
                  {metaItems.map((entry) => (
                    <Pressable
                      key={entry}
                      onPress={(event) => {
                        event.stopPropagation();
                        handleCopy(entry);
                      }}
                    >
                      <Text style={styles.metaDetail}>{entry.replace("=", ": ")}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {target ? <Text style={styles.openHint}>Open {target.label}</Text> : null}
              <Text style={styles.timeLabel}>Date: {createdAt.toLocaleString()}</Text>
            </Pressable>
          );
        }}
      />
      </View>
      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={accessoryId}>
          <View style={styles.accessoryRow}>
            <Pressable onPress={() => Keyboard.dismiss()} style={styles.accessoryButton}>
              <Text style={styles.accessoryText}>Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
    </>
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
  accessoryRow: {
    backgroundColor: "#f1f5f9",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#cbd5f5",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  accessoryButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#0a7ea4",
    borderRadius: 8,
  },
  accessoryText: {
    color: "#fff",
    fontWeight: "700",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#e8eef1",
  },
  filterChipActive: {
    backgroundColor: "#0a7ea4",
  },
  filterText: {
    color: "#0a7ea4",
    fontWeight: "700",
    fontSize: 12,
  },
  filterTextActive: {
    color: "#fff",
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
  cardPressed: {
    opacity: 0.9,
  },
  cardDisabled: {
    opacity: 0.8,
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
  openHint: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0a7ea4",
    marginTop: 6,
  },
  quickActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  quickBtn: {
    backgroundColor: "#e8eef1",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  quickText: {
    color: "#0a7ea4",
    fontWeight: "700",
    fontSize: 12,
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


