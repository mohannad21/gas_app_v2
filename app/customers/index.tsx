import { FlatList, View, Text, StyleSheet, Pressable } from "react-native";
import { router } from "expo-router";
import { useMemo, useState } from "react";

import { useCustomers } from "@/hooks/useCustomers";
import { useOrders } from "@/hooks/useOrders";

export default function CustomersListScreen() {
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const { data, isLoading, isFetching, error, refetch } = useCustomers();
  const ordersQuery = useOrders();

  const customers = useMemo(
    () =>
      (data ?? [])
        .filter((c) => c.id.startsWith("c"))
        .filter((c) => (unpaidOnly ? c.money_balance > 0 : true)),
    [data, unpaidOnly]
  );

  const dashboard = useMemo(() => {
    const totalDebt = customers.reduce((sum, c) => sum + Math.max(0, c.money_balance), 0);
    const unpaidCount = customers.filter((c) => c.money_balance > 0).length;

    const ordersByCustomer: Record<string, string> = {};
    (ordersQuery.data ?? []).forEach((o) => {
      ordersByCustomer[o.customer_id] = o.delivered_at;
    });

    const overdue = customers
      .map((c) => {
        const last = ordersByCustomer[c.id];
        const lastDate = last ? new Date(last) : null;
        const daysSince =
          lastDate != null ? Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)) : null;
        return { customer: c, daysSince };
      })
      .filter((entry) => entry.daysSince == null || entry.daysSince >= 120)
      .sort((a, b) => (b.daysSince ?? 99999) - (a.daysSince ?? 99999));

    return { totalDebt, unpaidCount, overdue };
  }, [customers, ordersQuery.data]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Customers</Text>
      <View style={styles.dashboard}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Total Debt</Text>
          <Text style={styles.cardValue}>${dashboard.totalDebt.toFixed(2)}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Unpaid Customers</Text>
          <Text style={styles.cardValue}>{dashboard.unpaidCount}</Text>
        </View>
      </View>
      <View style={styles.overdueBox}>
        <Text style={styles.cardLabel}>Overdue (120+ days)</Text>
        {dashboard.overdue.length === 0 ? (
          <Text style={styles.meta}>None</Text>
        ) : (
          dashboard.overdue.slice(0, 5).map((entry) => (
            <Pressable
              key={entry.customer.id}
              onPress={() => router.push(`/customers/${entry.customer.id}`)}
              style={styles.overdueItem}
            >
              <Text style={styles.name}>{entry.customer.name}</Text>
              <Text style={styles.meta}>
                {entry.daysSince == null ? "No orders yet" : `${entry.daysSince} days ago`}
              </Text>
            </Pressable>
          ))
        )}
      </View>
      <View style={styles.filterRow}>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: unpaidOnly }}
          accessibilityLabel="Show customers with unpaid balance only"
          onPress={() => setUnpaidOnly((prev) => !prev)}
          style={[styles.filterChip, unpaidOnly && styles.filterChipActive]}
        >
          <Text style={[styles.filterText, unpaidOnly && styles.filterTextActive]}>
            {unpaidOnly ? "Showing unpaid" : "Show only unpaid"}
          </Text>
        </Pressable>
        <Text style={styles.meta}>
          {unpaidOnly ? "Filtered by balance > 0" : "All customers"}
        </Text>
      </View>
      {isLoading && <Text style={styles.meta}>Loading...</Text>}
      {isFetching && !isLoading && <Text style={styles.meta}>Refreshing…</Text>}
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.error}>Failed to load customers.</Text>
          <Pressable style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}
      <FlatList
        data={customers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={!isLoading ? <Text style={styles.meta}>No customers yet.</Text> : null}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/customers/${item.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Customer ${item.name}, unpaid ${item.money_balance}`}
            accessibilityHint="Open customer details"
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <View style={styles.rowBetween}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.type}>{item.customer_type}</Text>
            </View>
            <Text style={styles.phone}>{item.phone}</Text>
            <View style={styles.rowBetween}>
              <Text style={styles.meta}>{item.number_of_orders} orders</Text>
              <Text style={[styles.meta, item.money_balance > 0 && styles.unpaid]}>Unpaid: ${item.money_balance}</Text>
            </View>
            <View style={styles.actions}>
              <Pressable
                onPress={() => router.push(`/customers/${item.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Update ${item.name}`}
                style={styles.linkBtn}
              >
                <Text style={styles.linkText}>Update</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push(`/orders/new?customerId=${item.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Add order for ${item.name}`}
                style={styles.linkBtn}
              >
                <Text style={styles.linkText}>Add Order</Text>
              </Pressable>
            </View>
          </Pressable>
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
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 12,
  },
  dashboard: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
  },
  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
  cardLabel: {
    color: "#6b7280",
    fontSize: 12,
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  overdueBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    marginBottom: 8,
    gap: 6,
  },
  overdueItem: {
    paddingVertical: 6,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
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
  },
  filterTextActive: {
    color: "#fff",
  },
  listContent: {
    paddingBottom: 12,
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
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.9,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: {
    fontSize: 18,
    fontWeight: "700",
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
  meta: {
    color: "#666",
    fontSize: 13,
  },
  unpaid: {
    color: "#b00020",
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
