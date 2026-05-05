import { useMemo, useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, ScrollView } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { gasColor } from "@/constants/gas";
import { formatDateTimeMedium } from "@/lib/date";
import { getCurrencySymbol, getMoneyDecimals } from "@/lib/money";
import { useFocusEffect } from "@react-navigation/native";
import { useCollections, useDeleteCollection } from "@/hooks/useCollections";
import {
  CUSTOMER_DELETE_BLOCKED_MESSAGE,
  isCustomerDeleteBlockedError,
  useCustomerAdjustments,
  useCustomerBalance,
  useCustomers,
  useDeleteCustomer,
  useDeleteCustomerAdjustment,
} from "@/hooks/useCustomers";
import { useDeleteOrder, useOrders } from "@/hooks/useOrders";
import { useSystems, useDeleteSystem } from "@/hooks/useSystems";
import { Order } from "@/types/domain";
import SlimActivityRow from "@/components/reports/SlimActivityRow";
import {
  collectionToEvent,
  customerAdjustmentToEvent,
  orderToEvent,
} from "@/lib/activityAdapter";
import { DailyReportEvent } from "@/types/report";

type ActivityFilter =
  | "all"
  | "replacement"
  | "late_payment"
  | "return_empties"
  | "buy_empty"
  | "sell_full"
  | "adjustment";

const ACTIVITY_FILTER_OPTIONS: { id: ActivityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "replacement", label: "Replacement" },
  { id: "late_payment", label: "Late payment" },
  { id: "return_empties", label: "Return empties" },
  { id: "buy_empty", label: "Buy empty" },
  { id: "sell_full", label: "Sell full" },
  { id: "adjustment", label: "Adjustments" },
];

const formatCurrency = (value: number) => {
  const abs = Math.abs(value);
  const prefix = value < 0 ? "-" : "";
  return `${prefix}${abs.toFixed(getMoneyDecimals())} ${getCurrencySymbol()}`;
};

const formatDeliveredAt = (value?: string) => {
  if (!value) {
    return "-";
  }
  return formatDateTimeMedium(value, undefined, value);
};

const formatCylinder = (value: number) => {
  const prefix = value < 0 ? "-" : "";
  return `${prefix}${Math.abs(value)}`;
};

const formatProfileField = (value?: string | null, fallback = "Not provided") => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
};

const toTimeValue = (value?: string | null) => {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

export function getLastActiveOrder(orders: Order[]): Order | undefined {
  return orders
    .filter((order) => !order.is_deleted)
    .filter((order) => {
      const mode = order.order_mode ?? "replacement";
      return mode === "replacement" || mode === "sell_iron";
    })
    .sort((a, b) => toTimeValue(b.delivered_at) - toTimeValue(a.delivered_at))[0];
}

export function getOrderCylinders(orders: Order[]): Record<"12kg" | "48kg", number> {
  const totals: Record<"12kg" | "48kg", number> = {
    "12kg": 0,
    "48kg": 0,
  };
  orders.filter((order) => !order.is_deleted).forEach((order) => {
    const mode = order.order_mode ?? "replacement";
    if (mode !== "replacement" && mode !== "sell_iron") {
      return;
    }
    const gas = (order.gas_type ?? "12kg") as "12kg" | "48kg";
    totals[gas] += order.cylinders_installed ?? 0;
  });
  return totals;
}

export function sortCustomerActivityEvents(events: DailyReportEvent[]): DailyReportEvent[] {
  return [...events].sort(
    (a, b) =>
      new Date(b.effective_at).getTime() - new Date(a.effective_at).getTime() ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}


function DetailBalanceBox({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <View style={styles.balanceBox}>
      <Text style={[styles.balanceBoxLabel, accent ? { color: accent } : null]}>{label}</Text>
      <Text style={styles.balanceBoxValue}>{value}</Text>
    </View>
  );
}

export default function CustomerDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const customerId = Array.isArray(id) ? id[0] : id;
  const [selectedFilter, setSelectedFilter] = useState<ActivityFilter>("all");
  const [selectedSystemName, setSelectedSystemName] = useState("all");
  const customersQuery = useCustomers();
  const balancesQuery = useCustomerBalance(customerId);
  const collectionsQuery = useCollections(false);
  const systemsQuery = useSystems(id, { enabled: !!id });
  const ordersQuery = useOrders(false);
  const adjustmentsQuery = useCustomerAdjustments(customerId);
  const deleteCustomer = useDeleteCustomer();
  const deleteSystem = useDeleteSystem();
  const deleteOrder = useDeleteOrder();
  const deleteCollection = useDeleteCollection();
  const deleteAdjustment = useDeleteCustomerAdjustment();
  const focusRefetchers = useRef({
    orders: ordersQuery.refetch,
    collections: collectionsQuery.refetch,
    adjustments: adjustmentsQuery.refetch,
  });

  focusRefetchers.current = {
    orders: ordersQuery.refetch,
    collections: collectionsQuery.refetch,
    adjustments: adjustmentsQuery.refetch,
  };

  const customer = useMemo(
    () => (customersQuery.data ?? []).find((c) => c.id === customerId),
    [customersQuery.data, customerId]
  );
  const balances = balancesQuery.data;
  const systems = useMemo(
    () =>
      systemsQuery.data
        ? Array.from(new Map(systemsQuery.data.map((s) => [s.id, s])).values())
        : [],
    [systemsQuery.data]
  );
  const systemsById = useMemo(
    () => new Map(systems.map((system) => [system.id, system.name])),
    [systems]
  );
  const orders = useMemo(
    () => (ordersQuery.data ?? []).filter((o) => String(o.customer_id) === String(customerId)),
    [ordersQuery.data, customerId]
  );
  const collections = useMemo(
    () => (collectionsQuery.data ?? []).filter((item) => String(item.customer_id) === String(customerId)),
    [collectionsQuery.data, customerId]
  );
  const adjustments = useMemo(() => adjustmentsQuery.data ?? [], [adjustmentsQuery.data]);

  useFocusEffect(
    useCallback(() => {
      focusRefetchers.current.orders();
      focusRefetchers.current.collections();
      focusRefetchers.current.adjustments();
    }, [customerId])
  );

  const orderCylinders = useMemo(() => getOrderCylinders(orders), [orders]);

  const activities = useMemo((): DailyReportEvent[] => {
    const orderEvents = (orders ?? []).map((o) =>
      orderToEvent(o, {
        customerName: customer?.name,
        customerDescription: customer?.note ?? null,
        systemName: o.system_id ? systemsById.get(o.system_id) : undefined,
      })
    );
    const collectionEvents = (collections ?? []).map((c) =>
      collectionToEvent(c, {
        customerName: customer?.name,
        customerDescription: customer?.note ?? null,
      })
    );
    const adjustmentEvents = (adjustments ?? []).map((a) =>
      customerAdjustmentToEvent(a, {
        customerName: customer?.name,
        customerDescription: customer?.note ?? null,
      })
    );
    return sortCustomerActivityEvents([...orderEvents, ...collectionEvents, ...adjustmentEvents]);
  }, [orders, collections, adjustments, customer, systemsById]);

  const filteredActivities = useMemo(() => {
    let next = activities;
    if (selectedFilter !== "all") {
      next = next.filter((e) => {
        switch (selectedFilter) {
          case "replacement":
            return e.event_type === "order" && e.order_mode === "replacement";
          case "late_payment":
            return e.event_type === "collection_money";
          case "return_empties":
            return e.event_type === "collection_empty";
          case "buy_empty":
            return e.event_type === "order" && e.order_mode === "buy_iron";
          case "sell_full":
            return e.event_type === "order" && e.order_mode === "sell_iron";
          case "adjustment":
            return e.event_type === "customer_adjust";
          default:
            return true;
        }
      });
    }
    if (selectedFilter === "replacement" && selectedSystemName !== "all") {
      next = next.filter((e) => e.system_name === selectedSystemName);
    }
    return next;
  }, [activities, selectedFilter, selectedSystemName]);

  const replacementSystemOptions = useMemo(
    () => [{ id: "all", label: "All systems" }, ...systems.map((system) => ({ id: system.name, label: system.name }))],
    [systems]
  );

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
    },
    {
      label: "12kg balance",
      value: formatCylinder(cylBalance12),
      gas: "12kg" as const,
    },
    {
      label: "48kg balance",
      value: formatCylinder(cylBalance48),
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

  const lastOrder = getLastActiveOrder(orders);
  const lastOrderLabel = lastOrder ? formatDeliveredAt(lastOrder.delivered_at) : "No orders yet";
  const activeSystems = systems.filter((system) => system.is_active !== false).length;
  const activitiesLoading =
    ordersQuery.isLoading || collectionsQuery.isLoading || adjustmentsQuery.isLoading;
  const activitiesRefreshing =
    ordersQuery.isFetching || collectionsQuery.isFetching || adjustmentsQuery.isFetching;
  const activitiesError = ordersQuery.error || collectionsQuery.error || adjustmentsQuery.error;

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
    Alert.alert("Delete customer?", "This will remove the customer from the list.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCustomer.mutateAsync(customer.id);
          } catch (error: any) {
            if (isCustomerDeleteBlockedError(error)) {
              Alert.alert("Cannot delete customer", CUSTOMER_DELETE_BLOCKED_MESSAGE);
            } else {
              Alert.alert("Delete failed", "Could not delete this customer. Please try again.");
            }
          }
        },
      },
    ]);
  };

  const handleDeleteOrder = (orderId: string) => {
    Alert.alert("Delete order?", "This will reverse the order and update related balances.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteOrder.mutate(orderId);
        },
      },
    ]);
  };

  const handleDeleteAdjustment = (adjustmentId: string) => {
    Alert.alert(
      "Delete adjustment?",
      "This will reverse the balance adjustment and update the customer's ledger.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteAdjustment.mutate({ id: adjustmentId, customerId }),
        },
      ]
    );
  };

  const handleDeleteCollection = (collectionId: string) => {
    Alert.alert("Delete collection?", "This will remove the collection and update related balances.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteCollection.mutate(collectionId);
        },
      },
    ]);
  };

  const handleFilterPress = (nextFilter: ActivityFilter) => {
    setSelectedFilter(nextFilter);
    if (nextFilter !== "replacement") {
      setSelectedSystemName("all");
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View style={styles.heroTitleBlock}>
            <Text style={styles.title}>{customer.name}</Text>
            <Text style={styles.heroDescription}>
              {formatProfileField(customer.note, "No description")}
            </Text>
            <Text style={styles.heroLocation}>
              {formatProfileField(customer.address, "No location")}
            </Text>
          </View>
        </View>
        <View style={styles.profileGrid}>
          <View style={styles.profileItem}>
            <Text style={styles.profileLabel}>Phone</Text>
            <Text style={styles.profileValue}>{formatProfileField(customer.phone, "No phone")}</Text>
          </View>
          <View style={styles.profileItem}>
            <Text style={styles.profileLabel}>Last order</Text>
            <Text style={styles.profileValue}>{lastOrderLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.summaryGrid}>
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
        <Text style={styles.sectionTitle}>Activities</Text>
        <Text style={styles.sectionMeta}>
          {activitiesRefreshing && !activitiesLoading ? "Refreshing..." : `${filteredActivities.length} shown`}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {ACTIVITY_FILTER_OPTIONS.map((option) => {
          const active = selectedFilter === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => handleFilterPress(option.id)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {selectedFilter === "replacement" ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.secondaryFilterRow}
          style={styles.filterScroll}
        >
          {replacementSystemOptions.map((option) => {
            const active = selectedSystemName === option.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => {
                  setSelectedSystemName(option.id);
                }}
                style={[styles.secondaryFilterChip, active && styles.secondaryFilterChipActive]}
              >
                <Text
                  style={[
                    styles.secondaryFilterChipText,
                    active && styles.secondaryFilterChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={styles.detailBalancesBlock}>
        <View style={styles.detailBalancesRow}>
          {balanceStats.map((stat) => (
            <DetailBalanceBox
              key={stat.label}
              label={stat.label}
              value={stat.value}
              accent={stat.gas ? gasColor(stat.gas) : undefined}
            />
          ))}
        </View>
      </View>

      {activitiesLoading ? <Text style={styles.meta}>Loading activities...</Text> : null}
      {activitiesError ? <Text style={styles.errorText}>Could not load customer activities.</Text> : null}
      {!activitiesLoading && !activitiesError && filteredActivities.length === 0 ? (
        <Text style={styles.meta}>No activities match this filter yet.</Text>
      ) : null}

      {!activitiesLoading &&
        !activitiesError &&
        filteredActivities.map((event) => {
          const fmtMoney = (v: number) => Number(v || 0).toFixed(getMoneyDecimals());
          const isOrder = event.event_type === "order";
          const isCollection =
            event.event_type === "collection_money" ||
            event.event_type === "collection_empty" ||
            event.event_type === "collection_payout";

          const isAdjustment = event.event_type === "customer_adjust";

          return (
            <SlimActivityRow
              key={event.id}
              event={event}
              formatMoney={fmtMoney}
              showCreatedAt
              showEffectiveAtBottom
              onEdit={isOrder ? () => router.push(`/orders/${event.id}/edit`) : undefined}
              onDelete={
                isOrder
                  ? () => handleDeleteOrder(event.id!)
                  : isCollection
                    ? () => handleDeleteCollection(event.id!)
                    : isAdjustment
                      ? () => handleDeleteAdjustment(event.id!)
                      : undefined
              }
            />
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
    paddingBottom: 28,
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
  errorText: {
    color: "#b00020",
    fontWeight: "700",
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
    gap: 8,
  },
  heroDescription: {
    color: "#0f172a",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  heroLocation: {
    color: "#64748b",
    fontSize: 14,
    lineHeight: 20,
  },
  profileGrid: {
    flexDirection: "row",
    gap: 10,
  },
  profileItem: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    padding: 12,
    gap: 4,
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
  balanceNote: {
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
  filterScroll: {
    marginHorizontal: -20,
  },
  filterRow: {
    paddingHorizontal: 20,
    gap: 8,
  },
  secondaryFilterRow: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#e8eef1",
  },
  filterChipActive: {
    backgroundColor: "#0a7ea4",
  },
  filterChipText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  filterChipTextActive: {
    color: "#fff",
  },
  secondaryFilterChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#eef2f6",
  },
  secondaryFilterChipActive: {
    backgroundColor: "#dbeafe",
  },
  secondaryFilterChipText: {
    color: "#475467",
    fontWeight: "600",
  },
  secondaryFilterChipTextActive: {
    color: "#0a7ea4",
  },
  detailBalancesBlock: {
    gap: 8,
  },
  detailBalancesRow: {
    flexDirection: "row",
    gap: 8,
  },
  balanceBox: {
    flex: 1,
    minHeight: 76,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  balanceBoxLabel: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "800",
  },
  balanceBoxValue: {
    color: "#0f172a",
    fontSize: 16,
    lineHeight: 18,
    fontWeight: "900",
    marginTop: "auto",
  },
  activityCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d8dee6",
    gap: 10,
  },
  activityCardExpanded: {
    borderColor: "#c0d8f0",
  },
  activityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  activityTitleBlock: {
    flex: 1,
    gap: 3,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  activityTimestamp: {
    fontSize: 12,
    color: "#64748b",
  },
  activitySummary: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 20,
    fontWeight: "600",
  },
  activityTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  activityTag: {
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
  },
  activityTagText: {
    color: "#475467",
    fontSize: 12,
    fontWeight: "600",
  },
  activityExpanded: {
    gap: 12,
    paddingTop: 4,
  },
  deltaGrid: {
    gap: 10,
  },
  deltaBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#d8dee6",
    gap: 8,
  },
  deltaBoxLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  deltaBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  deltaBadgePositive: {
    backgroundColor: "#dcfce7",
  },
  deltaBadgeNegative: {
    backgroundColor: "#fee2e2",
  },
  deltaBadgeNeutral: {
    backgroundColor: "#e2e8f0",
  },
  deltaBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
  },
  deltaBoxRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  deltaBoxValue: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  deltaBoxArrow: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "700",
  },
  activityLinkBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#e8eef1",
    borderRadius: 10,
  },
});

