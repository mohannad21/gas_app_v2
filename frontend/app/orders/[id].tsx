import { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useLocalSearchParams, router } from "expo-router";

import { useOrders, useDeleteOrder } from "@/hooks/useOrders";
import { useCustomers } from "@/hooks/useCustomers";
import { useSystems } from "@/hooks/useSystems";
import { gasColor } from "@/constants/gas";
import { calcMoneyUiResult } from "@/lib/ledgerMath";

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

  const netPaid = order.paid_amount ?? 0;
  const remaining = calcMoneyUiResult(order.price_total, netPaid);
  const formatBalance = (value?: number) => {
    const amount = value ?? 0;
    if (amount < 0) return `Credit ${Math.abs(amount).toFixed(0)}`;
    if (amount > 0) return `Debt ${amount.toFixed(0)}`;
    return "Settled";
  };
  const cylBefore = order.cyl_balance_before ?? {};
  const cylAfter = order.cyl_balance_after ?? {};

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Order {order.id}</Text>
      <Text style={styles.meta}>Customer: {customer?.name ?? order.customer_id}</Text>
      <Text style={styles.meta}>System: {system?.name ?? order.system_id}</Text>
      <Text style={styles.meta}>
        Gas{" "}
        <Text style={[styles.meta, { color: gasColor(order.gas_type), fontWeight: "700" }]}>
          {order.gas_type}
        </Text>
      </Text>
      <Text style={styles.meta}>Delivered: {order.delivered_at}</Text>
      <Text style={styles.meta}>
        Cylinders: Installed {order.cylinders_installed} / Received {order.cylinders_received}
      </Text>
      <Text style={styles.meta}>Total: ${order.price_total}</Text>
      <Text style={styles.meta}>Paid: ${netPaid}</Text>
      {typeof order.applied_credit === "number" ? (
        <Text style={styles.meta}>Applied credit: ${order.applied_credit.toFixed(0)}</Text>
      ) : null}
      <Text style={styles.meta}>
        Balance: {formatBalance(order.money_balance_before)} → {formatBalance(order.money_balance_after)}
      </Text>
      <Text style={styles.meta}>
        Cyl 12: {cylBefore["12kg"] ?? 0} → {cylAfter["12kg"] ?? 0}
      </Text>
      <Text style={styles.meta}>
        Cyl 48: {cylBefore["48kg"] ?? 0} → {cylAfter["48kg"] ?? 0}
      </Text>
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

