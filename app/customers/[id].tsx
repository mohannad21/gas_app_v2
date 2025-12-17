import { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Alert, ScrollView } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";

import { useCustomers, useDeleteCustomer } from "@/hooks/useCustomers";
import { useOrders } from "@/hooks/useOrders";
import { useSystems, useDeleteSystem } from "@/hooks/useSystems";

const formatCurrency = (value: number) => {
  const abs = Math.abs(value);
  const prefix = value < 0 ? "-" : "";
  return `${prefix}$${abs.toFixed(2)}`;
};

const formatDeliveredAt = (value?: string) => {
  if (!value) {
    return "-";
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch (err) {
    return value;
  }
};

const formatCylinder = (value: number) => {
  const prefix = value < 0 ? "-" : "";
  return `${prefix}${Math.abs(value)}`;
};

export default function CustomerDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const customersQuery = useCustomers();
  const systemsQuery = useSystems(id);
  const ordersQuery = useOrders();
  const deleteCustomer = useDeleteCustomer();
  const deleteSystem = useDeleteSystem();

  const customer = useMemo(
    () => (customersQuery.data ?? []).find((c) => c.id === id),
    [customersQuery.data, id]
  );
  const systems = systemsQuery.data
    ? Array.from(new Map(systemsQuery.data.map((s) => [s.id, s])).values())
    : [];
  const orders = useMemo(
    () => (ordersQuery.data ?? []).filter((o) => o.customer_id === id),
    [ordersQuery.data, id]
  );

  const orderCylinders = useMemo(() => {
    const totals: Record<"12kg" | "48kg", number> = {
      "12kg": 0,
      "48kg": 0,
    };
    orders.forEach((order) => {
      const gas = (order.gas_type ?? "12kg") as "12kg" | "48kg";
      totals[gas] += order.cylinders_installed ?? 0;
    });
    return totals;
  }, [orders]);

  if (customersQuery.isLoading) {
    return (
      <View style={styles.center}>
        <Text>Loading...</Text>
      </View>
    );
  }

  if (!customer) {
    return (
      <View style={styles.center}>
        <Text>Customer not found.</Text>
      </View>
    );
  }

  const missingStats = [
    {
      label: "Missing 12kg",
      value: formatCylinder(customer.cylinder_balance_12kg),
      highlighted: customer.cylinder_balance_12kg > 0,
    },
    {
      label: "Missing 48kg",
      value: formatCylinder(customer.cylinder_balance_48kg),
      highlighted: customer.cylinder_balance_48kg > 0,
    },
  ];

  const orderStats = [
    {
      label: "Orders 12kg",
      value: `${orderCylinders["12kg"]}`,
      highlighted: orderCylinders["12kg"] === 0,
    },
    {
      label: "Orders 48kg",
      value: `${orderCylinders["48kg"]}`,
      highlighted: orderCylinders["48kg"] === 0,
    },
  ];

  const lastOrder = orders
    .slice()
    .sort((a, b) => new Date(b.delivered_at).getTime() - new Date(a.delivered_at).getTime())[0];
  const lastOrderLabel = lastOrder ? formatDeliveredAt(lastOrder.delivered_at) : "No orders yet";

  const sendWhatsApp = () => {
    const msg = encodeURIComponent(
      `Hello ${customer.name}, this is a reminder from Gas Co. Your current balance is ${formatCurrency(
        customer.money_balance
      )}. Reply if you need a refill.`
    );
    const phone = customer.phone?.replace(/[^0-9+]/g, "") ?? "";
    const url = `https://wa.me/${phone}?text=${msg}`;
    Linking.openURL(url).catch(() => {
      Alert.alert("WhatsApp not available", "Could not open WhatsApp on this device.");
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{customer.name}</Text>
      <View style={styles.metaBlock}>
        <Text style={styles.meta}>Phone: {customer.phone || "n/a"}</Text>
        {customer.notes ? (
          <Text style={styles.meta}>Notes: {customer.notes}</Text>
        ) : null}
        <Text style={styles.meta}>Type: {customer.customer_type}</Text>
        <Text style={styles.meta}>Last order: {lastOrderLabel}</Text>
      </View>
      <View style={styles.unpaidTile}>
        <Text style={styles.statLabel}>Unpaid</Text>
        <Text
          style={[
            styles.statValue,
            customer.money_balance > 0 && styles.warningText,
            styles.unpaid,
          ]}
        >
          {formatCurrency(customer.money_balance)}
        </Text>
      </View>

      <View style={styles.box}>
        <Text style={styles.boxTitle}>Missing units</Text>
        <View style={styles.boxRow}>
          {missingStats.map((stat) => (
            <View key={stat.label} style={styles.boxItem}>
              <Text style={styles.statLabel}>{stat.label}</Text>
              <Text style={[styles.statValue, stat.highlighted && styles.warningText]}>
                {stat.value}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.box}>
        <Text style={styles.boxTitle}>Orders</Text>
        <View style={styles.boxRow}>
          {orderStats.map((stat) => (
            <View key={stat.label} style={styles.boxItem}>
              <Text style={styles.statLabel}>{stat.label}</Text>
              <Text style={[styles.statValue, stat.highlighted && styles.warningText]}>
                {stat.value}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="Edit customer"
          onPress={() => router.push(`/customers/${customer.id}/edit`)}
          style={styles.iconBtn}
        >
          <Ionicons name="build-outline" size={18} color="#0a7ea4" />
        </Pressable>
        <Pressable
          accessibilityLabel="Add order for customer"
          onPress={() => router.push(`/orders/new?customerId=${customer.id}`)}
          style={styles.iconBtn}
        >
          <Ionicons name="add-circle-outline" size={20} color="#0a7ea4" />
        </Pressable>
        <Pressable
          accessibilityLabel="WhatsApp customer"
          onPress={sendWhatsApp}
          style={[styles.iconBtn, styles.whatsAppBtn]}
        >
          <Ionicons name="logo-whatsapp" size={18} color="#fff" />
        </Pressable>
        <Pressable
          accessibilityLabel="Remove customer"
          onPress={() => deleteCustomer.mutate(customer.id)}
          style={styles.iconBtn}
        >
          <Ionicons name="trash" size={18} color="#b00020" />
        </Pressable>
      </View>

      <Text style={[styles.title, { fontSize: 18, marginTop: 12 }]}>Systems</Text>
      {systemsQuery.isLoading && <Text style={styles.meta}>Loading systems...</Text>}
      {systems.length === 0 && !systemsQuery.isLoading && <Text style={styles.meta}>No systems.</Text>}
      {systems.map((sys) => (
        <View key={sys.id} style={styles.systemCard}>
          <Text style={styles.systemTitle}>{sys.name}</Text>
          <Text style={styles.metaLine}>Type: {sys.system_type}</Text>
          <Text style={styles.metaLine}>Gas: {sys.gas_type ?? "12kg"}</Text>
          <Text style={styles.metaLine}>Customer Type: {sys.system_customer_type ?? "private"}</Text>
          <Text style={styles.metaLine}>Active: {(sys.is_active ?? true) ? "Yes" : "No"}</Text>
          {(sys.is_active ?? true) && (
            <>
              <Text style={styles.metaLine}>
                Require Security Check: {(sys.require_security_check ?? false) ? "Yes" : "No"}
              </Text>
              {sys.require_security_check ? (
                <>
                  <Text style={styles.metaLine}>
                    Security Check Exists: {(sys.security_check_exists ?? false) ? "Yes" : "No"}
                  </Text>
                  {sys.security_check_exists ? (
                    <Text style={styles.metaLine}>Last Security Check: {sys.security_check_date || "-"}</Text>
                  ) : null}
                </>
              ) : null}
            </>
          )}
          <View style={styles.systemActions}>
            <Pressable
              onPress={() =>
                Alert.alert("Remove system?", `Delete ${sys.name}?`, [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => deleteSystem.mutate({ id: sys.id, customerId: id }),
                  },
                ])
              }
              style={styles.linkBtn}
            >
              <Text style={[styles.linkText, styles.dangerText]}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ))}

      <Text style={[styles.title, { fontSize: 18, marginTop: 12 }]}>Orders</Text>
      {ordersQuery.isLoading && <Text style={styles.meta}>Loading orders...</Text>}
      {orders.length === 0 && !ordersQuery.isLoading && (
        <Text style={styles.meta}>No orders for this customer.</Text>
      )}
      {orders.map((ord) => {
        const system = systems.find((s) => s.id === ord.system_id);
        const unpaid = ord.price_total - ord.paid_amount;
        return (
          <Pressable key={ord.id} style={styles.orderCard} onPress={() => router.push(`/orders/${ord.id}`)}>
            <View style={styles.orderHeader}>
              <Text style={styles.systemTitle}>{system?.name ?? "System"}</Text>
              <Text style={styles.dateText}>{formatDeliveredAt(ord.delivered_at)}</Text>
            </View>
            <Text style={styles.metaLine}>{system ? system.system_type : "System info pending"}</Text>
            <View style={styles.orderStatsRow}>
              {[
                { label: "Total", value: formatCurrency(ord.price_total), highlight: false },
                {
                  label: "Paid",
                  value: formatCurrency(ord.paid_amount),
                  highlight: ord.paid_amount < ord.price_total,
                },
                {
                  label: "Unpaid",
                  value: unpaid > 0 ? formatCurrency(unpaid) : "Paid",
                  highlight: unpaid > 0,
                },
              ].map((stat) => (
                <View
                  key={stat.label}
                  style={[styles.orderStatCard, stat.highlight && styles.warningBorder]}
                >
                  <Text style={styles.orderStatLabel}>{stat.label}</Text>
                  <Text
                    style={[
                      styles.orderStatValue,
                      stat.highlight ? styles.warningText : styles.linkText,
                    ]}
                  >
                    {stat.value}
                  </Text>
                </View>
              ))}
            </View>
            <View style={styles.orderStatsRow}>
              {[
                {
                  label: "Installed",
                  value: `${ord.cylinders_installed ?? 0}`,
                  highlight: false,
                },
                {
                  label: "Received",
                  value: `${ord.cylinders_received ?? 0}`,
                  highlight: false,
                },
                {
                  label: "Rest",
                  value: `${Math.max(0, (ord.cylinders_installed ?? 0) - (ord.cylinders_received ?? 0))}`,
                  highlight: Math.max(0, (ord.cylinders_installed ?? 0) - (ord.cylinders_received ?? 0)) > 0,
                },
              ].map((stat) => (
                <View
                  key={stat.label}
                  style={[styles.orderStatCard, stat.highlight && styles.warningBorder]}
                >
                  <Text style={styles.orderStatLabel}>{stat.label}</Text>
                  <Text style={styles.orderStatValue}>{stat.value}</Text>
                </View>
              ))}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f7f9fb",
  },
  content: {
    padding: 20,
    gap: 8,
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
    lineHeight: 20,
  },
  metaBlock: {
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#dfe3e6",
    marginBottom: 8,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  statTile: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e4e7ea",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  statLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 4,
    textTransform: "capitalize",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  warningText: {
    color: "#b00020",
  },
  unpaid: {
    color: "#101828",
  },
  unpaidTile: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e4e7ea",
    marginBottom: 12,
  },
  box: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e4e7ea",
  },
  boxTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  boxRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  boxItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
    justifyContent: "flex-end",
  },
  linkBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#e8eef1",
    borderRadius: 10,
  },
  primaryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
  linkText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  dangerText: {
    color: "#b00020",
  },
  iconBtn: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#e8eef1",
  },
  whatsAppBtn: {
    backgroundColor: "#25D366",
  },
  systemCard: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  systemTitle: {
    fontWeight: "700",
    marginBottom: 4,
  },
  metaLine: {
    color: "#444",
  },
  orderCard: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  systemActions: {
    flexDirection: "row",
    marginTop: 8,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  dateText: {
    color: "#6b7280",
    fontSize: 14,
  },
  orderStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 6,
  },
  orderStatCard: {
    flex: 1,
    minWidth: 90,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  orderStatLabel: {
    fontSize: 11,
    color: "#475467",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  orderStatValue: {
    fontSize: 17,
    fontWeight: "700",
  },
  warningBorder: {
    borderColor: "#b00020",
  },
});
