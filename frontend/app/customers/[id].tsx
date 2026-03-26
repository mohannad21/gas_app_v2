import { useMemo, useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, ScrollView } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { gasColor } from "@/constants/gas";
import { formatDateTimeMedium } from "@/lib/date";
import { useFocusEffect } from "@react-navigation/native";
import { useCollections } from "@/hooks/useCollections";
import {
  CUSTOMER_DELETE_BLOCKED_MESSAGE,
  isCustomerDeleteBlockedError,
  useCustomerAdjustments,
  useCustomerBalance,
  useCustomers,
  useDeleteCustomer,
} from "@/hooks/useCustomers";
import { useOrders } from "@/hooks/useOrders";
import { useSystems, useDeleteSystem } from "@/hooks/useSystems";
import { CollectionEvent, CustomerAdjustment, Order } from "@/types/domain";

type ActivityFilter =
  | "all"
  | "replacement"
  | "late_payment"
  | "return_empties"
  | "buy_empty"
  | "sell_full"
  | "adjustment";

type ActivityKind =
  | "replacement"
  | "late_payment"
  | "return_empties"
  | "buy_empty"
  | "sell_full"
  | "adjustment"
  | "payout";

type CustomerActivityItem = {
  id: string;
  kind: ActivityKind;
  title: string;
  summary: string;
  effectiveAt: string;
  createdAt?: string;
  systemId?: string | null;
  systemName?: string | null;
  note?: string | null;
  moneyBefore: number;
  moneyAfter: number;
  cyl12Before: number;
  cyl12After: number;
  cyl48Before: number;
  cyl48After: number;
  orderId?: string;
};

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
  return `${prefix}$${abs.toFixed(2)}`;
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

const formatSignedValue = (value: number, format: (v: number) => string) => {
  if (value === 0) return "No change";
  return `${value > 0 ? "+" : ""}${format(value)}`;
};

const formatQtySummary = (qty12?: number | null, qty48?: number | null, suffix = "") => {
  const parts: string[] = [];
  if (qty12) parts.push(`${qty12} x 12kg${suffix}`);
  if (qty48) parts.push(`${qty48} x 48kg${suffix}`);
  return parts.join(" | ");
};

const toTimeValue = (value?: string | null) => {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

function ActivityDeltaBox({
  label,
  before,
  after,
  format,
  accent,
}: {
  label: string;
  before: number;
  after: number;
  format: (value: number) => string;
  accent?: string;
}) {
  const delta = after - before;
  const isNoChange = delta === 0;

  return (
    <View style={[styles.deltaBox, accent ? { borderColor: accent } : null]}>
      <Text style={styles.deltaBoxLabel}>{label}</Text>
      <View
        style={[
          styles.deltaBadge,
          isNoChange ? styles.deltaBadgeNeutral : delta > 0 ? styles.deltaBadgePositive : styles.deltaBadgeNegative,
        ]}
      >
        <Text style={styles.deltaBadgeText}>{formatSignedValue(delta, format)}</Text>
      </View>
      <View style={styles.deltaBoxRow}>
        <Text style={styles.deltaBoxValue}>{format(before)}</Text>
        <Text style={styles.deltaBoxArrow}>{"->"}</Text>
        <Text style={styles.deltaBoxValue}>{format(after)}</Text>
      </View>
    </View>
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

function buildOrderActivity(order: Order, systemsById: Map<string, string>): CustomerActivityItem {
  const mode = order.order_mode ?? "replacement";
  const gas = order.gas_type ?? "12kg";
  const installed = order.cylinders_installed ?? 0;
  const received = order.cylinders_received ?? 0;
  const totalAmount = order.price_total ?? 0;
  const paidAmount = order.paid_amount ?? 0;
  const moneyDelta = mode === "buy_iron" ? paidAmount - totalAmount : totalAmount - paidAmount;
  const cylinderDelta = mode === "replacement" ? installed - received : 0;
  const delta12 = gas === "12kg" ? cylinderDelta : 0;
  const delta48 = gas === "48kg" ? cylinderDelta : 0;
  const moneyAfter = order.debt_cash ?? 0;
  const cyl12After = order.debt_cylinders_12 ?? 0;
  const cyl48After = order.debt_cylinders_48 ?? 0;

  if (mode === "replacement") {
    return {
      id: `order-${order.id}`,
      kind: "replacement",
      title: "Replacement",
      summary: `Installed ${installed} x ${gas}${received > 0 ? ` | Received ${received} empties` : ""}`,
      effectiveAt: order.delivered_at,
      createdAt: order.created_at,
      systemId: order.system_id || null,
      systemName: order.system_id ? systemsById.get(order.system_id) ?? "System" : null,
      note: order.note,
      moneyBefore: moneyAfter - moneyDelta,
      moneyAfter,
      cyl12Before: cyl12After - delta12,
      cyl12After,
      cyl48Before: cyl48After - delta48,
      cyl48After,
      orderId: order.id,
    };
  }

  if (mode === "sell_iron") {
    return {
      id: `order-${order.id}`,
      kind: "sell_full",
      title: "Sell full",
      summary: `Sold ${installed} x ${gas}`,
      effectiveAt: order.delivered_at,
      createdAt: order.created_at,
      systemId: order.system_id || null,
      systemName: order.system_id ? systemsById.get(order.system_id) ?? "System" : null,
      note: order.note,
      moneyBefore: moneyAfter - moneyDelta,
      moneyAfter,
      cyl12Before: cyl12After,
      cyl12After,
      cyl48Before: cyl48After,
      cyl48After,
      orderId: order.id,
    };
  }

  const boughtQty = received > 0 ? received : installed;
  return {
    id: `order-${order.id}`,
    kind: "buy_empty",
    title: "Buy empty",
    summary: `Bought ${boughtQty} x ${gas} empties`,
    effectiveAt: order.delivered_at,
    createdAt: order.created_at,
    systemId: order.system_id || null,
    systemName: order.system_id ? systemsById.get(order.system_id) ?? "System" : null,
    note: order.note,
    moneyBefore: moneyAfter - moneyDelta,
    moneyAfter,
    cyl12Before: cyl12After,
    cyl12After,
    cyl48Before: cyl48After,
    cyl48After,
    orderId: order.id,
  };
}

function buildCollectionActivity(collection: CollectionEvent): CustomerActivityItem {
  const moneyAfter = collection.debt_cash ?? 0;
  const cyl12After = collection.debt_cylinders_12 ?? 0;
  const cyl48After = collection.debt_cylinders_48 ?? 0;

  if (collection.action_type === "payment") {
    const amount = collection.amount_money ?? 0;
    return {
      id: `collection-${collection.id}`,
      kind: "late_payment",
      title: "Late payment",
      summary: amount > 0 ? `Collected ${formatCurrency(amount)}` : "Collected payment",
      effectiveAt: collection.effective_at ?? collection.created_at ?? "",
      createdAt: collection.created_at ?? collection.effective_at ?? "",
      note: collection.note,
      moneyBefore: moneyAfter + amount,
      moneyAfter,
      cyl12Before: cyl12After,
      cyl12After,
      cyl48Before: cyl48After,
      cyl48After,
    };
  }

  if (collection.action_type === "payout") {
    const amount = collection.amount_money ?? 0;
    return {
      id: `collection-${collection.id}`,
      kind: "payout",
      title: "Payout",
      summary: amount > 0 ? `Paid customer ${formatCurrency(amount)}` : "Customer payout",
      effectiveAt: collection.effective_at ?? collection.created_at ?? "",
      createdAt: collection.created_at ?? collection.effective_at ?? "",
      note: collection.note,
      moneyBefore: moneyAfter - amount,
      moneyAfter,
      cyl12Before: cyl12After,
      cyl12After,
      cyl48Before: cyl48After,
      cyl48After,
    };
  }

  const qty12 = collection.qty_12kg ?? 0;
  const qty48 = collection.qty_48kg ?? 0;
  return {
    id: `collection-${collection.id}`,
    kind: "return_empties",
    title: "Return empties",
    summary: formatQtySummary(qty12, qty48, " empties") || "Returned empties",
    effectiveAt: collection.effective_at ?? collection.created_at ?? "",
    createdAt: collection.created_at ?? collection.effective_at ?? "",
    note: collection.note,
    moneyBefore: moneyAfter,
    moneyAfter,
    cyl12Before: cyl12After + qty12,
    cyl12After,
    cyl48Before: cyl48After + qty48,
    cyl48After,
  };
}

function buildAdjustmentActivity(adjustment: CustomerAdjustment): CustomerActivityItem {
  const moneyDelta = adjustment.amount_money ?? 0;
  const delta12 = adjustment.count_12kg ?? 0;
  const delta48 = adjustment.count_48kg ?? 0;
  const moneyAfter = adjustment.debt_cash ?? 0;
  const cyl12After = adjustment.debt_cylinders_12 ?? 0;
  const cyl48After = adjustment.debt_cylinders_48 ?? 0;
  const summaryParts = [
    moneyDelta ? `Money ${formatSignedValue(moneyDelta, formatCurrency)}` : null,
    delta12 ? `12kg ${formatSignedValue(delta12, formatCylinder)}` : null,
    delta48 ? `48kg ${formatSignedValue(delta48, formatCylinder)}` : null,
  ].filter(Boolean);

  return {
    id: `adjustment-${adjustment.id}`,
    kind: "adjustment",
    title: "Adjustment",
    summary: summaryParts.length > 0 ? summaryParts.join(" | ") : "Manual correction",
    effectiveAt: adjustment.effective_at,
    createdAt: adjustment.created_at,
    note: adjustment.reason,
    moneyBefore: moneyAfter - moneyDelta,
    moneyAfter,
    cyl12Before: cyl12After - delta12,
    cyl12After,
    cyl48Before: cyl48After - delta48,
    cyl48After,
  };
}

export default function CustomerDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const customerId = Array.isArray(id) ? id[0] : id;
  const [selectedFilter, setSelectedFilter] = useState<ActivityFilter>("all");
  const [selectedSystemId, setSelectedSystemId] = useState("all");
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
  const customersQuery = useCustomers();
  const balancesQuery = useCustomerBalance(customerId);
  const collectionsQuery = useCollections();
  const systemsQuery = useSystems(id, { enabled: !!id });
  const ordersQuery = useOrders();
  const adjustmentsQuery = useCustomerAdjustments(customerId);
  const deleteCustomer = useDeleteCustomer();
  const deleteSystem = useDeleteSystem();

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
      ordersQuery.refetch();
      collectionsQuery.refetch();
      adjustmentsQuery.refetch();
    }, [adjustmentsQuery, collectionsQuery, ordersQuery])
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

  const activities = useMemo(() => {
    const items: CustomerActivityItem[] = [
      ...orders.map((order) => buildOrderActivity(order, systemsById)),
      ...collections.map((collection) => buildCollectionActivity(collection)),
      ...adjustments.map((adjustment) => buildAdjustmentActivity(adjustment)),
    ];

    return items.sort((left, right) => {
      const effectiveGap = toTimeValue(right.effectiveAt) - toTimeValue(left.effectiveAt);
      if (effectiveGap !== 0) return effectiveGap;
      return toTimeValue(right.createdAt) - toTimeValue(left.createdAt);
    });
  }, [adjustments, collections, orders, systemsById]);

  const filteredActivities = useMemo(() => {
    let next = activities;
    if (selectedFilter !== "all") {
      next = next.filter((activity) => activity.kind === selectedFilter);
    }
    if (selectedFilter === "replacement" && selectedSystemId !== "all") {
      next = next.filter((activity) => activity.systemId === selectedSystemId);
    }
    return next;
  }, [activities, selectedFilter, selectedSystemId]);

  const replacementSystemOptions = useMemo(
    () => [{ id: "all", label: "All systems" }, ...systems.map((system) => ({ id: system.id, label: system.name }))],
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

  const lastOrder = orders
    .slice()
    .sort((a, b) => toTimeValue(b.delivered_at) - toTimeValue(a.delivered_at))[0];
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

  const handleFilterPress = (nextFilter: ActivityFilter) => {
    setSelectedFilter(nextFilter);
    setExpandedActivityId(null);
    if (nextFilter !== "replacement") {
      setSelectedSystemId("all");
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
            const active = selectedSystemId === option.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => {
                  setSelectedSystemId(option.id);
                  setExpandedActivityId(null);
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
        <Text style={styles.balanceNote}>Positive = Customer owes. Negative = Customer credit.</Text>
      </View>

      {activitiesLoading ? <Text style={styles.meta}>Loading activities...</Text> : null}
      {activitiesError ? <Text style={styles.errorText}>Could not load customer activities.</Text> : null}
      {!activitiesLoading && !activitiesError && filteredActivities.length === 0 ? (
        <Text style={styles.meta}>No activities match this filter yet.</Text>
      ) : null}

      {!activitiesLoading &&
        !activitiesError &&
        filteredActivities.map((activity) => {
          const expanded = expandedActivityId === activity.id;
          return (
            <Pressable
              key={activity.id}
              onPress={() => setExpandedActivityId(expanded ? null : activity.id)}
              style={[styles.activityCard, expanded && styles.activityCardExpanded]}
            >
              <View style={styles.activityHeader}>
                <View style={styles.activityTitleBlock}>
                  <Text style={styles.activityTitle}>{activity.title}</Text>
                  <Text style={styles.activityTimestamp}>{formatDeliveredAt(activity.effectiveAt)}</Text>
                </View>
                <Ionicons
                  name={expanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color="#64748b"
                />
              </View>

              <Text style={styles.activitySummary}>{activity.summary}</Text>

              <View style={styles.activityTagRow}>
                {activity.systemName ? (
                  <View style={styles.activityTag}>
                    <Text style={styles.activityTagText}>{activity.systemName}</Text>
                  </View>
                ) : null}
                {activity.note ? (
                  <View style={styles.activityTag}>
                    <Text style={styles.activityTagText} numberOfLines={1}>
                      {activity.note}
                    </Text>
                  </View>
                ) : null}
              </View>

              {expanded ? (
                <View style={styles.activityExpanded}>
                  <View style={styles.deltaGrid}>
                    <ActivityDeltaBox
                      label="Money"
                      before={activity.moneyBefore}
                      after={activity.moneyAfter}
                      format={formatCurrency}
                    />
                    <ActivityDeltaBox
                      label="12kg"
                      before={activity.cyl12Before}
                      after={activity.cyl12After}
                      format={formatCylinder}
                      accent={gasColor("12kg")}
                    />
                    <ActivityDeltaBox
                      label="48kg"
                      before={activity.cyl48Before}
                      after={activity.cyl48After}
                      format={formatCylinder}
                      accent={gasColor("48kg")}
                    />
                  </View>

                  {activity.orderId ? (
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: "/orders/[id]",
                          params: { id: activity.orderId! },
                        })
                      }
                      style={styles.activityLinkBtn}
                    >
                      <Text style={styles.linkText}>Open order</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
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

