import { useMemo, useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { gasColor } from "@/constants/gas";

import { useCustomers } from "@/hooks/useCustomers";
import { useOrders } from "@/hooks/useOrders";
import { useSystems } from "@/hooks/useSystems";

type BalanceFilter = "all" | "outstanding" | "missing12" | "missing48";

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

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const balanceFilterOptions: Array<{ value: BalanceFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "outstanding", label: "Outstanding" },
  { value: "missing12", label: "Missing 12kg" },
  { value: "missing48", label: "Missing 48kg" },
];

export default function CustomersDashboardTab() {
  const [search, setSearch] = useState("");
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilter>("all");

  const customersQuery = useCustomers();
  const ordersQuery = useOrders();
  const systemsQuery = useSystems();

  const customers = useMemo(
    () => (customersQuery.data ?? []).filter((c) => c.id.startsWith("c")),
    [customersQuery.data]
  );

  const lastOrderByCustomer = useMemo(() => {
    const map: Record<string, string> = {};
    (ordersQuery.data ?? []).forEach((order) => {
      const existing = map[order.customer_id];
      if (!existing || new Date(order.delivered_at) > new Date(existing)) {
        map[order.customer_id] = order.delivered_at;
      }
    });
    return map;
  }, [ordersQuery.data]);

  const systemsCountByCustomer = useMemo(() => {
    const counts: Record<string, number> = {};
    (systemsQuery.data ?? []).forEach((system) => {
      counts[system.customer_id] = (counts[system.customer_id] ?? 0) + 1;
    });
    return counts;
  }, [systemsQuery.data]);

  const defaultSystemByCustomer = useMemo(() => {
    const map: Record<string, string> = {};
    (systemsQuery.data ?? []).forEach((system) => {
      const isActive = system.is_active !== false;
      if (isActive) {
        map[system.customer_id] = system.id;
      } else if (!map[system.customer_id]) {
        map[system.customer_id] = system.id;
      }
    });
    return map;
  }, [systemsQuery.data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return customers
      .filter((c) =>
        term
          ? [c.name, c.phone, c.notes ?? ""].some((field) =>
              field.toLowerCase().includes(term)
            )
          : true
      )
      .filter((c) => {
        if (balanceFilter === "outstanding") return c.money_balance > 0;
        if (balanceFilter === "missing12") return c.cylinder_balance_12kg > 0;
        if (balanceFilter === "missing48") return c.cylinder_balance_48kg > 0;
        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [balanceFilter, customers, search]);

  const metrics = useMemo(() => {
    const outstanding = customers.reduce((sum, c) => sum + Math.max(0, c.money_balance), 0);
    const missing12 = customers.reduce(
      (sum, c) => sum + Math.max(0, c.cylinder_balance_12kg),
      0
    );
    const missing48 = customers.reduce(
      (sum, c) => sum + Math.max(0, c.cylinder_balance_48kg),
      0
    );
    return { outstanding, missing12, missing48 };
  }, [customers]);


  return (
    <View style={styles.container}>
      <Text style={styles.title}>Customer Dashboard</Text>
      <View style={styles.metricRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Customers</Text>
          <Text style={styles.metricValue}>{customers.length}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Outstanding</Text>
          <Text style={styles.metricValue}>${metrics.outstanding.toFixed(2)}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={[styles.metricLabel, { color: gasColor("12kg") }]}>Missing 12kg</Text>
          <Text style={styles.metricValue}>{metrics.missing12}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={[styles.metricLabel, { color: gasColor("48kg") }]}>Missing 48kg</Text>
          <Text style={styles.metricValue}>{metrics.missing48}</Text>
        </View>
      </View>

      <View style={styles.filterBox}>
        <Text style={styles.sectionTitle}>Filters</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, phone, or notes"
          style={styles.input}
        />
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Balance</Text>
          <View style={styles.chipRow}>
            {balanceFilterOptions.map((option) => (
              <FilterChip
                key={option.value}
                label={option.label}
                active={balanceFilter === option.value}
                onPress={() => setBalanceFilter(option.value)}
              />
            ))}
          </View>
        </View>
      </View>

      {customersQuery.isLoading && <Text style={styles.meta}>Loading customers...</Text>}
      {customersQuery.isFetching && !customersQuery.isLoading ? (
        <Text style={styles.meta}>Refreshing...</Text>
      ) : null}
      {systemsQuery.isFetching && <Text style={styles.meta}>Updating system counts...</Text>}
      {customersQuery.error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>Failed to load customers.</Text>
          <Pressable style={styles.retryBtn} onPress={() => customersQuery.refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          !customersQuery.isLoading ? <Text style={styles.meta}>No customers match.</Text> : null
        }
        renderItem={({ item }) => {
          const lastOrder = lastOrderByCustomer[item.id];
          const systemCount = systemsCountByCustomer[item.id] ?? 0;
          return (
            <Pressable
              onPress={() => router.push(`/customers/${item.id}`)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <View style={styles.rowBetween}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.type}>{item.customer_type}</Text>
              </View>
              <Text style={styles.phone}>{item.phone}</Text>
              {item.notes ? (
                <Text style={styles.notes} numberOfLines={2}>
                  {item.notes}
                </Text>
              ) : null}
              <View style={styles.rowBetween}>
                <Text style={styles.meta}>
                  {item.order_count} orders • {systemCount} systems
                </Text>
                <Text
                  style={[
                    styles.balance,
                    item.money_balance > 0 ? styles.unpaid : item.money_balance < 0 ? styles.credit : null,
                  ]}
                >
                  Balance: ${item.money_balance.toFixed(2)}
                </Text>
              </View>
              <View style={styles.rowBetween}>
                <Text style={styles.meta}>
                  Last order: {lastOrder ? new Date(lastOrder).toLocaleDateString() : "—"}
                </Text>
                <View style={styles.badgeRow}>
                  {item.money_balance > 0 ? (
                    <Text style={[styles.badge, styles.badgeUnpaid]}>Outstanding</Text>
                  ) : item.money_balance < 0 ? (
                    <Text style={[styles.badge, styles.badgeCredit]}>Credit</Text>
                  ) : (
                    <Text style={[styles.badge, styles.badgeClear]}>Clear</Text>
                  )}
                </View>
              </View>
              <View style={styles.actions}>
                <Pressable
                  onPress={() => router.push(`/customers/${item.id}`)}
                  style={styles.linkBtn}
                >
                  <Text style={styles.linkText}>Details</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const systemId = defaultSystemByCustomer[item.id];
                    const params = [`customerId=${encodeURIComponent(item.id)}`];
                    if (systemId) params.push(`systemId=${encodeURIComponent(systemId)}`);
                    router.push(`/orders/new?${params.join("&")}`);
                  }}
                  style={styles.linkBtn}
                >
                  <Text style={styles.linkText}>Quick Order</Text>
                </Pressable>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

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
  metricRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    ...(cardShadow as object),
  },
  metricLabel: {
    color: "#6b7280",
    fontSize: 12,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  filterBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    marginBottom: 10,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  input: {
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
  filterRow: {
    gap: 6,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
  },
  chipActive: {
    backgroundColor: "#0a7ea4",
  },
  chipText: {
    color: "#0a7ea4",
    fontWeight: "700",
    textTransform: "capitalize",
  },
  chipTextActive: {
    color: "#fff",
  },
  meta: {
    color: "#666",
    marginBottom: 6,
  },
  errorBox: {
    backgroundColor: "#fdecea",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#f5c6cb",
    gap: 6,
  },
  errorText: {
    color: "#8a1c1c",
    fontWeight: "700",
  },
  retryBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#f5c6cb",
    borderRadius: 6,
  },
  retryText: {
    color: "#8a1c1c",
    fontWeight: "700",
  },
  listContent: {
    paddingBottom: 40,
    gap: 10,
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
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  name: {
    fontSize: 18,
    fontWeight: "700",
    flexShrink: 1,
  },
  type: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0a7ea4",
    textTransform: "capitalize",
  },
  phone: {
    marginVertical: 6,
    color: "#444",
  },
  notes: {
    color: "#4b5563",
    marginBottom: 4,
  },
  balance: {
    fontSize: 13,
    fontWeight: "700",
  },
  unpaid: {
    color: "#b00020",
  },
  credit: {
    color: "#1c7f3a",
  },
  badgeRow: {
    flexDirection: "row",
    gap: 6,
  },
  badge: {
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeUnpaid: {
    backgroundColor: "#fdecea",
    color: "#b00020",
  },
  badgeCredit: {
    backgroundColor: "#e6f4ea",
    color: "#1c7f3a",
  },
  badgeClear: {
    backgroundColor: "#e2e8f0",
    color: "#334155",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  linkBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#e8eef1",
    borderRadius: 10,
  },
  linkText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
});
