import { useCallback, useMemo, useState } from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { useDailyReportDayV2, useDailyReportsV2 } from "@/hooks/useReports";
import { useInventoryLatest } from "@/hooks/useInventory";
import { useCustomers } from "@/hooks/useCustomers";
import { useOrdersByDay } from "@/hooks/useOrders";
import { useCompanyBalances } from "@/hooks/useCompanyBalances";
import { gasColor } from "@/constants/gas";
import { DailyReportV2Day } from "@/types/domain";
import { formatHourLabel, formatTimeHM, toDateKey } from "@/lib/date";
import { calcMoneyUiResult } from "@/lib/ledgerMath";

const formatMoney = (value: number) => {
  const rounded = Math.round(value);
  if (Math.abs(rounded) >= 1000) {
    const short = Math.round((rounded / 1000) * 10) / 10;
    return `${short}k`;
  }
  return `${rounded}`;
};

const formatCount = (value: number | null | undefined) => (value == null ? "--" : String(value));

type GroupedEvents = Array<{
  hour: string;
  events: DailyReportV2Day["events"];
  cashDelta: number;
}>;

function groupByHour(events: DailyReportV2Day["events"]): GroupedEvents {
  const buckets = new Map<string, DailyReportV2Day["events"]>();
  events.forEach((event) => {
    const key = formatHourLabel(event.effective_at);
    const list = buckets.get(key) ?? [];
    list.push(event);
    buckets.set(key, list);
  });
  return Array.from(buckets.entries()).map(([hour, items]) => {
    const cashDelta = items.reduce((acc, event) => acc + (event.cash_after - event.cash_before), 0);
    return { hour, events: items, cashDelta };
  });
}

export default function DashboardScreen() {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const today = toDateKey(new Date());
  const from = toDateKey(new Date(Date.now() - 1000 * 60 * 60 * 24 * 30));
  const v2Query = useDailyReportsV2(from, today);
  const dayQuery = useDailyReportDayV2(expandedDate ?? today);
  const inventoryLatest = useInventoryLatest();
  const companyBalances = useCompanyBalances();
  const customersQuery = useCustomers();
  const ordersQuery = useOrdersByDay(expandedDate ?? today);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      v2Query.refetch().then(() => setLastUpdated(formatTimeHM(new Date(), { hour12: true })));
      if (expandedDate) {
        dayQuery.refetch();
      }
      customersQuery.refetch();
      companyBalances.refetch();
    }, [expandedDate, v2Query, dayQuery, customersQuery, companyBalances])
  );

  const latestCard = useMemo(() => {
    const cards = v2Query.data ?? [];
    if (!cards.length) return null;
    return cards.reduce((acc, row) => (row.date > acc.date ? row : acc), cards[0]);
  }, [v2Query.data]);

  const customerTotals = useMemo(() => {
    const rows = customersQuery.data ?? [];
    return rows.reduce(
      (acc, customer) => {
        acc.money += customer.money_balance ?? 0;
        acc.cyl12 += customer.cylinder_balance_12kg ?? 0;
        acc.cyl48 += customer.cylinder_balance_48kg ?? 0;
        return acc;
      },
      { money: 0, cyl12: 0, cyl48: 0 }
    );
  }, [customersQuery.data]);

  const currentInventory = inventoryLatest.data ?? null;
  const invFallback = latestCard?.inventory_end ?? null;
  const cashNow = latestCard?.cash_end ?? 0;
  const companyNow = companyBalances.data?.company_money ?? latestCard?.company_end ?? null;
  const invDisplay = currentInventory
    ? { full12: currentInventory.full12, empty12: currentInventory.empty12, full48: currentInventory.full48, empty48: currentInventory.empty48 }
    : companyBalances.data
      ? {
          full12: companyBalances.data.inventory_full_12,
          empty12: companyBalances.data.inventory_empty_12,
          full48: companyBalances.data.inventory_full_48,
          empty48: companyBalances.data.inventory_empty_48,
        }
      : invFallback
      ? { full12: invFallback.full12, empty12: invFallback.empty12, full48: invFallback.full48, empty48: invFallback.empty48 }
      : null;

  const instrumentItems = [
    { key: "cash", icon: "cash-outline", label: "Cash", value: formatMoney(cashNow) },
    {
      key: "inv12",
      icon: "flame-outline",
      label: "12kg",
      value: invDisplay ? `${invDisplay.full12}/${invDisplay.empty12}` : "--/--",
    },
    {
      key: "inv48",
      icon: "bonfire-outline",
      label: "48kg",
      value: invDisplay ? `${invDisplay.full48}/${invDisplay.empty48}` : "--/--",
    },
    { key: "customers", icon: "people-outline", label: "Customers", value: formatMoney(customerTotals.money) },
    { key: "company", icon: "briefcase-outline", label: "Company", value: companyNow != null ? formatMoney(companyNow) : "--" },
  ];

  const showOverflow = collapsed && Dimensions.get("window").width < 360;
  const visibleItems = showOverflow ? instrumentItems.slice(0, 3) : instrumentItems;

  const dayCards = v2Query.data ?? [];

  return (
    <ScrollView
      style={styles.container}
      stickyHeaderIndices={[0]}
      onScroll={(event) => setCollapsed(event.nativeEvent.contentOffset.y > 80)}
      scrollEventThrottle={16}
    >
      <View style={[styles.instrument, collapsed && styles.instrumentCollapsed]}>
        <View style={styles.instrumentRow}>
          {visibleItems.map((item) => (
            <View key={item.key} style={styles.instrumentItem}>
              <Ionicons name={item.icon as any} size={18} color="#0a7ea4" />
              {!collapsed && <Text style={styles.instrumentLabel}>{item.label}</Text>}
              <Text style={styles.instrumentValue}>{item.value}</Text>
            </View>
          ))}
          {showOverflow ? (
            <Pressable style={styles.instrumentItem}>
              <Ionicons name="ellipsis-horizontal" size={18} color="#0a7ea4" />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>All Days</Text>
        <View style={styles.panelRow}>
          <Text style={styles.panelLabel}>Customers outstanding</Text>
          <Text style={styles.panelValue}>{formatMoney(customerTotals.money)}</Text>
        </View>
        <View style={styles.panelRow}>
          <Text style={[styles.panelLabel, { color: gasColor("12kg") }]}>12kg balance</Text>
          <Text style={styles.panelValue}>{formatCount(customerTotals.cyl12)}</Text>
        </View>
        <View style={styles.panelRow}>
          <Text style={[styles.panelLabel, { color: gasColor("48kg") }]}>48kg balance</Text>
          <Text style={styles.panelValue}>{formatCount(customerTotals.cyl48)}</Text>
        </View>
        <View style={styles.panelRow}>
          <Text style={styles.panelLabel}>Cash now</Text>
          <Text style={styles.panelValue}>{formatMoney(cashNow)}</Text>
        </View>
        <View style={styles.panelRow}>
          <Text style={styles.panelLabel}>Inventory now</Text>
          <Text style={styles.panelValue}>
            {invDisplay ? `12 ${invDisplay.full12}/${invDisplay.empty12} · 48 ${invDisplay.full48}/${invDisplay.empty48}` : "--"}
          </Text>
        </View>
        <View style={styles.panelRow}>
          <Text style={styles.panelLabel}>Company payable (latest)</Text>
          <Text style={styles.panelValue}>{companyNow != null ? formatMoney(companyNow) : "--"}</Text>
        </View>
        <Text style={styles.panelMeta}>Updated {lastUpdated ?? "--:--"}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Days</Text>
        {dayCards.map((card) => {
          const isOpen = expandedDate === card.date;
          const deltaCash = card.cash_end - card.cash_start;
          const deltaCompany = (card.company_end ?? 0) - (card.company_start ?? 0);
          const delta12 = (card.inventory_end.full12 ?? 0) - (card.inventory_start.full12 ?? 0);
          const delta48 = (card.inventory_end.full48 ?? 0) - (card.inventory_start.full48 ?? 0);
          return (
            <View key={card.date} style={styles.dayCard}>
              <Pressable onPress={() => setExpandedDate(isOpen ? null : card.date)}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayTitle}>{card.date}</Text>
                  <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={16} color="#0a7ea4" />
                </View>
                <View style={styles.dayRow}>
                  <Text style={styles.dayLabel}>Δ Cash</Text>
                  <Text style={styles.dayValue}>{formatMoney(deltaCash)}</Text>
                </View>
                <View style={styles.dayRow}>
                  <Text style={styles.dayLabel}>Δ Company</Text>
                  <Text style={styles.dayValue}>{formatMoney(deltaCompany)}</Text>
                </View>
                <View style={styles.dayRow}>
                  <Text style={[styles.dayLabel, { color: gasColor("12kg") }]}>Δ 12kg</Text>
                  <Text style={styles.dayValue}>{formatCount(delta12)}</Text>
                </View>
                <View style={styles.dayRow}>
                  <Text style={[styles.dayLabel, { color: gasColor("48kg") }]}>Δ 48kg</Text>
                  <Text style={styles.dayValue}>{formatCount(delta48)}</Text>
                </View>
                <View style={styles.dayRow}>
                  <Text style={styles.dayLabel}>End cash</Text>
                  <Text style={styles.dayValue}>{formatMoney(card.cash_end)}</Text>
                </View>
              </Pressable>
              {isOpen && dayQuery.data ? (
                <DayTimeline
                  day={dayQuery.data}
                  orders={ordersQuery.data ?? []}
                />
              ) : null}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function DayTimeline({
  day,
  orders,
}: {
  day: DailyReportV2Day;
  orders: Array<{ id: string; price_total: number; paid_amount: number; gas_type: "12kg" | "48kg" }>;
}) {
  const orderMap = useMemo(() => {
    const map: Record<string, (typeof orders)[number]> = {};
    orders.forEach((order) => {
      map[order.id] = order;
    });
    return map;
  }, [orders]);

  const grouped = useMemo(() => groupByHour(day.events), [day.events]);

  return (
    <View style={styles.timeline}>
      {grouped.map((group) => (
        <View key={group.hour} style={styles.hourBlock}>
          <View style={styles.hourHeader}>
            <Text style={styles.hourTitle}>{group.hour}</Text>
            <Text style={styles.hourMeta}>
              {group.events.length} events · Δ Cash {formatMoney(group.cashDelta)}
            </Text>
          </View>
          {group.events.map((event) => {
            const order = event.source_id ? orderMap[event.source_id] : undefined;
            const cashDelta = event.cash_after - event.cash_before;
            const invAfter = event.inventory_after;
            const debt = order ? Math.max(0, calcMoneyUiResult(order.price_total, order.paid_amount)) : null;
            return (
              <View key={`${event.event_type}-${event.source_id ?? event.effective_at}`} style={styles.eventCard}>
                <View style={styles.eventHeader}>
                  <Text style={styles.eventTitle}>
                    {event.event_type.toUpperCase()} {event.customer_name ? `- ${event.customer_name}` : ""}
                  </Text>
                  <Text style={styles.eventTime}>{formatTimeHM(event.effective_at, { hour12: true })}</Text>
                </View>
                <View style={styles.chipRow}>
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>Δ {formatMoney(cashDelta)}</Text>
                  </View>
                  {event.buy12 || event.return12 ? (
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>12 +{event.buy12 ?? 0}/-{event.return12 ?? 0}</Text>
                    </View>
                  ) : null}
                  {event.buy48 || event.return48 ? (
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>48 +{event.buy48 ?? 0}/-{event.return48 ?? 0}</Text>
                    </View>
                  ) : null}
                  {debt ? (
                    <View style={[styles.chip, styles.chipWarning]}>
                      <Text style={styles.chipText}>Customer owes (debt) +{formatMoney(debt)}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.resultLine}>Cash after: {formatMoney(event.cash_after)}</Text>
                {invAfter ? (
                  <Text style={styles.resultLine}>
                    Stock after: 12 {formatCount(invAfter.full12)}/{formatCount(invAfter.empty12)} · 48 {formatCount(invAfter.full48)}/{formatCount(invAfter.empty48)}
                  </Text>
                ) : null}
                {event.company_after != null ? (
                  <Text style={styles.resultLine}>Company after: {formatMoney(event.company_after)}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f7f7f8",
  },
  instrument: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
  instrumentCollapsed: {
    paddingVertical: 8,
  },
  instrumentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  instrumentItem: {
    alignItems: "center",
    minWidth: 60,
  },
  instrumentLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    marginTop: 4,
  },
  instrumentValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  panel: {
    margin: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 8,
  },
  panelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  panelLabel: {
    fontSize: 12,
    color: "#475569",
  },
  panelValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
  },
  panelMeta: {
    marginTop: 8,
    fontSize: 11,
    color: "#94a3b8",
  },
  section: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 10,
  },
  dayCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    marginBottom: 12,
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  dayTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  dayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  dayLabel: {
    fontSize: 12,
    color: "#475569",
  },
  dayValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
  },
  timeline: {
    marginTop: 10,
    gap: 10,
  },
  hourBlock: {
    gap: 8,
  },
  hourHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  hourTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
  },
  hourMeta: {
    fontSize: 11,
    color: "#64748b",
  },
  eventCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    gap: 6,
  },
  eventHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  eventTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
  },
  eventTime: {
    fontSize: 11,
    color: "#64748b",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
  },
  chipWarning: {
    backgroundColor: "#fee2e2",
  },
  chipText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0f172a",
  },
  resultLine: {
    fontSize: 11,
    color: "#475569",
  },
});
