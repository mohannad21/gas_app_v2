import { useMemo, useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, ScrollView, Modal } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { gasColor } from "@/constants/gas";
import { FontFamilies, FontSizes } from "@/constants/typography";
import { formatDateTimeMedium } from "@/lib/date";
import { ACTIVITY_KIND_META, normalizeEventType, type ActivityKind } from "@/lib/activityKindMeta";
import { isCustomerReviewFiltered, resolveFilterLabel } from "@/lib/filterHelpers";
import { getKindOptions, getSubFilterOptions } from "@/lib/filterOptions";
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
import FilterChipRow from "@/components/add/FilterChipRow";
import SlimActivityRow from "@/components/reports/SlimActivityRow";
import {
  collectionToEvent,
  customerAdjustmentToEvent,
  orderToEvent,
} from "@/lib/activityAdapter";
import { DailyReportEvent } from "@/types/report";
import {
  ACTIVITY_SORT_WORDING,
  SCREEN_STATE_WORDING,
} from "@/lib/wording";

type ActivityFilter =
  | "replacement"
  | "late_payment"
  | "payout"
  | "return_empties"
  | "buy_empty"
  | "sell_full"
  | "adjustment";
type ActivitySortMode = "created_desc" | "created_asc" | "effective_desc" | "effective_asc";

const ACTIVITY_FILTER_OPTIONS: { id: ActivityFilter; label: string }[] = [
  ...getKindOptions("customer")
    .map((option) => {
      const id =
        option.id === "payment_from_customer"
          ? "late_payment"
          : option.id === "payment_to_customer"
            ? "payout"
            : option.id === "customer_return_empties"
              ? "return_empties"
              : option.id === "buy_empty_from_customer"
                ? "buy_empty"
                : option.id === "adjust_customer_balance"
                  ? "adjustment"
                  : option.id;
      return { id: id as ActivityFilter, label: resolveFilterLabel(id, "customer") };
    }),
];

const CUSTOMER_FILTER_TO_KIND: Record<ActivityFilter, ActivityKind> = {
  replacement: "replacement",
  late_payment: "payment_from_customer",
  payout: "payment_to_customer",
  return_empties: "customer_return_empties",
  buy_empty: "buy_empty_from_customer",
  sell_full: "sell_full",
  adjustment: "adjust_customer_balance",
};

const CUSTOMER_KIND_TO_FILTER = Object.fromEntries(
  Object.entries(CUSTOMER_FILTER_TO_KIND).map(([filterId, kind]) => [kind, filterId])
) as Partial<Record<ActivityKind, ActivityFilter>>;

const matchesDebtCreditSubFilter = (event: DailyReportEvent, subFilterId: string) => {
  const moneyDiff = (event.order_total ?? 0) - (event.order_paid ?? 0);
  const cylDiff = (event.order_installed ?? 0) - (event.order_received ?? 0);
  switch (subFilterId) {
    case "money_debt": return moneyDiff > 0;
    case "money_credit": return moneyDiff < 0;
    case "12kg_debt": return event.gas_type === "12kg" && cylDiff > 0;
    case "12kg_credit": return event.gas_type === "12kg" && cylDiff < 0;
    case "48kg_debt": return event.gas_type === "48kg" && cylDiff > 0;
    case "48kg_credit": return event.gas_type === "48kg" && cylDiff < 0;
    default: return true;
  }
};

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
  return sortCustomerActivityEventsByMode(events, "created_desc");
}

function sortCustomerActivityEventsByMode(events: DailyReportEvent[], mode: ActivitySortMode) {
  const getTime = (value?: string | null) => {
    const parsed = Date.parse(String(value ?? ""));
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  return [...events].sort((a, b) => {
    const primaryA = mode.startsWith("created") ? getTime(a.created_at) : getTime(a.effective_at);
    const primaryB = mode.startsWith("created") ? getTime(b.created_at) : getTime(b.effective_at);
    if (primaryA !== primaryB) {
      return mode.endsWith("_asc") ? primaryA - primaryB : primaryB - primaryA;
    }
    const secondaryA = mode.startsWith("created") ? getTime(a.effective_at) : getTime(a.created_at);
    const secondaryB = mode.startsWith("created") ? getTime(b.effective_at) : getTime(b.created_at);
    if (secondaryA !== secondaryB) {
      return secondaryB - secondaryA;
    }
    return String(b.id ?? "").localeCompare(String(a.id ?? ""));
  });
}

const ACTIVITY_SORT_ORDER: ActivitySortMode[] = [
  "created_desc",
  "created_asc",
  "effective_desc",
  "effective_asc",
];


function DetailBalanceBox({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state: "Debt" | "Credit" | "Balanced";
}) {
  const valueColor =
    state === "Debt" ? "#b42318" : state === "Credit" ? "#16a34a" : "#0f172a";
  return (
    <View style={styles.balanceBox}>
      <Text style={styles.balanceBoxLabel}>{label}</Text>
      <Text style={[styles.balanceBoxValue, { color: valueColor }]}>{value}</Text>
      <Text style={styles.balanceBoxState}>{state}</Text>
    </View>
  );
}

function getCustomerBalanceState(value: number): "Debt" | "Credit" | "Balanced" {
  if (value > 0) return "Debt";
  if (value < 0) return "Credit";
  return "Balanced";
}

function formatAbsoluteCurrency(value: number) {
  return `${Math.abs(value).toFixed(getMoneyDecimals())} ${getCurrencySymbol()}`;
}

function formatAbsoluteCylinder(value: number) {
  return `${Math.abs(value)}`;
}

export default function CustomerDetailsScreen() {
  const { id, highlightId } = useLocalSearchParams<{ id: string; highlightId?: string }>();
  const customerId = Array.isArray(id) ? id[0] : id;
  const [selectedFilter, setSelectedFilter] = useState<ActivityFilter | null>(null);
  const [selectedLevel2, setSelectedLevel2] = useState<string | null>(null);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [activitySortMode, setActivitySortMode] = useState<ActivitySortMode>("created_desc");
  const [sortPickerVisible, setSortPickerVisible] = useState(false);
  const [highlightItemId, setHighlightItemId] = useState<string | null>(null);
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
      return () => setHighlightItemId(null);
    }, [customerId])
  );

  useEffect(() => {
    const rawId = Array.isArray(highlightId) ? highlightId[0] : highlightId;
    if (!rawId) return;
    setHighlightItemId(rawId);
    const timer = setTimeout(() => setHighlightItemId((c) => (c === rawId ? null : c)), 7200);
    return () => clearTimeout(timer);
  }, [highlightId]);

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

  const availableActivityFilters = useMemo(() => {
    const visible = new Set<ActivityFilter>();
    for (const event of activities) {
      const kind = normalizeEventType(event.event_type, { order_mode: event.order_mode ?? undefined });
      if (!kind || !ACTIVITY_KIND_META[kind].surfaces.customerReview) continue;

      const filterId = CUSTOMER_KIND_TO_FILTER[kind];
      if (filterId) visible.add(filterId);
    }
    return ACTIVITY_FILTER_OPTIONS.filter((option) => visible.has(option.id));
  }, [activities]);

  const level2Options = useMemo(() => {
    if (!selectedFilter) return [] as { id: string; label: string }[];
    const options = getSubFilterOptions("customer", CUSTOMER_FILTER_TO_KIND[selectedFilter]);
    switch (selectedFilter) {
      case "replacement":
      case "sell_full":
        return options.filter((option) =>
          activities.some((event) => {
            const kind = normalizeEventType(event.event_type, { order_mode: event.order_mode ?? undefined });
            return kind === CUSTOMER_FILTER_TO_KIND[selectedFilter] && matchesDebtCreditSubFilter(event, option.id);
          })
        );
      case "return_empties": {
        const has12 = collections.some((item) => item.action_type === "return" && Number(item.qty_12kg ?? 0) > 0);
        const has48 = collections.some((item) => item.action_type === "return" && Number(item.qty_48kg ?? 0) > 0);
        return options.filter((option) => (option.id === "12kg" && has12) || (option.id === "48kg" && has48));
      }
      case "buy_empty": {
        const mode = selectedFilter === "buy_empty" ? "buy_iron" : "sell_iron";
        const has12 = orders.some((order) => !order.is_deleted && order.order_mode === mode && order.gas_type === "12kg");
        const has48 = orders.some((order) => !order.is_deleted && order.order_mode === mode && order.gas_type === "48kg");
        return options.filter((option) => (option.id === "12kg" && has12) || (option.id === "48kg" && has48));
      }
      case "adjustment": {
        const hasMoney = adjustments.some((item) => Number(item.amount_money ?? 0) !== 0);
        const has12 = adjustments.some((item) => Number(item.count_12kg ?? 0) !== 0);
        const has48 = adjustments.some((item) => Number(item.count_48kg ?? 0) !== 0);
        return options.filter((option) =>
          (option.id === "money" && hasMoney) || (option.id === "12kg" && has12) || (option.id === "48kg" && has48)
        );
      }
      default:
        return [];
    }
  }, [activities, adjustments, collections, orders, selectedFilter]);

  const filteredActivities = useMemo(() => {
    let next = activities;
    if (selectedFilter) {
      next = next.filter((e) => {
        switch (selectedFilter) {
          case "replacement": {
            const k = normalizeEventType(e.event_type, { order_mode: e.order_mode ?? undefined });
            return k === "replacement";
          }
          case "late_payment": {
            const k = normalizeEventType(e.event_type);
            return k === "payment_from_customer";
          }
          case "payout": {
            const k = normalizeEventType(e.event_type);
            return k === "payment_to_customer";
          }
          case "return_empties": {
            const k = normalizeEventType(e.event_type);
            return k === "customer_return_empties";
          }
          case "buy_empty": {
            const k = normalizeEventType(e.event_type, { order_mode: e.order_mode ?? undefined });
            return k === "buy_empty_from_customer";
          }
          case "sell_full": {
            const k = normalizeEventType(e.event_type, { order_mode: e.order_mode ?? undefined });
            return k === "sell_full";
          }
          case "adjustment": {
            const k = normalizeEventType(e.event_type);
            return k === "adjust_customer_balance";
          }
          default:
            return true;
        }
      });
    }
    if (!selectedFilter || !selectedLevel2) {
      return sortCustomerActivityEventsByMode(next, activitySortMode);
    }
    switch (selectedFilter) {
      case "replacement":
      case "sell_full":
        return sortCustomerActivityEventsByMode(next.filter((event) => matchesDebtCreditSubFilter(event, selectedLevel2)), activitySortMode);
      case "return_empties":
        return sortCustomerActivityEventsByMode(next.filter(
          (event) =>
            (selectedLevel2 === "12kg" && Number(event.return12 ?? 0) > 0) ||
            (selectedLevel2 === "48kg" && Number(event.return48 ?? 0) > 0)
        ), activitySortMode);
      case "buy_empty":
        return sortCustomerActivityEventsByMode(next.filter((event) => event.gas_type === selectedLevel2), activitySortMode);
      case "adjustment":
        return sortCustomerActivityEventsByMode(next.filter(
          (event) =>
            (selectedLevel2 === "money" &&
              Number((event.customer_money_after ?? 0) - (event.customer_money_before ?? 0)) !== 0) ||
            (selectedLevel2 === "12kg" &&
              Number((event.customer_12kg_after ?? 0) - (event.customer_12kg_before ?? 0)) !== 0) ||
            (selectedLevel2 === "48kg" &&
              Number((event.customer_48kg_after ?? 0) - (event.customer_48kg_before ?? 0)) !== 0)
        ), activitySortMode);
      default:
        return sortCustomerActivityEventsByMode(next, activitySortMode);
    }
  }, [activities, activitySortMode, adjustments, collections, orders, selectedFilter, selectedLevel2]);
  const openSortPicker = () => setSortPickerVisible(true);
  const showFilterBadge = isCustomerReviewFiltered({
    selectedFilter,
    selectedLevel2,
  });

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
      value: formatAbsoluteCurrency(moneyBalance),
      state: getCustomerBalanceState(moneyBalance),
    },
    {
      label: "12kg balance",
      value: formatAbsoluteCylinder(cylBalance12),
      state: getCustomerBalanceState(cylBalance12),
      gas: "12kg" as const,
    },
    {
      label: "48kg balance",
      value: formatAbsoluteCylinder(cylBalance48),
      state: getCustomerBalanceState(cylBalance48),
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

  return (
    <>
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

      <View style={styles.detailBalancesSection}>
        <View style={styles.detailBalancesHeader}>
          <Text style={styles.detailBalancesTitle}>Customer Balances</Text>
        </View>
        <View style={styles.detailBalancesContent}>
          <View style={styles.detailBalancesRow}>
            {balanceStats.map((stat) => (
              <DetailBalanceBox
                key={stat.label}
                label={stat.label}
                value={stat.value}
                state={stat.state}
              />
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
        <View>
          <Text style={styles.sectionTitle}>Activities</Text>
          <Text style={styles.sectionMeta}>
            {activitiesRefreshing && !activitiesLoading ? "Refreshing..." : `${filteredActivities.length} shown`}
          </Text>
        </View>
        <View style={styles.activityToolbar}>
          <Pressable style={styles.toolbarIconButton} onPress={() => setFiltersVisible((current) => !current)}>
            <Ionicons name="filter-outline" size={18} color="#0a7ea4" />
            {showFilterBadge ? <View style={styles.filterBadge} /> : null}
          </Pressable>
          <Pressable style={styles.toolbarIconButton} onPress={openSortPicker}>
            <Ionicons name="swap-vertical-outline" size={18} color="#0a7ea4" />
          </Pressable>
        </View>
      </View>

      {filtersVisible && availableActivityFilters.length > 1 ? (
        <FilterChipRow
          options={availableActivityFilters}
          value={selectedFilter}
          onChange={(next) => {
            setSelectedFilter(next);
            setSelectedLevel2(null);
          }}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
        />
      ) : null}

      {filtersVisible && selectedFilter && level2Options.length > 1 ? (
        <FilterChipRow
          options={level2Options}
          value={selectedLevel2}
          onChange={setSelectedLevel2}
          style={styles.filterScroll}
          contentContainerStyle={styles.secondaryFilterRow}
        />
      ) : null}

      {activitiesLoading ? <Text style={styles.meta}>{SCREEN_STATE_WORDING.loadingActivities}</Text> : null}
      {activitiesError ? <Text style={styles.errorText}>{SCREEN_STATE_WORDING.failedCustomerActivities}</Text> : null}
      {!activitiesLoading && !activitiesError && filteredActivities.length === 0 ? (
        <Text style={styles.meta}>{SCREEN_STATE_WORDING.noActivitiesMatchFilter}</Text>
      ) : null}

      {!activitiesLoading &&
        !activitiesError &&
        filteredActivities.map((event) => {
          const fmtMoney = (v: number) => Number(v || 0).toFixed(getMoneyDecimals());
          const _evKind = normalizeEventType(event.event_type, { order_mode: event.order_mode ?? undefined });
          const isOrder = _evKind === "replacement" || _evKind === "sell_full" || _evKind === "buy_empty_from_customer";
          const isCollection =
            _evKind === "payment_from_customer" ||
            _evKind === "customer_return_empties" ||
            _evKind === "payment_to_customer";

          const isAdjustment = _evKind === "adjust_customer_balance";

          return (
            <SlimActivityRow
              key={event.id}
              event={event}
              formatMoney={fmtMoney}
              showCreatedAt
              showEffectiveAtBottom
              highlight={String(event.id) === highlightItemId}
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

    <Modal visible={sortPickerVisible} transparent animationType="fade" onRequestClose={() => setSortPickerVisible(false)}>
      <Pressable style={styles.sortPickerOverlay} onPress={() => setSortPickerVisible(false)}>
        <View style={styles.sortPickerCard}>
          <Text style={styles.sortPickerTitle}>{ACTIVITY_SORT_WORDING.title}</Text>
          {ACTIVITY_SORT_ORDER.map((sortMode) => (
            <Pressable
              key={sortMode}
              style={styles.sortPickerOption}
              onPress={() => { setActivitySortMode(sortMode); setSortPickerVisible(false); }}
            >
              <View style={styles.sortPickerOptionContent}>
                <Text style={[styles.sortPickerOptionText, sortMode === activitySortMode && styles.sortPickerOptionActive]}>
                  {ACTIVITY_SORT_WORDING.labels[sortMode]}
                </Text>
                {sortMode === "created_desc" ? (
                  <Text style={styles.sortPickerRecommended}>{ACTIVITY_SORT_WORDING.recommended}</Text>
                ) : null}
              </View>
              {sortMode === activitySortMode ? (
                <Ionicons name="checkmark" size={16} color="#0a7ea4" />
              ) : null}
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
    </>
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
  activityToolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  toolbarIconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d7dde4",
    position: "relative",
  },
  filterBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
  },
  sortPickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  sortPickerCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 280,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  sortPickerTitle: {
    fontSize: 13,
    fontFamily: FontFamilies.semibold,
    color: "#64748b",
    paddingHorizontal: 16,
    paddingVertical: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sortPickerOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sortPickerOptionContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sortPickerOptionText: {
    fontSize: 14,
    fontFamily: FontFamilies.regular,
    color: "#1e293b",
  },
  sortPickerOptionActive: {
    fontFamily: FontFamilies.semibold,
    color: "#0a7ea4",
  },
  sortPickerRecommended: {
    fontSize: 11,
    fontFamily: FontFamilies.regular,
    color: "#64748b",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
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
  detailBalancesSection: {
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  detailBalancesHeader: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  detailBalancesTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "700",
  },
  detailBalancesContent: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  detailBalancesRow: {
    flexDirection: "row",
    gap: 8,
  },
  balanceBox: {
    flex: 1,
    minHeight: 88,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 4,
  },
  balanceBoxLabel: {
    color: "#475569",
    fontWeight: "800",
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.xs,
  },
  balanceBoxValue: {
    fontWeight: "900",
    fontFamily: FontFamilies.extrabold,
    fontSize: FontSizes.sm,
    lineHeight: 18,
  },
  balanceBoxState: {
    marginTop: "auto",
    color: "#64748b",
    fontWeight: "700",
    fontFamily: FontFamilies.regular,
    fontSize: FontSizes.xs,
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

