import { useState } from "react";
import { FlatList, View, Text, StyleSheet, Pressable } from "react-native";

import { useDailyReports } from "@/hooks/useReports";
import { useOrdersByDay } from "@/hooks/useOrders";
import { DailyReportRow, InventorySnapshot } from "@/types/domain";

type NormalizedSnapshot = {
  as_of: string;
  reason?: string | null;
  full12: number;
  empty12: number;
  total12: number;
  full48: number;
  empty48: number;
  total48: number;
};

export default function ReportsScreen() {
  const { data, isLoading, error } = useDailyReports();
  const [expanded, setExpanded] = useState<string | null>(null);

  const formatMoney = (value: number) => Number(value || 0).toFixed(0);
  const formatSnapshot = (snap?: InventorySnapshot | null): NormalizedSnapshot | null => {
    if (!snap) return null;
    return {
      full12: snap.full12 ?? 0,
      empty12: snap.empty12 ?? 0,
      total12: snap.total12 ?? (snap.full12 ?? 0) + (snap.empty12 ?? 0),
      full48: snap.full48 ?? 0,
      empty48: snap.empty48 ?? 0,
      total48: snap.total48 ?? (snap.full48 ?? 0) + (snap.empty48 ?? 0),
      as_of: snap.as_of,
      reason: snap.reason,
    };
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Daily Reports</Text>
      {isLoading && <Text style={styles.meta}>Loading...</Text>}
      {error && <Text style={styles.error}>Failed to load reports.</Text>}
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.date}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={!isLoading ? <Text style={styles.meta}>No reports yet.</Text> : null}
        renderItem={({ item }) => {
          const unpaid = item.expected - item.received;
          const missing12 = Math.max(0, item.installed12 - item.received12);
          const missing48 = Math.max(0, item.installed48 - item.received48);
          const missingParts = [
            missing12 ? `12kg: ${missing12}` : null,
            missing48 ? `48kg: ${missing48}` : null,
          ].filter(Boolean) as string[];
          const missingTotal = missing12 + missing48;
          const orders = item.orders ?? [];
          const totalsByGas = (gas: "12kg" | "48kg") =>
            orders.reduce(
              (acc, order) => {
                const orderGas = (order as any).gas ?? (order as any).gas_type;
                if (orderGas !== gas) return acc;
                const total = (order as any).total ?? (order as any).price_total ?? 0;
                const paid = (order as any).paid ?? (order as any).paid_amount ?? 0;
                return { total: acc.total + total, paid: acc.paid + paid };
              },
              { total: 0, paid: 0 }
            );
          const totals12 = totalsByGas("12kg");
          const totals48 = totalsByGas("48kg");
          const startInv = formatSnapshot(item.inventory_start);
          const endInv = formatSnapshot(item.inventory_end);

          const isOpen = expanded === item.date;
          const weekday = new Date(item.date).toLocaleDateString("en-US", { weekday: "short" });
          return (
            <Pressable onPress={() => setExpanded(isOpen ? null : item.date)} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
              <View style={styles.rowBetween}>
                <Text style={styles.date}>
                  {weekday}, {item.display}
                </Text>
                <View style={{ alignItems: "flex-end" }}>
                  <View style={styles.statusRow}>
                    <Text style={[styles.statusText, styles.paid]}>Paid {formatMoney(item.received)}</Text>
                    {unpaid > 0 && (
                      <Text style={[styles.statusText, styles.unpaid]}> - Unpaid {formatMoney(unpaid)}</Text>
                    )}
                  </View>
                  <Text style={[styles.statusText, missingTotal > 0 ? styles.unpaid : styles.paid]}>
                    {missingTotal > 0 ? `Missing ${missingParts.join(" - ")}` : "Returned"}
                  </Text>
                </View>
              </View>
      <View style={styles.table}>
        <View style={[styles.tableRow, styles.tableHeader]}>
          <Text style={[styles.tableCell, styles.tableHeadText]}>Gas</Text>
          <Text style={[styles.tableCell, styles.tableHeadText]}>Installed</Text>
          <Text style={[styles.tableCell, styles.tableHeadText]}>Received</Text>
          <Text style={[styles.tableCell, styles.tableHeadText]}>Total</Text>
          <Text style={[styles.tableCell, styles.tableHeadText]}>Paid</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={[styles.tableCell, styles.tableLabel]}>12kg</Text>
          <Text style={styles.tableCell}>{item.installed12}</Text>
          <Text style={styles.tableCell}>{item.received12}</Text>
          <Text style={styles.tableCell}>{formatMoney(totals12.total)}</Text>
          <Text style={styles.tableCell}>{formatMoney(totals12.paid)}</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={[styles.tableCell, styles.tableLabel]}>48kg</Text>
          <Text style={styles.tableCell}>{item.installed48}</Text>
          <Text style={styles.tableCell}>{item.received48}</Text>
          <Text style={styles.tableCell}>{formatMoney(totals48.total)}</Text>
          <Text style={styles.tableCell}>{formatMoney(totals48.paid)}</Text>
        </View>
      </View>
              {isOpen && (
                <View style={styles.expanded}>
                  <InventoryBlock title="" snapshot={endInv} />
                  <OrdersForDay date={item.date} orders={item.orders} />
                  <InventoryBlock title="" snapshot={startInv} />
                </View>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function OrdersForDay({ date, orders }: { date: string; orders?: DailyReportRow["orders"] }) {
  const shouldFetch = !orders || orders.length === 0;
  const { data, isLoading, error } = useOrdersByDay(shouldFetch ? date : undefined);
  const list = orders ?? data ?? [];
  return (
    <View style={styles.sectionBlock}>
      <Text style={styles.expandedTitle}>Orders</Text>
      {shouldFetch && isLoading && <Text style={styles.orderMeta}>Loading...</Text>}
      {error && shouldFetch && <Text style={[styles.orderMeta, styles.unpaid]}>Failed to load.</Text>}
      {list.map((order) => {
        // Support enriched shape from daily reports or raw orders
        const name = (order as any).customer ?? (order as any).id;
        const system = (order as any).system ?? (order as any).system_id ?? "";
        const customerNotes =
          (order as any).note ??
          (order as any).customer_notes ??
          (order as any).customer_description ??
          (order as any).customer_details ??
          "";
        const gas = (order as any).gas ?? (order as any).gas_type;
        const installed = (order as any).installed ?? (order as any).cylinders_installed;
        const received = (order as any).receivedCyl ?? (order as any).cylinders_received;
        const total = (order as any).total ?? (order as any).price_total;
        const paid = (order as any).paid ?? (order as any).paid_amount;
        const orderUnpaid = (total || 0) - (paid || 0);
        const unreturned = (installed || 0) - (received || 0);
        const receivedLow = (received || 0) < (installed || 0);
        const underpaid = (paid || 0) < (total || 0);

        return (
          <View key={order.id} style={styles.orderRow}>
            <View>
              <Text style={styles.orderName}>{name}</Text>
              {customerNotes ? <Text style={styles.orderMeta}>{customerNotes}</Text> : null}
              <Text style={styles.orderMeta}>
                {gas} - {system}
              </Text>
              <Text style={styles.orderMeta}>
                Installed <Text style={receivedLow ? styles.unpaid : undefined}>{installed}</Text> - Received{" "}
                <Text style={receivedLow ? styles.unpaid : undefined}>{received}</Text> - Total {total} - Paid{" "}
                <Text style={underpaid ? styles.unpaid : undefined}>{paid}</Text>
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.orderStatus, orderUnpaid > 0 ? styles.unpaid : styles.paid]}>
                {orderUnpaid > 0 ? `Unpaid ${orderUnpaid}` : "Paid"}
              </Text>
              <Text style={[styles.orderStatus, unreturned > 0 ? styles.unpaid : styles.paid]}>
                {unreturned > 0 ? `${unreturned} unreturned` : "Returned"}
              </Text>
            </View>
          </View>
        );
      })}
      {list.length === 0 && !isLoading && <Text style={styles.orderMeta}>No orders for this day.</Text>}
    </View>
  );
}

function InventoryBlock({ title, snapshot }: { title: string; snapshot: NormalizedSnapshot | null }) {
  if (!snapshot) {
    return (
      <View style={styles.sectionBlock}>
        {title ? <Text style={styles.expandedTitle}>{title}</Text> : null}
        <Text style={styles.orderMeta}>No inventory snapshot.</Text>
      </View>
    );
  }
  return (
    <View style={styles.sectionBlock}>
      {title ? <Text style={styles.expandedTitle}>{title}</Text> : null}
      <View style={styles.inventoryTable}>
        <View style={[styles.tableRow, styles.tableHeader]}>
          <Text style={[styles.tableCell, styles.tableHeadText]}>12kg</Text>
          <Text style={[styles.tableCell, styles.tableHeadText]}>12kg</Text>
          <Text style={[styles.tableCell, styles.tableHeadText]}>48kg</Text>
          <Text style={[styles.tableCell, styles.tableHeadText]}>48kg</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={styles.tableCell}>Full {snapshot.full12}</Text>
          <Text style={styles.tableCell}>Empty {snapshot.empty12}</Text>
          <Text style={styles.tableCell}>Full {snapshot.full48}</Text>
          <Text style={styles.tableCell}>Empty {snapshot.empty48}</Text>
        </View>
      </View>
      <Text style={styles.orderMeta}>As of {new Date(snapshot.as_of).toLocaleString()}</Text>
      {snapshot.reason ? <Text style={styles.orderMeta}>Reason: {snapshot.reason}</Text> : null}
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
  date: {
    fontSize: 18,
    fontWeight: "700",
  },
  unpaid: {
    color: "#b00020",
    fontWeight: "700",
  },
  paid: {
    color: "#0a7ea4",
  },
  statusText: {
    fontWeight: "700",
    fontSize: 13,
  },
  statusRow: {
    flexDirection: "row",
  },
  section: {
    marginTop: 8,
  },
  table: {
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#dce3e8",
    borderRadius: 10,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5eaee",
  },
  tableHeader: {
    backgroundColor: "#f3f6f9",
  },
  tableCell: {
    flex: 1,
    fontSize: 13,
    color: "#2c3e50",
  },
  tableHeadText: {
    fontWeight: "700",
    color: "#0a7ea4",
  },
  tableLabel: {
    fontWeight: "700",
  },
  meta: {
    color: "#444",
    marginTop: 2,
    fontSize: 13,
  },
  expanded: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    gap: 12,
  },
  sectionBlock: {
    gap: 6,
  },
  expandedTitle: {
    fontWeight: "700",
    fontSize: 14,
    color: "#0a8f45",
  },
  orderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  orderName: {
    fontWeight: "700",
  },
  orderMeta: {
    color: "#666",
    fontSize: 12,
  },
  orderStatus: {
    fontWeight: "700",
    fontSize: 12,
  },
  error: {
    color: "#b00020",
    marginBottom: 8,
  },
  inventoryRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  inventoryCell: {
    minWidth: "22%",
    fontSize: 12,
  },
  inventoryTable: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#dce3e8",
    borderRadius: 10,
    overflow: "hidden",
    marginTop: 4,
  },
  inventoryChip: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#dce3e8",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#f8fafc",
  },
});
