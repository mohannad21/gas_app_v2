import { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useLocalSearchParams, router } from "expo-router";

import { useOrders, useDeleteOrder } from "@/hooks/useOrders";
import { useCustomers } from "@/hooks/useCustomers";
import { useSystems } from "@/hooks/useSystems";

export default function OrderDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ordersQuery = useOrders();
  const customersQuery = useCustomers();
  const systemsQuery = useSystems();
  const deleteOrder = useDeleteOrder();

  const order = useMemo(() => (ordersQuery.data ?? []).find((o) => o.id === id), [ordersQuery.data, id]);
  const customer = useMemo(
    () => (order ? (customersQuery.data ?? []).find((c) => c.id === order.customer_id) : undefined),
    [customersQuery.data, order]
  );
  const system = useMemo(
    () => (order ? (systemsQuery.data ?? []).find((s) => s.id === order.system_id) : undefined),
    [systemsQuery.data, order]
  );

  if (ordersQuery.isLoading) {
    return (
      <View style={styles.center}>
        <Text>Loading...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.center}>
        <Text>Order not found.</Text>
      </View>
    );
  }

  const remaining = order.price_total - order.paid_amount;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Order {order.id}</Text>
      <Text style={styles.meta}>Customer: {customer?.name ?? order.customer_id}</Text>
      <Text style={styles.meta}>System: {system?.name ?? order.system_id}</Text>
      <Text style={styles.meta}>
        System Type: {system?.system_type ?? "n/a"} • Gas {system?.gas_type ?? order.gas_type}
      </Text>
      <Text style={styles.meta}>Delivered: {order.delivered_at}</Text>
      <Text style={styles.meta}>
        Cylinders: Installed {order.cylinders_installed} / Received {order.cylinders_received}
      </Text>
      <Text style={styles.meta}>Total: ${order.price_total} | Paid: ${order.paid_amount}</Text>
      <Text style={[styles.meta, remaining > 0 ? styles.unpaid : styles.paid]}>
        {remaining > 0 ? `Unpaid $${remaining}` : "Paid"}
      </Text>
      {order.note ? <Text style={styles.meta}>Note: {order.note}</Text> : null}

      <View style={styles.actions}>
        <Pressable onPress={() => router.push(`/orders/${order.id}/edit`)} style={styles.linkBtn}>
          <Text style={styles.linkText}>Update</Text>
        </Pressable>
        <Pressable onPress={() => deleteOrder.mutate(order.id)} style={styles.linkBtn}>
          <Text style={[styles.linkText, styles.dangerText]}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 6,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  meta: {
    color: "#333",
  },
  unpaid: {
    color: "#b00020",
    fontWeight: "700",
  },
  paid: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
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
  dangerText: {
    color: "#b00020",
  },
});
