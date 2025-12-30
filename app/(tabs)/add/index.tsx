import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, InputAccessoryView, Keyboard, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import AddRefillModal from "@/components/AddRefillModal";
import CashExpensesView from "@/components/CashExpensesView";
import { useCustomers, useDeleteCustomer } from "@/hooks/useCustomers";
import { useDeleteOrder, useOrders } from "@/hooks/useOrders";
import { useCreateExpense, useDeleteExpense, useExpenses } from "@/hooks/useExpenses";
import { useBankDeposits, useCreateBankDeposit, useDeleteBankDeposit } from "@/hooks/useBankDeposits";
import { useDeleteRefill, useInventoryRefills, useInventoryRefillDetails } from "@/hooks/useInventory";
import { usePriceSettings, useSavePriceSetting } from "@/hooks/usePrices";
import { useSystems } from "@/hooks/useSystems";
import { consumeAddShortcut } from "@/lib/addShortcut";
import { gasColor } from "@/constants/gas";
import {
  PriceInputs,
  createDefaultPriceInputs,
  PriceMatrixSection,
  gasTypes,
  customerTypes,
} from "@/components/PriceMatrix";
import { CustomerType, GasType, PriceSetting } from "@/types/domain";

export default function AddChooserScreen() {
  const addParams = useLocalSearchParams<{ prices?: string }>();
  const [mode, setMode] = useState<"orders" | "customers" | "expenses" | "inventory">("orders");
  const isOrders = mode === "orders";
  const isCustomers = mode === "customers";
  const isExpenses = mode === "expenses";
  const isInventory = mode === "inventory";
  const [confirm, setConfirm] = useState<{ type: "order" | "customer"; id: string; name?: string } | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const ordersQuery = useOrders();
  const customersQuery = useCustomers();
  const deleteOrder = useDeleteOrder();
  const deleteCustomer = useDeleteCustomer();
  const systemsQuery = useSystems();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();
  const createBankDeposit = useCreateBankDeposit();
  const deleteBankDeposit = useDeleteBankDeposit();
  const accessoryId = Platform.OS === "ios" ? "addAccessory" : undefined;
  const [inventoryModalOpen, setInventoryModalOpen] = useState(false);
  const [expenseMode, setExpenseMode] = useState<"expense" | "deposit">("expense");
  const [expenseType, setExpenseType] = useState("fuel");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositNote, setDepositNote] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [expenseCalendarOpen, setExpenseCalendarOpen] = useState(false);
  const expensesQuery = useExpenses(expenseDate, { enabled: isExpenses });
  const bankDepositsQuery = useBankDeposits(expenseDate, { enabled: isExpenses });
  const refillsQuery = useInventoryRefills();
  const deleteRefill = useDeleteRefill();
  const [editRefillId, setEditRefillId] = useState<string | null>(null);
  const refillDetailsQuery = useInventoryRefillDetails(editRefillId);
  const [editRefill, setEditRefill] = useState<{
    refill_id: string;
    date: string;
    time_of_day: "morning" | "evening";
    buy12: number;
    return12: number;
    buy48: number;
    return48: number;
    effective_at?: string;
  } | null>(null);

  const formatDateTime = (value?: string) => {
    if (!value) return "—";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  };
  const expenseTypes = ["fuel", "food", "insurance", "car", "other"];

  const cashEntries = useMemo(() => {
    const expenses = (expensesQuery.data ?? []).map((item) => ({
      kind: "expense" as const,
      id: item.id,
      amount: item.amount,
      label: item.expense_type,
      note: item.note ?? undefined,
      timestamp: item.created_at ?? item.date,
      date: item.date,
      expenseType: item.expense_type,
    }));
    const deposits = (bankDepositsQuery.data ?? []).map((item) => ({
      kind: "deposit" as const,
      id: item.id,
      amount: item.amount,
      label: "Bank deposit",
      note: item.note ?? undefined,
      timestamp: item.created_at ?? item.effective_at,
      date: item.date,
    }));
    return [...expenses, ...deposits].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    });
  }, [expensesQuery.data, bankDepositsQuery.data]);

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
  const visibleRefills = (refillsQuery.data ?? []).filter(
    (entry) => entry.buy12 || entry.buy48 || entry.return12 || entry.return48
  );
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
  const [savingPrices, setSavingPrices] = useState(false);

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

  useEffect(() => {
    const openPrices = Array.isArray(addParams.prices) ? addParams.prices[0] : addParams.prices;
    if (openPrices === "1") {
      setPriceModalOpen(true);
    }
  }, [addParams.prices]);

  useFocusEffect(
    useCallback(() => {
      ordersQuery.refetch();
      customersQuery.refetch();
    }, [ordersQuery, customersQuery])
  );
  useFocusEffect(
    useCallback(() => {
      if (isInventory) {
        refillsQuery.refetch();
      }
      if (isExpenses) {
        expensesQuery.refetch();
        bankDepositsQuery.refetch();
      }
    }, [isInventory, isExpenses, refillsQuery, expensesQuery, bankDepositsQuery])
  );
  useFocusEffect(
    useCallback(() => {
      const shortcut = consumeAddShortcut();
      if (shortcut?.mode === "inventory") {
        setMode("inventory");
        setInventoryModalOpen(true);
      }
    }, [])
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

  const handleSaveAllPrices = async () => {
    const dirtyCombos = Array.from(dirtyPriceCombosRef.current);
    if (dirtyCombos.length === 0) {
      Alert.alert("Nothing to save", "No price changes to save.");
      return;
    }
    setSavingPrices(true);
    try {
      for (const comboKey of dirtyCombos) {
        const [gas, type] = comboKey.split(":") as [GasType, CustomerType];
        const { selling, buying } = priceInputs[gas][type];
        const savedPrice = await savePrice.mutateAsync({
          gas_type: gas,
          customer_type: type,
          selling_price: Number(selling) || 0,
          buying_price: buying ? Number(buying) : undefined,
        });
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
      }
      setPriceModalOpen(false);
    } finally {
      setSavingPrices(false);
    }
  };
  const canSavePrices = dirtyPriceCombosRef.current.size > 0;

  const closeEditRefill = () => {
    setEditRefill(null);
  };

  const handleRemoveRefill = (refillId: string) => {
    Alert.alert("Remove refill?", "This will delete the refill entry.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await deleteRefill.mutateAsync(refillId);
          refillsQuery.refetch();
        },
      },
    ]);
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
        <Pressable onPress={() => setMode("customers")} style={[styles.segmentBtn, isCustomers && styles.segmentActive]}>
          <Text style={[styles.segmentText, isCustomers && styles.segmentTextActive]}>Customers</Text>
        </Pressable>
        <Pressable onPress={() => setMode("expenses")} style={[styles.segmentBtn, isExpenses && styles.segmentActive]}>
          <Text style={[styles.segmentText, isExpenses && styles.segmentTextActive]}>Expenses</Text>
        </Pressable>
        <Pressable onPress={() => setMode("inventory")} style={[styles.segmentBtn, isInventory && styles.segmentActive]}>
          <Text style={[styles.segmentText, isInventory && styles.segmentTextActive]}>Inventory</Text>
        </Pressable>
      </View>

      {!isExpenses ? (
        <Pressable
          onPress={() => {
            if (isOrders) {
              router.push("/orders/new");
              return;
            }
            if (isCustomers) {
              router.push("/customers/new");
              return;
            }
            if (isInventory) {
              setInventoryModalOpen(true);
              return;
            }
          }}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        >
          <Text style={styles.primaryText}>
            {isOrders ? "+ New Order" : isCustomers ? "+ New Customer" : "+ Add Inventory"}
          </Text>
        </Pressable>
      ) : null}

      <Text style={styles.subtitle}>
        {isOrders
          ? "Recent Orders"
          : isCustomers
            ? "Recent Customers"
            : isExpenses
              ? "Cash & Expenses"
              : "Inventory shortcuts"}
      </Text>

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
                        <Text style={[styles.pill, { backgroundColor: gasColor(item.gas_type), color: "#fff" }]}>
                          {item.gas_type}
                        </Text>
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
      ) : isCustomers ? (
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
         ) : isExpenses ? (
          <CashExpensesView
            expenseDate={expenseDate}
            setExpenseDate={setExpenseDate}
            expenseCalendarOpen={expenseCalendarOpen}
            setExpenseCalendarOpen={setExpenseCalendarOpen}
            expenseMode={expenseMode}
            setExpenseMode={setExpenseMode}
            expenseTypes={expenseTypes}
            expenseType={expenseType}
            setExpenseType={setExpenseType}
            expenseAmount={expenseAmount}
            setExpenseAmount={setExpenseAmount}
            expenseNote={expenseNote}
            setExpenseNote={setExpenseNote}
            depositAmount={depositAmount}
            setDepositAmount={setDepositAmount}
            depositNote={depositNote}
            setDepositNote={setDepositNote}
            accessoryId={accessoryId}
            cashEntries={cashEntries}
            createExpense={createExpense}
            createBankDeposit={createBankDeposit}
            deleteExpense={deleteExpense}
            deleteBankDeposit={deleteBankDeposit}
            CalendarModal={CalendarModal}
            formatDateTime={formatDateTime}
            styles={styles}
          />
        ) : (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Inventory</Text>
            <View style={styles.listBlock}>
              {visibleRefills.map((entry) => (
                  <View key={entry.refill_id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={styles.titleBlock}>
                        <Text style={styles.name}>Refill</Text>
                        <Text style={styles.metaLine}>
                          {entry.date} {entry.time_of_day}
                        </Text>
                        <Text style={styles.metaLine}>
                          <Text style={[styles.metaLine, { color: gasColor("12kg"), fontWeight: "700" }]}>12kg</Text>
                          : buy {entry.buy12} return {entry.return12}
                        </Text>
                        <Text style={styles.metaLine}>
                          <Text style={[styles.metaLine, { color: gasColor("48kg"), fontWeight: "700" }]}>48kg</Text>
                          : buy {entry.buy48} return {entry.return48}
                        </Text>
                      </View>
                      <View style={styles.actionsCompact}>
                        <Pressable
                          accessibilityLabel="Update refill"
                          onPress={() => {
                            setEditRefillId(entry.refill_id);
                            setEditRefill({
                              refill_id: entry.refill_id,
                              date: entry.date,
                              time_of_day: entry.time_of_day ?? "morning",
                              buy12: entry.buy12,
                              return12: entry.return12,
                              buy48: entry.buy48,
                              return48: entry.return48,
                            });
                            setInventoryModalOpen(true);
                          }}
                          style={styles.iconBtn}
                        >
                          <Ionicons name="build-outline" size={16} color="#0a7ea4" />
                        </Pressable>
                        <Pressable
                          accessibilityLabel="Remove refill"
                          onPress={() => handleRemoveRefill(entry.refill_id)}
                          style={styles.iconBtn}
                        >
                          <Ionicons name="trash" size={16} color="#b00020" />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))}
              {visibleRefills.length === 0 && <Text style={styles.meta}>No refills yet.</Text>}
            </View>
          </View>
        )}

      <AddRefillModal
        visible={inventoryModalOpen}
        onClose={() => {
          setInventoryModalOpen(false);
          closeEditRefill();
          setEditRefillId(null);
        }}
        accessoryId={accessoryId}
        onSaved={() => {
          refillsQuery.refetch();
        }}
        editEntry={
          editRefill
            ? {
                ...editRefill,
                effective_at: refillDetailsQuery.data?.effective_at,
              }
            : null
        }
      />

      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={accessoryId}>
          <View style={styles.accessoryRow}>
            <Pressable onPress={() => Keyboard.dismiss()} style={styles.accessoryButton}>
              <Text style={styles.accessoryText}>Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
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
          <KeyboardAvoidingView
            style={styles.priceModal}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
          >
            <Text style={styles.modalTitle}>Adjust Prices</Text>
            <ScrollView
              style={styles.priceModalContent}
              contentContainerStyle={styles.priceModalContentInner}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {gasTypes.map((gas) => (
              <PriceMatrixSection
                  key={gas}
                  gasType={gas}
                  inputs={priceInputs[gas]}
                  previousInputs={lastSavedPrices[gas]}
                  onInputChange={handlePriceInputChange}
                />
              ))}
            </ScrollView>
            <View style={styles.priceModalActions}>
              <Pressable
                style={[styles.secondaryAction, savingPrices && styles.disabledAction]}
                onPress={() => setPriceModalOpen(false)}
                disabled={savingPrices}
              >
                <Text style={styles.secondaryActionText}>Close</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.primary,
                  styles.drawerSave,
                  (!canSavePrices || savingPrices) && styles.disabledAction,
                ]}
                onPress={handleSaveAllPrices}
                disabled={savingPrices || !canSavePrices}
              >
                <Text style={styles.primaryText}>
                  {savingPrices ? "Saving..." : "Save prices"}
                </Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
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

function CalendarModal({
  visible,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  value: string;
  onSelect: (next: string) => void;
  onClose: () => void;
}) {
  const parseDate = (dateValue: string) => {
    const parts = dateValue.split("-").map((part) => Number(part));
    if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
      return new Date();
    }
    return new Date(parts[0], parts[1] - 1, parts[2]);
  };
  const formatDate = (valueDate: Date) => {
    const year = valueDate.getFullYear();
    const month = String(valueDate.getMonth() + 1).padStart(2, "0");
    const day = String(valueDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [month, setMonth] = useState(() => parseDate(value));

  useEffect(() => {
    if (!visible) return;
    setMonth(parseDate(value));
  }, [value, visible]);

  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const startDay = start.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const monthLabel = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const selected = value;
  const cells = Array.from({ length: 42 }, (_, index) => {
    const dayNumber = index - startDay + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) return null;
    return dayNumber;
  });

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.calendarOverlay}>
        <View style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <Pressable
              style={styles.calendarNav}
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            >
              <Ionicons name="chevron-back" size={18} color="#0a7ea4" />
            </Pressable>
            <Text style={styles.calendarTitle}>{monthLabel}</Text>
            <Pressable
              style={styles.calendarNav}
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              <Ionicons name="chevron-forward" size={18} color="#0a7ea4" />
            </Pressable>
          </View>
          <View style={styles.calendarWeekRow}>
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <Text key={day} style={styles.calendarWeekDay}>
                {day}
              </Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {cells.map((day, index) => {
              if (!day) {
                return <View key={`empty-${index}`} style={styles.calendarCell} />;
              }
              const dayDate = new Date(month.getFullYear(), month.getMonth(), day);
              const dayValue = formatDate(dayDate);
              const isSelected = dayValue === selected;
              return (
                <Pressable
                  key={dayValue}
                  style={[styles.calendarCell, isSelected && styles.calendarCellSelected]}
                  onPress={() => {
                    onSelect(dayValue);
                    onClose();
                  }}
                >
                  <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected]}>
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable style={styles.calendarClose} onPress={onClose}>
            <Text style={styles.calendarCloseText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
    backgroundColor: "rgba(0,0,0,0.2)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "97%",
    maxWidth: 520,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    gap: 10,
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
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
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
  listBlock: {
    gap: 10,
  },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    gap: 10,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  fieldBlock: {
    gap: 6,
  },
  label: {
    fontWeight: "700",
    color: "#333",
    fontSize: 12,
  },
  helperText: {
    marginTop: 4,
    fontSize: 12,
    color: "#6b7280",
  },
  modeToggle: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  modeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  modeChipActive: {
    backgroundColor: "#0a7ea4",
    borderColor: "#0a7ea4",
  },
  modeChipText: {
    fontWeight: "700",
    color: "#1f2937",
  },
  modeChipTextActive: {
    color: "#fff",
  },
  timeChips: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  timeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ccc",
    backgroundColor: "#f7f7f7",
  },
  timeChipActive: {
    backgroundColor: "#0a7ea4",
    borderColor: "#0a7ea4",
  },
  timeChipText: {
    fontWeight: "700",
    color: "#333",
  },
  timeChipTextActive: {
    color: "#fff",
  },
  input: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  dateField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  dateText: {
    color: "#1f2937",
    fontWeight: "600",
  },
  dateDoneBtn: {
    alignSelf: "flex-end",
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#e8eef1",
  },
  dateDoneText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  calendarOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  calendarCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  calendarNav: {
    padding: 6,
  },
  calendarTitle: {
    fontWeight: "700",
    fontSize: 16,
    color: "#1f2937",
  },
  calendarWeekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  calendarWeekDay: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    color: "#6b7280",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calendarCell: {
    width: "14.285%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 2,
    borderRadius: 8,
  },
  calendarCellSelected: {
    backgroundColor: "#0a7ea4",
  },
  calendarDayText: {
    color: "#1f2937",
    fontWeight: "600",
  },
  calendarDayTextSelected: {
    color: "#fff",
  },
  calendarClose: {
    alignSelf: "flex-end",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#e8eef1",
  },
  calendarCloseText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  inputNote: {
    minHeight: 60,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#e8eef1",
  },
  chipActive: {
    backgroundColor: "#0a7ea4",
  },
  chipText: {
    color: "#0a7ea4",
    fontWeight: "700",
    fontSize: 12,
  },
  chipTextActive: {
    color: "#fff",
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  half: {
    flex: 1,
  },
  inventoryTable: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  inventoryTableStack: {
    gap: 10,
  },
  inventoryBlock: {
    gap: 6,
  },
  inventoryBlockTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1f2937",
  },
  inventoryRow: {
    flexDirection: "row",
  },
  inventoryRowHeader: {
    backgroundColor: "#f1f5f9",
  },
  inventoryCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    textAlign: "center",
    fontSize: 13,
    color: "#111827",
  },
  inventoryHeaderText: {
    fontWeight: "700",
    color: "#374151",
    fontSize: 11,
    textAlign: "center",
  },
  inventoryInput: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  inventoryInputCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  inventorySign: {
    color: "#0f172a",
    fontWeight: "700",
    fontSize: 14,
    width: 10,
    textAlign: "center",
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
  expenseAmount: {
    color: "#0a7ea4",
    fontWeight: "700",
    textAlign: "right",
    marginTop: 4,
  },
  inlineActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "flex-end",
  },
  keyboardDismiss: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#e8eef1",
  },
  keyboardDismissText: {
    color: "#0a7ea4",
    fontWeight: "700",
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
    marginTop: 0,
    flex: 1,
  },
  priceModalActions: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
  },
  secondaryAction: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#cbd5f5",
    backgroundColor: "#f1f5f9",
  },
  secondaryActionText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  disabledAction: {
    opacity: 0.6,
  },
  table: {
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
    fontSize: 12,
    color: "#2c3e50",
  },
  tableHeadText: {
    fontWeight: "700",
    color: "#0a7ea4",
  },
  tableRight: {
    textAlign: "right",
  },
  accessoryRow: {
    backgroundColor: "#f1f5f9",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#cbd5f5",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  accessoryButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#0a7ea4",
    borderRadius: 8,
  },
  accessoryText: {
    color: "#fff",
    fontWeight: "700",
  },
});
