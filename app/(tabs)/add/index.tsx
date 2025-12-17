import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useCustomers, useDeleteCustomer } from "@/hooks/useCustomers";
import { useDeleteOrder, useOrders } from "@/hooks/useOrders";
import { usePriceSettings, useSavePriceSetting } from "@/hooks/usePrices";
import { useSystems } from "@/hooks/useSystems";
import {
  PriceInputs,
  createDefaultPriceInputs,
  PriceMatrixSection,
  gasTypes,
  customerTypes,
} from "@/components/PriceMatrix";
import { CustomerType, GasType, PriceSetting } from "@/types/domain";

export default function AddChooserScreen() {
  const [mode, setMode] = useState<"orders" | "customers">("orders");
  const isOrders = mode === "orders";
  const [confirm, setConfirm] = useState<{ type: "order" | "customer"; id: string; name?: string } | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const ordersQuery = useOrders();
  const customersQuery = useCustomers();
  const deleteOrder = useDeleteOrder();
  const deleteCustomer = useDeleteCustomer();
  const systemsQuery = useSystems();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [priceModalOpen, setPriceModalOpen] = useState(false);

  const orders = ordersQuery.data
    ? Array.from(
        new Map(
          ordersQuery.data.map((o) => [
            o.id,
            o, // keep first occurrence per id to avoid duplicate key crashes
          ])
        ).values()
      )
    : [];
  const customers = customersQuery.data ?? [];
  const systemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (systemsQuery.data ?? []).forEach((s) => {
      counts[s.customer_id] = (counts[s.customer_id] ?? 0) + 1;
    });
    return counts;
  }, [systemsQuery.data]);
  const priceSettingsQuery = usePriceSettings();
  const savePrice = useSavePriceSetting();
  const [priceInputs, setPriceInputs] = useState<PriceInputs>(() => createDefaultPriceInputs());
  const [lastSavedPrices, setLastSavedPrices] = useState<PriceInputs>(() => createDefaultPriceInputs());
  const dirtyPriceCombosRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!priceModalOpen || !priceSettingsQuery.data) {
      return;
    }
    const latestByCombo = priceSettingsQuery.data.reduce<Record<string, PriceSetting>>((acc, entry) => {
      if (entry.customer_type === "any") {
        return acc;
      }
      const comboKey = `${entry.gas_type}:${entry.customer_type}`;
      const existing = acc[comboKey];
      if (
        !existing ||
        new Date(entry.effective_from).getTime() > new Date(existing.effective_from).getTime()
      ) {
        acc[comboKey] = entry;
      }
      return acc;
    }, {});
    setLastSavedPrices((prev) => {
      const nextSaved = createDefaultPriceInputs();
      gasTypes.forEach((gas) => {
        customerTypes.forEach((type) => {
          const combo = latestByCombo[`${gas}:${type}`];
          if (combo) {
            nextSaved[gas][type] = {
              selling: combo.selling_price.toString(),
              buying: combo.buying_price?.toString() ?? "",
            };
          } else {
            nextSaved[gas][type] = prev[gas]?.[type] ?? { selling: "", buying: "" };
          }
        });
      });
      return nextSaved;
    });
    setPriceInputs((prev) => {
      const dirtyCombos = dirtyPriceCombosRef.current;
      const next = createDefaultPriceInputs();
      gasTypes.forEach((gas) => {
        customerTypes.forEach((type) => {
          const combo = latestByCombo[`${gas}:${type}`];
          const comboKey = `${gas}:${type}`;
          const previousValue = prev[gas]?.[type] ?? { selling: "", buying: "" };
          if (dirtyCombos.has(comboKey)) {
            next[gas][type] = { ...previousValue };
          } else if (combo) {
            next[gas][type] = {
              selling: combo.selling_price.toString(),
              buying: combo.buying_price?.toString() ?? "",
            };
          } else {
            next[gas][type] = { ...previousValue };
          }
        });
      });
      return next;
    });
  }, [priceModalOpen, priceSettingsQuery.data]);

  useEffect(() => {
    if (!priceModalOpen) {
      dirtyPriceCombosRef.current.clear();
    }
  }, [priceModalOpen]);

  useFocusEffect(
    useCallback(() => {
      ordersQuery.refetch();
      customersQuery.refetch();
    }, [ordersQuery, customersQuery])
  );

  const confirmDeleteOrder = (id: string) => {
    console.log("[add] delete order pressed", id);
    setConfirm({ type: "order", id });
  };

  const confirmDeleteCustomer = (id: string) => {
    console.log("[add] delete customer pressed", id);
    const hasOrders = orders.some((o) => o.customer_id === id);
    if (hasOrders) {
      setInfoMessage("You cannot delete this customer while they still have orders. Remove or reassign their orders first.");
      return;
    }
    setConfirm({ type: "customer", id });
  };

  const handlePriceInputChange = (
    gas: GasType,
    type: CustomerType,
    field: "selling" | "buying",
    value: string
  ) => {
    const comboKey = `${gas}:${type}`;
    setPriceInputs((prev) => {
      const nextValue = {
        selling: field === "selling" ? value : prev[gas]?.[type]?.selling ?? "",
        buying: field === "buying" ? value : prev[gas]?.[type]?.buying ?? "",
      };
      const next: PriceInputs = {
        ...prev,
        [gas]: {
          ...prev[gas],
          [type]: nextValue,
        },
      };
      const baseline = lastSavedPrices[gas]?.[type] ?? { selling: "", buying: "" };
      const matchesBaseline =
        (nextValue.selling || "") === (baseline.selling || "") &&
        (nextValue.buying || "") === (baseline.buying || "");
      if (matchesBaseline) {
        dirtyPriceCombosRef.current.delete(comboKey);
      } else {
        dirtyPriceCombosRef.current.add(comboKey);
      }
      return next;
    });
  };

  const canSavePrice = useCallback(
    (gas: GasType, type: CustomerType) => dirtyPriceCombosRef.current.has(`${gas}:${type}`),
    []
  );

  const handlePriceSave = (gas: GasType, type: CustomerType) => {
    const { selling, buying } = priceInputs[gas][type];
    const comboKey = `${gas}:${type}`;
    savePrice.mutate(
      {
        gas_type: gas,
        customer_type: type,
        selling_price: Number(selling) || 0,
        buying_price: buying ? Number(buying) : undefined,
      },
      {
        onSuccess: (savedPrice) => {
          dirtyPriceCombosRef.current.delete(comboKey);
          const normalized = {
            selling: savedPrice.selling_price.toString(),
            buying: savedPrice.buying_price?.toString() ?? "",
          };
          setLastSavedPrices((prev) => ({
            ...prev,
            [gas]: {
              ...prev[gas],
              [type]: normalized,
            },
          }));
          setPriceInputs((prev) => ({
            ...prev,
            [gas]: {
              ...prev[gas],
              [type]: normalized,
            },
          }));
        },
      }
    );
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.menuBtn} onPress={() => setDrawerOpen(true)}>
        <Text style={styles.menuBtnText}>≡</Text>
      </Pressable>
      <Text style={styles.title}>Add</Text>

      <View style={styles.segment}>
        <Pressable onPress={() => setMode("orders")} style={[styles.segmentBtn, isOrders && styles.segmentActive]}>
          <Text style={[styles.segmentText, isOrders && styles.segmentTextActive]}>Orders</Text>
        </Pressable>
        <Pressable onPress={() => setMode("customers")} style={[styles.segmentBtn, !isOrders && styles.segmentActive]}>
          <Text style={[styles.segmentText, !isOrders && styles.segmentTextActive]}>Customers</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => (isOrders ? router.push("/orders/new") : router.push("/customers/new"))}
        style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
      >
        <Text style={styles.primaryText}>{isOrders ? "+ New Order" : "+ New Customer"}</Text>
      </Pressable>

      <Text style={styles.subtitle}>Recent {isOrders ? "Orders" : "Customers"}</Text>

      {isOrders ? (
        <>
          {ordersQuery.isLoading && <Text style={styles.meta}>Loading...</Text>}
          {ordersQuery.error && (
            <View style={styles.errorBox}>
              <Text style={styles.error}>Failed to load orders.</Text>
              <Pressable style={styles.retryBtn} onPress={() => ordersQuery.refetch()}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          )}
          <FlatList
            key="orders-list"
            data={orders.slice(0, 10)}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ gap: 10 }}
            ListEmptyComponent={!ordersQuery.isLoading ? <Text style={styles.meta}>No orders yet.</Text> : null}
            renderItem={({ item }) => {
              const unpaid = item.price_total - item.paid_amount;
              const system = systemsQuery.data?.find((s) => s.id === item.system_id);
              const customer = customersQuery.data?.find((c) => c.id === item.customer_id);
              const createdAt = new Date(item.created_at);
              const deliveredAt = new Date(item.delivered_at);
              const outstandingCyl = Math.max(0, item.cylinders_installed - item.cylinders_received);
              const fullyReturned = outstandingCyl === 0;
              const returnedLabel = fullyReturned
                ? "Returned"
                : `Unreturned ${outstandingCyl} x ${item.gas_type}`;
              return (
                <Pressable onPress={() => router.push(`/orders/${item.id}`)} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
                  <View style={styles.cardHeader}>
                    <View style={styles.titleBlock}>
                      <Text style={styles.name}>{customer?.name ?? item.id}</Text>
                      {customer?.notes ? <Text style={styles.customerNote}>{customer.notes}</Text> : null}
                      {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
                    </View>
                    <View style={styles.headerRight}>
                      <Text style={styles.time}>{createdAt.toLocaleString()}</Text>
                    </View>
                  </View>
                  <View style={styles.infoRow}>
                    <View style={styles.leftInfo}>
                      {system ? <Text style={styles.metaLine}>{system.name}</Text> : null}
                      <View style={styles.pillRow}>
                        <Text style={[styles.pill, styles.pillPrimary]}>{item.cylinders_installed} x</Text>
                        <Text style={[styles.pill, styles.pillMuted]}>{item.gas_type}</Text>
                        <Text style={[styles.pill, styles.pillPrimary]}>Paid {item.paid_amount.toFixed(0)}</Text>
                      </View>
                    </View>
                    <View style={styles.badgeStack}>
                      <Text style={[styles.statusBadge, unpaid > 0 ? styles.unpaidBadge : styles.paidBadge]}>
                        {unpaid > 0 ? `Unpaid ${unpaid.toFixed(0)}` : "Paid"}
                      </Text>
                      <Text style={[styles.statusBadge, fullyReturned ? styles.returnedBadge : styles.unreturnedBadge]}>
                        {returnedLabel}
                      </Text>
                      <View style={styles.actionsCompact}>
                        <Pressable
                          accessibilityLabel="Edit order"
                          onPress={() => router.push(`/orders/${item.id}/edit`)}
                          style={styles.iconBtn}
                        >
                          <Ionicons name="build-outline" size={16} color="#0a7ea4" />
                        </Pressable>
                        <Pressable
                          accessibilityLabel="Remove order"
                          onPress={(e) => {
                            e.stopPropagation?.();
                            confirmDeleteOrder(item.id);
                          }}
                          style={styles.iconBtn}
                        >
                          <Ionicons name="trash" size={16} color="#b00020" />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                  <View style={styles.footerRow}>
                    <Text style={styles.time}>Delivered {deliveredAt.toLocaleString()}</Text>
                  </View>
                </Pressable>
              );
            }}
          />
        </>
      ) : (
        <>
      {customersQuery.isLoading && <Text style={styles.meta}>Loading...</Text>}
      {customersQuery.error && (
        <View style={styles.errorBox}>
          <Text style={styles.error}>Failed to load customers.</Text>
          <Pressable style={styles.retryBtn} onPress={() => customersQuery.refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}
      <FlatList
        key="customers-list"
        data={customers.slice(0, 10)}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ gap: 10 }}
            ListEmptyComponent={!customersQuery.isLoading ? <Text style={styles.meta}>No customers yet.</Text> : null}
            renderItem={({ item }) => (
              <Pressable onPress={() => router.push(`/customers/${item.id}`)} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
                <View style={styles.cardHeader}>
                  <View style={styles.titleBlock}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.meta}>
                      Type: {item.customer_type} • Systems: {systemCounts[item.id] ?? 0}
                    </Text>
                    {item.notes ? <Text style={styles.note}>{item.notes}</Text> : null}
                  </View>
                  <View style={styles.headerRight}>
                    <Text style={styles.time}>{new Date(item.created_at).toLocaleString()}</Text>
                    <View style={styles.actionsCompact}>
                      <Pressable
                        accessibilityLabel="Edit customer"
                        onPress={() => router.push(`/customers/${item.id}/edit`)}
                        style={styles.iconBtn}
                      >
                        <Ionicons name="build-outline" size={16} color="#0a7ea4" />
                      </Pressable>
                      <Pressable
                        accessibilityLabel="Add order for customer"
                        onPress={() => router.push(`/orders/new?customerId=${item.id}`)}
                        style={styles.iconBtn}
                      >
                        <Ionicons name="add-circle-outline" size={16} color="#0a7ea4" />
                      </Pressable>
                      <Pressable
                        accessibilityLabel="Remove customer"
                        onPress={(e) => {
                          e.stopPropagation?.();
                          confirmDeleteCustomer(item.id);
                        }}
                        style={styles.iconBtn}
                      >
                        <Ionicons name="trash" size={16} color="#b00020" />
                      </Pressable>
                    </View>
                  </View>
                </View>
            </Pressable>
          )}
        />
        </>
      )}

      {/* Confirm modal */}
      <Modal transparent visible={!!confirm} animationType="fade" onRequestClose={() => setConfirm(null)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {confirm?.type === "order" ? "Delete order?" : "Delete customer?"}
            </Text>
            <Text style={styles.modalText}>This action cannot be undone in this mock data. Proceed?</Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={() => setConfirm(null)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnDanger]}
                onPress={() => {
                  if (confirm?.type === "order") {
                    deleteOrder.mutate(confirm.id);
                  } else if (confirm?.type === "customer") {
                    deleteCustomer.mutate(confirm.id);
                  }
                  setConfirm(null);
                }}
              >
                <Text style={[styles.modalBtnText, styles.modalBtnTextDanger]}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={priceModalOpen}
        animationType="slide"
        onRequestClose={() => setPriceModalOpen(false)}
      >
        <View style={styles.priceModalBackdrop}>
          <View style={styles.priceModal}>
            <Text style={styles.modalTitle}>Adjust Prices</Text>
            <ScrollView
              style={styles.priceModalContent}
              contentContainerStyle={styles.priceModalContentInner}
              showsVerticalScrollIndicator={false}
            >
              {gasTypes.map((gas) => (
              <PriceMatrixSection
                  key={gas}
                  gasType={gas}
                  inputs={priceInputs[gas]}
                  onInputChange={handlePriceInputChange}
                  onSave={handlePriceSave}
                  canSave={canSavePrice}
                  saving={savePrice.isLoading}
                />
              ))}
            </ScrollView>
            <Pressable style={[styles.primary, styles.drawerSave]} onPress={() => setPriceModalOpen(false)}>
              <Text style={styles.primaryText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Info modal */}
      <Modal transparent visible={!!infoMessage} animationType="fade" onRequestClose={() => setInfoMessage(null)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cannot delete customer</Text>
            <Text style={styles.modalText}>{infoMessage}</Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={() => setInfoMessage(null)}>
                <Text style={styles.modalBtnText}>OK</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Right drawer */}
      <Modal transparent visible={drawerOpen} animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
        <Pressable style={styles.drawerBackdrop} onPress={() => setDrawerOpen(false)}>
          <Pressable style={styles.drawer} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.drawerTitle}>Worker Profile</Text>
            <Text style={styles.drawerMeta}>Name: Your Worker</Text>
            <Text style={styles.drawerMeta}>Role: Delivery</Text>

            <Text style={[styles.drawerTitle, { marginTop: 16 }]}>Settings</Text>
            <Text style={styles.drawerLink}>General</Text>
            <Text style={styles.drawerLink}>Inventory</Text>

            <Text style={[styles.drawerTitle, { marginTop: 16 }]}>Prices</Text>
            <Pressable
              style={styles.linkBtn}
              onPress={() => {
                setPriceModalOpen(true);
                setDrawerOpen(false);
              }}
            >
              <Text style={[styles.linkText, { fontSize: 15 }]}>Adjust prices</Text>
            </Pressable>

            <Pressable style={styles.primary} onPress={() => setDrawerOpen(false)}>
              <Text style={styles.primaryText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

    </View>
  );
}

const shadowCard = Platform.select({
  web: { boxShadow: "0px 6px 12px rgba(0,0,0,0.08)" },
  default: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
});

const shadowDrawer = Platform.select({
  web: { boxShadow: "-4px 0px 18px rgba(0,0,0,0.18)" },
  default: {
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: -4, height: 0 },
    elevation: 8,
  },
});

const shadowModal = Platform.select({
  web: { boxShadow: "0px 10px 22px rgba(0,0,0,0.18)" },
  default: {
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1c1c1c",
  },
  modalText: {
    color: "#444",
    fontSize: 14,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  modalBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#e8eef1",
  },
  modalBtnDanger: {
    backgroundColor: "#b00020",
  },
  modalBtnText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  modalBtnTextDanger: {
    color: "#fff",
  },
  container: {
    flex: 1,
    padding: 20,
    gap: 12,
    backgroundColor: "#f7f7f8",
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
  },
  segment: {
    flexDirection: "row",
    backgroundColor: "#e8eef1",
    borderRadius: 12,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  segmentActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  segmentText: {
    fontWeight: "700",
    color: "#4a4a4a",
  },
  segmentTextActive: {
    color: "#0a7ea4",
  },
  primary: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: "700",
    color: "#444",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 8,
    ...(shadowCard as object),
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
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
    fontSize: 15,
    fontWeight: "700",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: 3,
  },
  titleBlock: {
    gap: 2,
    maxWidth: "70%",
  },
  customerNote: {
    color: "#4b5563",
    fontSize: 11,
    maxWidth: 160,
  },
  time: {
    color: "#666",
    fontSize: 11,
  },
  metaLine: {
    color: "#444",
    marginVertical: 0,
  },
  note: {
    color: "#374151",
    marginVertical: 0,
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    textAlign: "right",
    marginTop: 0,
  },
  paidBadge: {
    backgroundColor: "#dcfce7",
    color: "#166534",
  },
  unpaidBadge: {
    backgroundColor: "#fee2e2",
    color: "#b91c1c",
  },
  returnedBadge: {
    backgroundColor: "#dcfce7",
    color: "#166534",
  },
  unreturnedBadge: {
    backgroundColor: "#fee2e2",
    color: "#b91c1c",
  },
  badgeStack: {
    alignItems: "flex-end",
    gap: 4,
  },
  actionsCompact: {
    flexDirection: "row",
    gap: 8,
    alignSelf: "flex-end",
  },
  headerRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  iconBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#e8eef1",
  },
  meta: {
    color: "#666",
    fontSize: 12,
  },
  unpaid: {
    color: "#b00020",
    fontWeight: "700",
  },
  paid: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.9,
  },
  error: {
    color: "#b00020",
    marginTop: 4,
  },
  errorBox: {
    backgroundColor: "#fdecea",
    borderRadius: 8,
    padding: 10,
    marginVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#f5c6cb",
    gap: 6,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
  footerRow: {
    marginTop: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
  },
  infoRow: {
    marginTop: 2,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  leftInfo: {
    flexShrink: 1,
    gap: 2,
  },
  pillRow: {
    flexDirection: "row",
    gap: 3,
    flexWrap: "wrap",
    marginVertical: 2,
  },
  pill: {
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillPrimary: {
    backgroundColor: "#e0f2fe",
    color: "#075985",
  },
  pillMuted: {
    backgroundColor: "#e2e8f0",
    color: "#1f2937",
  },
  linkBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#e8eef1",
  },
  linkText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  dangerText: {
    color: "#b00020",
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
  menuBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    backgroundColor: "#0a7ea4",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  menuBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 18,
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
  },
  drawer: {
    width: "80%",
    maxWidth: 420,
    backgroundColor: "#fff",
    padding: 16,
    height: "100%",
    ...(shadowDrawer as object),
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  drawerMeta: {
    color: "#555",
    marginTop: 4,
  },
  drawerLink: {
    marginTop: 8,
    color: "#0a7ea4",
    fontWeight: "700",
  },
  priceRow: {
    marginTop: 8,
    padding: 8,
    borderRadius: 10,
    backgroundColor: "#fff",
    gap: 2,
  },
  priceModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  priceModal: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 20,
    gap: 12,
    maxHeight: "85%",
    ...(shadowModal as object),
  },
  priceModalContent: {
    width: "100%",
  },
  priceModalContentInner: {
    gap: 12,
    paddingBottom: 12,
  },
  drawerSave: {
    marginTop: 10,
  },
});
