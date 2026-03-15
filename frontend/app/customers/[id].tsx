import { useMemo, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Alert, ScrollView } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { gasColor } from "@/constants/gas";
import { formatDateMedium, formatDateTimeMedium, formatTimeHM } from "@/lib/date";
import { useFocusEffect } from "@react-navigation/native";

import { useCustomerBalance, useCustomers, useDeleteCustomer } from "@/hooks/useCustomers";
import { useOrders } from "@/hooks/useOrders";
import { useSystems, useDeleteSystem } from "@/hooks/useSystems";
import { calcCustomerCylinderDelta, calcMoneyUiResult } from "@/lib/ledgerMath";

const formatCurrency = (value: number) => {
  const abs = Math.abs(value);
  const prefix = value < 0 ? "-" : "";
  return `${prefix}$${abs.toFixed(2)}`;
};

const formatDeliveredAt = (value?: string) => {
  if (!value) {
    return "-";
  }
  return formatDateTimeMedium(value, undefined, value);
};

const formatOrderDate = (value?: string) => (value ? formatDateMedium(value, undefined, "-") : "-");
const formatOrderTime = (value?: string) => (value ? formatTimeHM(value) : "--:--");

const formatCylinder = (value: number) => {
  const prefix = value < 0 ? "-" : "";
  return `${prefix}${Math.abs(value)}`;
};

const formatProfileField = (value?: string | null, fallback = "Not provided") => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
};

export default function CustomerDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const customerId = Array.isArray(id) ? id[0] : id;
  const customersQuery = useCustomers();
  const balancesQuery = useCustomerBalance(customerId);
  const systemsQuery = useSystems(id, { enabled: !!id });
  const ordersQuery = useOrders();
  const deleteCustomer = useDeleteCustomer();
  const deleteSystem = useDeleteSystem();

  const customer = useMemo(
    () => (customersQuery.data ?? []).find((c) => c.id === customerId),
    [customersQuery.data, customerId]
  );
  const balances = balancesQuery.data;
  const systems = systemsQuery.data
    ? Array.from(new Map(systemsQuery.data.map((s) => [s.id, s])).values())
    : [];
  const orders = useMemo(
    () => (ordersQuery.data ?? []).filter((o) => String(o.customer_id) === String(customerId)),
    [ordersQuery.data, customerId]
  );

  useFocusEffect(
    useCallback(() => {
      ordersQuery.refetch();
    }, [ordersQuery])
  );

  const orderCylinders = useMemo(() => {
    const totals: Record<"12kg" | "48kg", number> = {
      "12kg": 0,
      "48kg": 0,
    };
    orders.forEach((order) => {
      const mode = order.order_mode ?? "replacement";
      if (mode !== "replacement" && mode !== "sell_iron") {
        return;
      }
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

  const moneyBalance = balances?.money_balance ?? customer.money_balance ?? 0;
  const cylBalance12 = balances?.cylinder_balance_12kg ?? customer.cylinder_balance_12kg ?? 0;
  const cylBalance48 = balances?.cylinder_balance_48kg ?? customer.cylinder_balance_48kg ?? 0;

  const balanceStats = [
    {
      label: "Money balance",
      value: formatCurrency(moneyBalance),
      highlighted: moneyBalance > 0,
    },
    {
      label: "12kg balance",
      value: formatCylinder(cylBalance12),
      highlighted: cylBalance12 > 0,
      gas: "12kg" as const,
    },
    {
      label: "48kg balance",
      value: formatCylinder(cylBalance48),
      highlighted: cylBalance48 > 0,
      gas: "48kg" as const,
    },
  ];

  const orderedStats = [
    {
      label: "12kg",
      value: `${orderCylinders["12kg"]}`,
      gas: "12kg" as const,
    },
    {
      label: "48kg",
      value: `${orderCylinders["48kg"]}`,
      gas: "48kg" as const,
    },
  ];

  const lastOrder = orders
    .slice()
    .sort((a, b) => new Date(b.delivered_at).getTime() - new Date(a.delivered_at).getTime())[0];
  const lastActivityLabel = lastOrder ? formatDeliveredAt(lastOrder.delivered_at) : "No activity yet";
  const activeSystems = systems.filter((system) => system.is_active !== false).length;

  const sendWhatsApp = () => {
    const msg = encodeURIComponent(
      `Hello ${customer.name}, this is a reminder from Gas Co. Your current balance is ${formatCurrency(
        moneyBalance
      )}. Reply if you need a refill.`
    );
    const phone = customer.phone?.replace(/[^0-9+]/g, "") ?? "";
    const url = `https://wa.me/${phone}?text=${msg}`;
    Linking.openURL(url).catch(() => {
      Alert.alert("WhatsApp not available", "Could not open WhatsApp on this device.");
    });
  };

  const handleDeleteCustomer = () => {
    const hasOrders = orders.length > 0 || (customer.order_count ?? 0) > 0;
    if (hasOrders) {
      Alert.alert(
        "Cannot delete customer",
        "You cannot delete this customer while they still have orders. Remove or reassign their orders first."
      );
      return;
    }
    Alert.alert("Delete customer?", "This will remove the customer from the list.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCustomer.mutateAsync(customer.id);
          } catch (error: any) {
            const detail = error?.response?.data?.detail;
            if (error?.response?.status === 409 || detail === "customer_has_orders") {
              Alert.alert(
                "Cannot delete customer",
                "You cannot delete this customer while they still have orders. Remove or reassign their orders first."
              );
            } else {
              Alert.alert("Delete failed", "Could not delete this customer. Please try again.");
            }
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View style={styles.heroTitleBlock}>
            <Text style={styles.title}>{customer.name}</Text>
            <Text style={styles.heroSubtitle}>Customer profile</Text>
          </View>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeLabel}>Last activity</Text>
            <Text style={styles.heroBadgeValue}>{lastActivityLabel}</Text>
          </View>
        </View>
        <View style={styles.profileGrid}>
          <View style={styles.profileItem}>
            <Text style={styles.profileLabel}>Phone</Text>
            <Text style={styles.profileValue}>{formatProfileField(customer.phone, "No phone")}</Text>
          </View>
          <View style={styles.profileItem}>
            <Text style={styles.profileLabel}>Location</Text>
            <Text style={styles.profileValue}>{formatProfileField(customer.address, "No location")}</Text>
          </View>
          <View style={[styles.profileItem, styles.profileItemWide]}>
            <Text style={styles.profileLabel}>Description</Text>
            <Text style={styles.profileValue}>{formatProfileField(customer.note, "No description")}</Text>
          </View>
        </View>
        <View style={styles.headerMetaRow}>
          <View style={styles.headerMetaChip}>
            <Text style={styles.headerMetaLabel}>Active systems</Text>
            <Text style={styles.headerMetaValue}>{activeSystems}</Text>
          </View>
          <View style={styles.headerMetaChip}>
            <Text style={styles.headerMetaLabel}>Created</Text>
            <Text style={styles.headerMetaValue}>{formatOrderDate(customer.created_at)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.summaryGrid}>
        <View style={[styles.box, styles.summaryCardWide]}>
          <Text style={styles.boxTitle}>Balances</Text>
          <View style={styles.balanceRow}>
            {balanceStats.map((stat) => {
              const labelColor = stat.gas ? gasColor(stat.gas) : undefined;
              return (
                <View key={stat.label} style={styles.balanceItem}>
                  <Text style={[styles.statLabel, labelColor ? { color: labelColor } : null]}>
                    {stat.label}
                  </Text>
                  <Text style={[styles.statValue, stat.highlighted && styles.warningText]}>
                    {stat.value}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.balanceNote}>
            Positive = Customer owes (debt). Negative = Customer credit.
          </Text>
        </View>

        <View style={[styles.box, styles.summaryCard]}>
          <Text style={styles.boxTitle}>Cylinders Ordered</Text>
          <Text style={styles.boxSubtitle}>Lifetime cylinders installed or sold by gas type.</Text>
          <View style={styles.boxRow}>
            {orderedStats.map((stat) => (
              <View key={stat.label} style={styles.boxItem}>
                <Text style={[styles.statLabel, { color: gasColor(stat.gas) }]}>{stat.label}</Text>
                <Text style={styles.statValue}>{stat.value}</Text>
              </View>
            ))}
          </View>
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
          onPress={handleDeleteCustomer}
          style={styles.iconBtn}
        >
          <Ionicons name="trash" size={18} color="#b00020" />
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Systems</Text>
        <Text style={styles.sectionMeta}>
          {systems.length > 0 ? `${activeSystems} active` : "No systems yet"}
        </Text>
      </View>
      {systemsQuery.isLoading && <Text style={styles.meta}>Loading systems...</Text>}
      {systems.length === 0 && !systemsQuery.isLoading && <Text style={styles.meta}>No systems.</Text>}
      {systems.map((sys) => (
        <View key={sys.id} style={styles.systemCard}>
          <Text style={styles.systemTitle}>{sys.name}</Text>
          {sys.note ? <Text style={styles.metaLine}>Note: {sys.note}</Text> : null}
          <Text style={styles.metaLine}>Gas: {sys.gas_type ?? "12kg"}</Text>
          <Text style={styles.metaLine}>Active: {(sys.is_active ?? true) ? "Yes" : "No"}</Text>
          <View style={styles.systemActions}>
            <Pressable
              onPress={() => router.push(`/systems/${sys.id}`)}
              style={styles.linkBtn}
            >
              <Text style={styles.linkText}>Edit</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                Alert.alert("Remove system?", `Delete ${sys.name}?`, [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                      try {
                        await deleteSystem.mutateAsync({ id: sys.id, customerId: id });
                      } catch (error: any) {
                        const detail = error?.response?.data?.detail;
                        if (error?.response?.status === 409 || detail === "system_has_orders") {
                          Alert.alert(
                            "Cannot delete system",
                            "This system has orders. Set it to inactive instead."
                          );
                        } else {
                          Alert.alert("Delete failed", "Could not delete system. Please try again.");
                        }
                      }
                    },
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

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Order History</Text>
        <Text style={styles.sectionMeta}>Existing history stays unchanged in this view.</Text>
      </View>
      {ordersQuery.isLoading && <Text style={styles.meta}>Loading orders...</Text>}
      {orders.length === 0 && !ordersQuery.isLoading && (
        <Text style={styles.meta}>No orders for this customer.</Text>
      )}
      {orders.map((ord) => {
        const system = systems.find((s) => s.id === ord.system_id);
        const totalAmount = ord.price_total ?? 0;
        const paidAmount = ord.paid_amount ?? 0;
        const unpaid = calcMoneyUiResult(totalAmount, paidAmount);
        const cylDelta = calcCustomerCylinderDelta(
          ord.order_mode ?? "replacement",
          ord.cylinders_installed ?? 0,
          ord.cylinders_received ?? 0
        );
        const remainingCyl = Math.max(0, cylDelta);
        return (
          <Pressable key={ord.id} style={styles.orderCard} onPress={() => router.push(`/orders/${ord.id}`)}>
            <View style={styles.orderHeader}>
              <Text style={styles.systemTitle}>{system?.name ?? "System"}</Text>
              <Text style={styles.dateText}>
                {formatOrderDate(ord.delivered_at)} {formatOrderTime(ord.delivered_at)}
              </Text>
            </View>
            <Text style={styles.metaLine}>{ord.gas_type ?? "12kg"}</Text>
            <View style={styles.orderStatsRow}>
              {[
                { label: "Total", value: formatCurrency(totalAmount), highlight: false },
                {
                  label: "Paid",
                  value: formatCurrency(paidAmount),
                  highlight: paidAmount < totalAmount,
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
                  value: `${remainingCyl}`,
                  highlight: remainingCyl > 0,
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
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0f172a",
  },
  meta: {
    color: "#333",
    lineHeight: 20,
  },
  heroCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#dfe3e6",
    gap: 14,
  },
  heroHeader: {
    gap: 12,
  },
  heroTitleBlock: {
    gap: 4,
  },
  heroSubtitle: {
    color: "#64748b",
    fontSize: 14,
  },
  heroBadge: {
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#dbe3ea",
    alignSelf: "flex-start",
    minWidth: 180,
    gap: 2,
  },
  heroBadgeLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  heroBadgeValue: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "600",
  },
  profileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  profileItem: {
    minWidth: 140,
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  profileItemWide: {
    minWidth: "100%",
  },
  profileLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  profileValue: {
    color: "#0f172a",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  headerMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  headerMetaChip: {
    flex: 1,
    minWidth: 120,
    backgroundColor: "#eef6ff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  headerMetaLabel: {
    color: "#4b5563",
    fontSize: 12,
  },
  headerMetaValue: {
    color: "#0a7ea4",
    fontSize: 16,
    fontWeight: "700",
  },
  summaryGrid: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "700",
  },
  sectionMeta: {
    flex: 1,
    textAlign: "right",
    color: "#64748b",
    fontSize: 13,
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
  box: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e4e7ea",
    gap: 8,
  },
  boxTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  boxSubtitle: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 18,
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  balanceItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
  },
  balanceNote: {
    marginTop: 8,
    fontSize: 12,
    color: "#64748b",
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
  summaryCard: {
    minHeight: 140,
  },
  summaryCardWide: {
    minHeight: 150,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "flex-start",
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
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
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

