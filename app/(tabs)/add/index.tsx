import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, InputAccessoryView, Keyboard, KeyboardAvoidingView, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { RefillForm } from "@/components/AddRefillModal";
import CashExpensesView from "@/components/CashExpensesView";
import { useCreateCashAdjustment, useDeleteCashAdjustment, useUpdateCashAdjustment } from "@/hooks/useCash";
import { useCustomers, useDeleteCustomer } from "@/hooks/useCustomers";
import { useCollections, useDeleteCollection, useUpdateCollection } from "@/hooks/useCollections";
import { useDeleteOrder, useOrders } from "@/hooks/useOrders";
import { useCreateExpense, useDeleteExpense, useExpenses } from "@/hooks/useExpenses";
import { useBankDeposits, useCreateBankDeposit, useDeleteBankDeposit } from "@/hooks/useBankDeposits";
import {
  useAdjustInventory,
  useDeleteInventoryAdjustment,
  useDeleteRefill,
  useInventoryLatest,
  useInventoryRefillDetails,
  useUpdateInventoryAdjustment,
} from "@/hooks/useInventory";
import { useInventoryActivity } from "@/hooks/useInventoryActivity";
import { usePriceSettings, useSavePriceSetting } from "@/hooks/usePrices";
import { useDailyReportsV2 } from "@/hooks/useReports";
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
import { CashAdjustment, CustomerType, GasType, InventoryAdjustment, PriceSetting } from "@/types/domain";

export default function AddChooserScreen() {
  const addParams = useLocalSearchParams<{ prices?: string; open?: string }>();
  const [mode, setMode] = useState<"orders" | "customers" | "expenses" | "inventory">("orders");
  const isOrders = mode === "orders";
  const isCustomers = mode === "customers";
  const isExpenses = mode === "expenses";
  const isInventory = mode === "inventory";
  const [confirm, setConfirm] = useState<{ type: "order" | "customer" | "collection"; id: string; name?: string } | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const ordersQuery = useOrders();
  const collectionsQuery = useCollections();
  const updateCollection = useUpdateCollection();
  const deleteCollection = useDeleteCollection();
  const customersQuery = useCustomers();
  const deleteOrder = useDeleteOrder();
  const deleteCustomer = useDeleteCustomer();
  const systemsQuery = useSystems();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [collectionEditOpen, setCollectionEditOpen] = useState(false);
  const [collectionEditTarget, setCollectionEditTarget] = useState<any | null>(null);
  const [collectionAmount, setCollectionAmount] = useState("");
  const [collectionQty12, setCollectionQty12] = useState("");
  const [collectionQty48, setCollectionQty48] = useState("");
  const [collectionNote, setCollectionNote] = useState("");
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
  const [showDeletedInventory, setShowDeletedInventory] = useState(false);
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
  const [inventoryModalTab, setInventoryModalTab] = useState<"refill" | "cash" | "inventory">("refill");
  const [editingInventoryAdjust, setEditingInventoryAdjust] = useState<InventoryAdjustment | null>(null);
  const [editingCashAdjust, setEditingCashAdjust] = useState<CashAdjustment | null>(null);
  const adjustInventory = useAdjustInventory();
  const updateInventoryAdjust = useUpdateInventoryAdjustment();
  const deleteInventoryAdjust = useDeleteInventoryAdjustment();
  const createCashAdjust = useCreateCashAdjustment();
  const updateCashAdjust = useUpdateCashAdjustment();
  const deleteCashAdjust = useDeleteCashAdjustment();

  const formatDateTime = (value?: string) => {
    if (!value) return "—";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  };
  const expenseTypes = ["fuel", "food", "insurance", "car", "other"];
  const getLocalDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const todayDate = getLocalDateString();
  const inventoryLatest = useInventoryLatest();
  const dailyReportQuery = useDailyReportsV2(todayDate, todayDate);
  const inventoryActivity = useInventoryActivity(todayDate, showDeletedInventory);

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
  const collections = collectionsQuery.data ?? [];
  const normalizeIso = useCallback((value?: string) => {
    if (!value) return "";
    return value.replace(/(\.\d{3})\d+/, "$1");
  }, []);

  const toSafeTime = useCallback(
    (value?: string) => {
      const normalized = normalizeIso(value);
      const parsed = Date.parse(normalized);
      return Number.isNaN(parsed) ? 0 : parsed;
    },
    [normalizeIso]
  );

  const recentItems = useMemo(() => {
    const orderItems = orders.map((order) => ({
      kind: "order" as const,
      created_at: order.created_at || new Date().toISOString(),
      data: order,
    }));
    const collectionItems = collections.map((collection) => ({
      kind: "collection" as const,
      created_at: collection.created_at || collection.effective_at || new Date().toISOString(),
      data: collection,
    }));
    return [...orderItems, ...collectionItems].sort((a, b) => {
      const safeA = toSafeTime(a.created_at);
      const safeB = toSafeTime(b.created_at);
      return safeB - safeA;
    });
  }, [orders, collections, toSafeTime]);
  const inventoryItems = inventoryActivity.items.filter((entry) => {
    if (entry.kind !== "refill") return true;
    const data = entry.data;
    return data.buy12 || data.buy48 || data.return12 || data.return48;
  });
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

  useEffect(() => {
    const openParam = Array.isArray(addParams.open) ? addParams.open[0] : addParams.open;
    if (!openParam) return;
    setMode("inventory");
    if (openParam === "adjust-inventory") {
      setEditingInventoryAdjust(null);
      setInventoryModalTab("inventory");
      setInventoryModalOpen(true);
    } else if (openParam === "adjust-cash") {
      setEditingCashAdjust(null);
      setInventoryModalTab("cash");
      setInventoryModalOpen(true);
    }
    const openPrices = Array.isArray(addParams.prices) ? addParams.prices[0] : addParams.prices;
    router.replace({
      pathname: "/(tabs)/add",
      params: openPrices ? { prices: openPrices } : {},
    });
  }, [addParams.open, addParams.prices]);

  useFocusEffect(
    useCallback(() => {
      ordersQuery.refetch();
      collectionsQuery.refetch();
      customersQuery.refetch();
    }, [ordersQuery, customersQuery])
  );
    useFocusEffect(
      useCallback(() => {
        if (isInventory) {
          inventoryActivity.refillsQuery.refetch();
          inventoryActivity.inventoryAdjustmentsQuery.refetch();
          inventoryActivity.cashAdjustmentsQuery.refetch();
        }
        if (isExpenses) {
          expensesQuery.refetch();
          bankDepositsQuery.refetch();
        }
      }, [
        isInventory,
        isExpenses,
        inventoryActivity.refillsQuery,
        inventoryActivity.inventoryAdjustmentsQuery,
        inventoryActivity.cashAdjustmentsQuery,
        expensesQuery,
        bankDepositsQuery,
      ])
    );
    useFocusEffect(
      useCallback(() => {
        const shortcut = consumeAddShortcut();
        if (shortcut?.mode === "inventory") {
          setMode("inventory");
          setInventoryModalTab("refill");
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
    const customer = customers.find((entry) => entry.id === id);
    const orderCount = customer?.order_count ?? 0;
    const hasOrders = orderCount > 0 || orders.some((o) => o.customer_id === id);
    if (hasOrders) {
      setInfoMessage("You cannot delete this customer while they still have orders. Remove or reassign their orders first.");
      return;
    }
    setConfirm({ type: "customer", id });
  };

  const confirmDeleteCollection = (id: string) => {
    console.log("[add] delete collection pressed", id);
    setConfirm({ type: "collection", id });
  };

  const openCollectionEdit = (collection: any) => {
    setCollectionEditTarget(collection);
    setCollectionAmount(collection.action_type === "payment" ? String(collection.amount_money ?? "") : "");
    setCollectionQty12(collection.action_type === "return" ? String(collection.qty_12kg ?? "") : "");
    setCollectionQty48(collection.action_type === "return" ? String(collection.qty_48kg ?? "") : "");
    setCollectionNote(collection.note ?? "");
    setCollectionEditOpen(true);
  };

  const handleSaveCollectionEdit = async () => {
    if (!collectionEditTarget) return;
    const actionType = collectionEditTarget.action_type;
    if (actionType === "payment") {
      const amount = Number(collectionAmount) || 0;
      if (amount <= 0) {
        Alert.alert("Missing amount", "Enter a payment amount.");
        return;
      }
      await updateCollection.mutateAsync({
        id: collectionEditTarget.id,
        payload: { action_type: "payment", amount_money: amount, note: collectionNote || undefined },
      });
    } else {
      const qty12 = Number(collectionQty12) || 0;
      const qty48 = Number(collectionQty48) || 0;
      if (qty12 <= 0 && qty48 <= 0) {
        Alert.alert("Missing counts", "Enter a return quantity.");
        return;
      }
      await updateCollection.mutateAsync({
        id: collectionEditTarget.id,
        payload: { action_type: "return", qty_12kg: qty12, qty_48kg: qty48, note: collectionNote || undefined },
      });
    }
    setCollectionEditOpen(false);
    setCollectionEditTarget(null);
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
          try {
            await deleteRefill.mutateAsync(refillId);
            inventoryActivity.refillsQuery.refetch();
          } catch (error) {
            console.error("[add] delete refill failed", error);
            Alert.alert("Failed to delete", "Try again later.");
          }
        },
      },
    ]);
  };

  const closeInventoryModal = () => {
    setInventoryModalOpen(false);
    setInventoryModalTab("refill");
    closeEditRefill();
    setEditRefillId(null);
    setEditingInventoryAdjust(null);
    setEditingCashAdjust(null);
  };

  const handleDeleteInventoryAdjustment = (entry: InventoryAdjustment) => {
    Alert.alert("Remove adjustment?", "This will delete the adjustment entry.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteInventoryAdjust.mutateAsync(entry.id);
            inventoryActivity.inventoryAdjustmentsQuery.refetch();
          } catch (error) {
            console.error("[add] delete inventory adjustment failed", error);
            Alert.alert("Failed to delete", "Try again later.");
          }
        },
      },
    ]);
  };

  const handleDeleteCashAdjustment = (entry: CashAdjustment) => {
    Alert.alert("Remove adjustment?", "This will delete the cash adjustment.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCashAdjust.mutateAsync(entry.id);
            inventoryActivity.cashAdjustmentsQuery.refetch();
          } catch (error) {
            console.error("[add] delete cash adjustment failed", error);
            Alert.alert("Failed to delete", "Try again later.");
          }
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
              setInventoryModalTab("refill");
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
        <Text style={styles.meta}>
          orders: {orders.length} | collections: {collections.length}
        </Text>
      ) : null}

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
            data={recentItems}
            keyExtractor={(item) => `${item.kind}-${item.data.id}`}
            contentContainerStyle={{ gap: 10 }}
            ListEmptyComponent={!ordersQuery.isLoading ? <Text style={styles.meta}>No orders yet.</Text> : null}
            renderItem={({ item }) => {
              if (item.kind === "collection") {
                const collection = item.data;
                const customer = customersQuery.data?.find((c) => c.id === collection.customer_id);
                const createdAt = new Date(
                  normalizeIso(collection.created_at ?? collection.effective_at ?? "")
                );
                const system = systemsQuery.data?.find((s) => s.id === collection.system_id);
                const label = collection.action_type === "payment" ? "Collection M" : "Collection C";
                const amount = Number(collection.amount_money ?? 0);
                const qty12 = Number(collection.qty_12kg ?? 0);
                const qty48 = Number(collection.qty_48kg ?? 0);
                return (
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={styles.titleBlock}>
                        <Text style={styles.name}>{customer?.name ?? collection.id}</Text>
                        {customer?.notes ? <Text style={styles.customerNote}>{customer.notes}</Text> : null}
                        {system ? <Text style={styles.metaLine}>{system.name}</Text> : null}
                        {collection.note ? <Text style={styles.note}>{collection.note}</Text> : null}
                      </View>
                      <View style={styles.headerRight}>
                        <Text style={styles.time}>{createdAt.toLocaleString()}</Text>
                      </View>
                    </View>
                    <View style={styles.infoRow}>
                      <View style={styles.leftInfo}>
                        {collection.action_type === "payment" ? (
                          <Text style={styles.metaLine}>Amount {amount.toFixed(0)}</Text>
                        ) : (
                          <Text style={styles.metaLine}>
                            12kg {qty12.toFixed(0)} | 48kg {qty48.toFixed(0)}
                          </Text>
                        )}
                      </View>
                      <View style={styles.badgeStack}>
                        <Text style={[styles.statusBadge, styles.collectionBadge]}>{label}</Text>
                        <View style={styles.actionsCompact}>
                          <Pressable
                            accessibilityLabel="Edit collection"
                            onPress={(e) => {
                              e.stopPropagation?.();
                              openCollectionEdit(collection);
                            }}
                            style={styles.iconBtn}
                          >
                            <Ionicons name="build-outline" size={16} color="#0a7ea4" />
                          </Pressable>
                          <Pressable
                            accessibilityLabel="Remove collection"
                            onPress={(e) => {
                              e.stopPropagation?.();
                              confirmDeleteCollection(collection.id);
                            }}
                            style={styles.iconBtn}
                          >
                            <Ionicons name="trash" size={16} color="#b00020" />
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              }

              const order = item.data;
              const unpaid = order.price_total - order.paid_amount;
              const system = systemsQuery.data?.find((s) => s.id === order.system_id);
              const customer = customersQuery.data?.find((c) => c.id === order.customer_id);
              const createdAt = new Date(normalizeIso(order.created_at));
              const deliveredAt = new Date(normalizeIso(order.delivered_at));
              const outstandingCyl = Math.max(0, order.cylinders_installed - order.cylinders_received);
              const fullyReturned = outstandingCyl === 0;
              const returnedLabel = fullyReturned
                ? "Returned"
                : `Unreturned ${outstandingCyl} x ${order.gas_type}`;
              return (
                <Pressable onPress={() => router.push(`/orders/${order.id}`)} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
                  <View style={styles.cardHeader}>
                    <View style={styles.titleBlock}>
                      <Text style={styles.name}>{customer?.name ?? order.id}</Text>
                      {customer?.notes ? <Text style={styles.customerNote}>{customer.notes}</Text> : null}
                      {order.note ? <Text style={styles.note}>{order.note}</Text> : null}
                    </View>
                    <View style={styles.headerRight}>
                      <Text style={styles.time}>{createdAt.toLocaleString()}</Text>
                    </View>
                  </View>
                  <View style={styles.infoRow}>
                    <View style={styles.leftInfo}>
                      {system ? <Text style={styles.metaLine}>{system.name}</Text> : null}
                      <View style={styles.pillRow}>
                        <Text style={[styles.pill, styles.pillPrimary]}>{order.cylinders_installed} x</Text>
                        <Text style={[styles.pill, { backgroundColor: gasColor(order.gas_type), color: "#fff" }]}>
                          {order.gas_type}
                        </Text>
                        <Text style={[styles.pill, styles.pillPrimary]}>Paid {order.paid_amount.toFixed(0)}</Text>
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
                          onPress={() => router.push(`/orders/${order.id}/edit`)}
                          style={styles.iconBtn}
                        >
                          <Ionicons name="build-outline" size={16} color="#0a7ea4" />
                        </Pressable>
                        <Pressable
                          accessibilityLabel="Remove order"
                          onPress={(e) => {
                            e.stopPropagation?.();
                            confirmDeleteOrder(order.id);
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
            <View style={styles.inventoryHeaderRow}>
              <Text style={styles.formTitle}>Inventory</Text>
              <Pressable
                onPress={() => setShowDeletedInventory((prev) => !prev)}
                style={[
                  styles.inventoryToggle,
                  showDeletedInventory && styles.inventoryToggleActive,
                ]}
              >
                <Text
                  style={[
                    styles.inventoryToggleText,
                    showDeletedInventory && styles.inventoryToggleTextActive,
                  ]}
                >
                  Show deleted
                </Text>
              </Pressable>
            </View>
            <View style={styles.listBlock}>
              {inventoryItems.map((entry) => {
                if (entry.kind === "refill") {
                  const refill = entry.data;
                  const isDeleted = entry.is_deleted;
                  return (
                    <View
                      key={`refill_${refill.refill_id}`}
                      style={[styles.card, isDeleted && styles.cardMuted]}
                    >
                      <View style={styles.cardHeader}>
                        <View style={styles.titleBlock}>
                          <View style={styles.inventoryLabelRow}>
                            <View style={styles.inventoryTypeBadge}>
                              <Text style={styles.inventoryTypeBadgeText}>Refill</Text>
                            </View>
                            {isDeleted && (
                              <View style={styles.inventoryBadge}>
                                <Text style={styles.inventoryBadgeText}>Deleted</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.metaLine}>
                            {refill.date} {refill.time_of_day}
                          </Text>
                          <Text style={styles.metaLine}>
                            <Text style={[styles.metaLine, { color: gasColor("12kg"), fontWeight: "700" }]}>12kg</Text>
                            : buy {refill.buy12} return {refill.return12}
                          </Text>
                          <Text style={styles.metaLine}>
                            <Text style={[styles.metaLine, { color: gasColor("48kg"), fontWeight: "700" }]}>48kg</Text>
                            : buy {refill.buy48} return {refill.return48}
                          </Text>
                        </View>
                        <View style={styles.actionsCompact}>
                          <Pressable
                            accessibilityLabel="Update refill"
                            onPress={() => {
                              if (isDeleted) return;
                              setEditRefillId(refill.refill_id);
                              setEditRefill({
                                refill_id: refill.refill_id,
                                date: refill.date,
                                time_of_day: refill.time_of_day ?? "morning",
                                buy12: refill.buy12,
                                return12: refill.return12,
                                buy48: refill.buy48,
                                return48: refill.return48,
                              });
                              setInventoryModalTab("refill");
                              setInventoryModalOpen(true);
                            }}
                            style={[styles.iconBtn, isDeleted && styles.iconBtnDisabled]}
                          >
                            <Ionicons name="build-outline" size={16} color={isDeleted ? "#94a3b8" : "#0a7ea4"} />
                          </Pressable>
                          <Pressable
                            accessibilityLabel="Remove refill"
                            onPress={() => {
                              if (isDeleted) return;
                              handleRemoveRefill(refill.refill_id);
                            }}
                            style={[styles.iconBtn, isDeleted && styles.iconBtnDisabled]}
                          >
                            <Ionicons name="trash" size={16} color={isDeleted ? "#94a3b8" : "#b00020"} />
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  );
                }

                if (entry.kind === "inventory_adjustment") {
                  const adjustment = entry.data;
                  const isDeleted = entry.is_deleted;
                  return (
                    <View
                      key={`inv_adj_${adjustment.id}`}
                      style={[styles.card, isDeleted && styles.cardMuted]}
                    >
                      <View style={styles.cardHeader}>
                        <View style={styles.titleBlock}>
                          <View style={styles.inventoryLabelRow}>
                            <View style={styles.inventoryTypeBadge}>
                              <Text style={styles.inventoryTypeBadgeText}>Adjustment</Text>
                            </View>
                            {isDeleted && (
                              <View style={styles.inventoryBadge}>
                                <Text style={styles.inventoryBadgeText}>Deleted</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.metaLine}>
                            {formatDateTime(adjustment.effective_at)}
                          </Text>
                          <Text style={styles.metaLine}>
                            <Text style={[styles.metaLine, { color: gasColor(adjustment.gas_type), fontWeight: "700" }]}>
                              {adjustment.gas_type}
                            </Text>
                            : full {adjustment.delta_full} empty {adjustment.delta_empty}
                          </Text>
                          {adjustment.reason ? <Text style={styles.note}>{adjustment.reason}</Text> : null}
                        </View>
                        <View style={styles.actionsCompact}>
                          <Pressable
                            accessibilityLabel="Update adjustment"
                            onPress={() => {
                              if (isDeleted) return;
                              setEditingInventoryAdjust(adjustment);
                              setInventoryModalTab("inventory");
                              setInventoryModalOpen(true);
                            }}
                            style={[styles.iconBtn, isDeleted && styles.iconBtnDisabled]}
                          >
                            <Ionicons name="build-outline" size={16} color={isDeleted ? "#94a3b8" : "#0a7ea4"} />
                          </Pressable>
                          <Pressable
                            accessibilityLabel="Remove adjustment"
                            onPress={() => {
                              if (isDeleted) return;
                              handleDeleteInventoryAdjustment(adjustment);
                            }}
                            style={[styles.iconBtn, isDeleted && styles.iconBtnDisabled]}
                          >
                            <Ionicons name="trash" size={16} color={isDeleted ? "#94a3b8" : "#b00020"} />
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  );
                }

                const adjustment = entry.data;
                const isDeleted = entry.is_deleted;
                return (
                  <View
                    key={`cash_adj_${adjustment.id}`}
                    style={[styles.card, isDeleted && styles.cardMuted]}
                  >
                    <View style={styles.cardHeader}>
                      <View style={styles.titleBlock}>
                        <View style={styles.inventoryLabelRow}>
                          <View style={styles.inventoryTypeBadge}>
                            <Text style={styles.inventoryTypeBadgeText}>Cash</Text>
                          </View>
                          {isDeleted && (
                            <View style={styles.inventoryBadge}>
                              <Text style={styles.inventoryBadgeText}>Deleted</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.metaLine}>
                          {formatDateTime(adjustment.effective_at)}
                        </Text>
                        <Text style={styles.metaLine}>Amount: {adjustment.delta_cash}</Text>
                        {adjustment.reason ? <Text style={styles.note}>{adjustment.reason}</Text> : null}
                      </View>
                      <View style={styles.actionsCompact}>
                        <Pressable
                          accessibilityLabel="Update cash adjustment"
                          onPress={() => {
                            if (isDeleted) return;
                            setEditingCashAdjust(adjustment);
                            setInventoryModalTab("cash");
                            setInventoryModalOpen(true);
                          }}
                          style={[styles.iconBtn, isDeleted && styles.iconBtnDisabled]}
                        >
                          <Ionicons name="build-outline" size={16} color={isDeleted ? "#94a3b8" : "#0a7ea4"} />
                        </Pressable>
                        <Pressable
                          accessibilityLabel="Remove cash adjustment"
                          onPress={() => {
                            if (isDeleted) return;
                            handleDeleteCashAdjustment(adjustment);
                          }}
                          style={[styles.iconBtn, isDeleted && styles.iconBtnDisabled]}
                        >
                          <Ionicons name="trash" size={16} color={isDeleted ? "#94a3b8" : "#b00020"} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })}
              {inventoryItems.length === 0 && (
                <Text style={styles.meta}>No inventory activity yet.</Text>
              )}
            </View>
          </View>
        )}

      <InventoryHubModal
        visible={inventoryModalOpen}
        activeTab={inventoryModalTab}
        onTabChange={setInventoryModalTab}
        onClose={closeInventoryModal}
        businessDate={todayDate}
        accessoryId={accessoryId}
        editRefill={
          editRefill
            ? {
                ...editRefill,
                effective_at: refillDetailsQuery.data?.effective_at,
              }
            : null
        }
        onRefillSaved={() => {
          inventoryActivity.refillsQuery.refetch();
          closeInventoryModal();
        }}
        inventoryBefore={inventoryLatest.data ?? null}
        cashBefore={dailyReportQuery.data?.[0]?.cash_end ?? null}
        editingInventoryAdjust={editingInventoryAdjust}
        editingCashAdjust={editingCashAdjust}
        onInventoryAdjustSaved={() => {
          inventoryActivity.inventoryAdjustmentsQuery.refetch();
          closeInventoryModal();
        }}
        onCashAdjustSaved={() => {
          inventoryActivity.cashAdjustmentsQuery.refetch();
          closeInventoryModal();
        }}
        onCreateInventoryAdjust={async (payload) => {
          await adjustInventory.mutateAsync(payload);
        }}
        onUpdateInventoryAdjust={async (id, payload) => {
          await updateInventoryAdjust.mutateAsync({ id, payload });
        }}
        onCreateCashAdjust={async (payload) => {
          await createCashAdjust.mutateAsync(payload);
        }}
        onUpdateCashAdjust={async (id, payload) => {
          await updateCashAdjust.mutateAsync({ id, payload });
        }}
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

      <Modal
        transparent
        visible={collectionEditOpen}
        animationType="fade"
        onRequestClose={() => setCollectionEditOpen(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit collection</Text>
            {collectionEditTarget?.action_type === "payment" ? (
              <>
                <Text style={styles.modalLabel}>Amount</Text>
                <TextInput
                  style={styles.modalInput}
                  keyboardType="numeric"
                  inputMode="numeric"
                  value={collectionAmount}
                  onChangeText={setCollectionAmount}
                  placeholder="0"
                />
              </>
            ) : (
              <>
                <Text style={styles.modalLabel}>12kg</Text>
                <TextInput
                  style={styles.modalInput}
                  keyboardType="numeric"
                  inputMode="numeric"
                  value={collectionQty12}
                  onChangeText={setCollectionQty12}
                  placeholder="0"
                />
                <Text style={styles.modalLabel}>48kg</Text>
                <TextInput
                  style={styles.modalInput}
                  keyboardType="numeric"
                  inputMode="numeric"
                  value={collectionQty48}
                  onChangeText={setCollectionQty48}
                  placeholder="0"
                />
              </>
            )}
            <Text style={styles.modalLabel}>Note</Text>
            <TextInput
              style={styles.modalInput}
              value={collectionNote}
              onChangeText={setCollectionNote}
              placeholder="Optional note"
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={() => setCollectionEditOpen(false)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={handleSaveCollectionEdit}
              >
                <Text style={styles.modalBtnTextPrimary}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm modal */}
      <Modal transparent visible={!!confirm} animationType="fade" onRequestClose={() => setConfirm(null)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {confirm?.type === "order"
                ? "Delete order?"
                : confirm?.type === "collection"
                  ? "Delete collection?"
                  : "Delete customer?"}
            </Text>
            <Text style={styles.modalText}>This action cannot be undone in this mock data. Proceed?</Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={() => setConfirm(null)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnDanger]}
                onPress={async () => {
                  if (confirm?.type === "order") {
                    deleteOrder.mutate(confirm.id);
                    setConfirm(null);
                    return;
                  }
                  if (confirm?.type === "collection") {
                    deleteCollection.mutate(confirm.id);
                    setConfirm(null);
                    return;
                  }
                  if (confirm?.type === "customer") {
                    try {
                      await deleteCustomer.mutateAsync(confirm.id);
                    } catch (error: any) {
                      const detail = error?.response?.data?.detail;
                      if (error?.response?.status === 409 || detail === "customer_has_orders") {
                        setInfoMessage(
                          "You cannot delete this customer while they still have orders. Remove or reassign their orders first."
                        );
                      } else {
                        setInfoMessage("Could not delete this customer. Please try again.");
                      }
                    } finally {
                      setConfirm(null);
                    }
                  }
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

function getNowTime() {
  const now = new Date();
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function TimePickerModal({
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
  const times = useMemo(() => {
    const list: string[] = [];
    for (let hour = 0; hour < 24; hour += 1) {
      for (let minute = 0; minute < 60; minute += 15) {
        list.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
      }
    }
    return list;
  }, []);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.calendarOverlay}>
        <View style={styles.calendarCard}>
          <Text style={styles.calendarTitle}>Select time</Text>
          <ScrollView style={styles.timeList} contentContainerStyle={styles.timeListContent}>
            {times.map((time) => {
              const selected = time === value;
              return (
                <Pressable
                  key={time}
                  style={[styles.timeItem, selected && styles.timeItemSelected]}
                  onPress={() => {
                    onSelect(time);
                    onClose();
                  }}
                >
                  <Text style={[styles.timeText, selected && styles.timeTextSelected]}>{time}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable style={styles.calendarClose} onPress={onClose}>
            <Text style={styles.calendarCloseText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function InventoryHubModal({
  visible,
  activeTab,
  onTabChange,
  onClose,
  businessDate,
  accessoryId,
  editRefill,
  onRefillSaved,
  inventoryBefore,
  cashBefore,
  editingInventoryAdjust,
  editingCashAdjust,
  onInventoryAdjustSaved,
  onCashAdjustSaved,
  onCreateInventoryAdjust,
  onUpdateInventoryAdjust,
  onCreateCashAdjust,
  onUpdateCashAdjust,
}: {
  visible: boolean;
  activeTab: "refill" | "cash" | "inventory";
  onTabChange: (next: "refill" | "cash" | "inventory") => void;
  onClose: () => void;
  businessDate: string;
  accessoryId?: string;
  editRefill: {
    refill_id: string;
    date: string;
    time_of_day: "morning" | "evening";
    buy12: number;
    return12: number;
    buy48: number;
    return48: number;
    effective_at?: string;
  } | null;
  onRefillSaved: () => void;
  inventoryBefore: {
    full12: number;
    empty12: number;
    full48: number;
    empty48: number;
  } | null;
  cashBefore: number | null;
  editingInventoryAdjust: InventoryAdjustment | null;
  editingCashAdjust: CashAdjustment | null;
  onInventoryAdjustSaved: () => void;
  onCashAdjustSaved: () => void;
  onCreateInventoryAdjust: (payload: {
    date: string;
    gas_type: "12kg" | "48kg";
    delta_full: number;
    delta_empty: number;
    reason: string;
  }) => Promise<void>;
  onUpdateInventoryAdjust: (id: string, payload: { delta_full?: number; delta_empty?: number; reason?: string }) => Promise<void>;
  onCreateCashAdjust: (payload: { date: string; delta_cash: number; reason?: string }) => Promise<void>;
  onUpdateCashAdjust: (id: string, payload: { delta_cash?: number; reason?: string }) => Promise<void>;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.hubOverlay} onPress={Keyboard.dismiss}>
        <Pressable style={styles.hubScreen} onPress={(event) => event.stopPropagation()}>
          <SafeAreaView style={styles.hubSafeArea}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
              style={styles.hubScreenInner}
            >
              <View style={styles.hubHeaderRow}>
                <Text style={styles.hubTitle}>Inventory</Text>
                <Pressable onPress={onClose} style={styles.hubClose}>
                  <Ionicons name="close" size={22} color="#0f172a" />
                </Pressable>
              </View>
              <View style={styles.modeRow}>
              {(["refill", "cash", "inventory"] as const).map((tab) => {
                const label = tab === "refill" ? "Refill" : tab === "cash" ? "Adjust Cash" : "Adjust Inventory";
                return (
                  <Pressable
                    key={tab}
                    onPress={() => onTabChange(tab)}
                    style={[styles.modeButton, activeTab === tab && styles.modeButtonActive]}
                  >
                    <Text style={[styles.modeText, activeTab === tab && styles.modeTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
              </View>
              {activeTab === "refill" ? (
              <RefillForm
                visible={visible}
                onClose={onClose}
                onSaved={onRefillSaved}
                accessoryId={accessoryId}
                editEntry={editRefill}
                showHeader={false}
                useCard={false}
                containerStyle={styles.hubFormContainer}
                scrollStyle={styles.hubScroll}
              />
              ) : (
              <ScrollView
                contentContainerStyle={styles.hubContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                {activeTab === "cash" ? (
                  <CashAdjustForm
                    visible={visible}
                    entry={editingCashAdjust}
                    date={businessDate}
                    accessoryId={accessoryId}
                    cashBefore={cashBefore}
                    onCreate={onCreateCashAdjust}
                    onUpdate={onUpdateCashAdjust}
                    onSaved={onCashAdjustSaved}
                    onCancel={onClose}
                  />
                ) : (
                  <InventoryAdjustForm
                    visible={visible}
                    entry={editingInventoryAdjust}
                    date={businessDate}
                    accessoryId={accessoryId}
                    inventoryBefore={inventoryBefore}
                    onCreate={onCreateInventoryAdjust}
                    onUpdate={onUpdateInventoryAdjust}
                    onSaved={onInventoryAdjustSaved}
                    onCancel={onClose}
                  />
                )}
              </ScrollView>
              )}
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function InventoryAdjustForm({
  visible,
  entry,
  date,
  accessoryId,
  inventoryBefore,
  onCreate,
  onUpdate,
  onSaved,
  onCancel,
}: {
  visible: boolean;
  entry: InventoryAdjustment | null;
  date: string;
  accessoryId?: string;
  inventoryBefore: { full12: number; empty12: number; full48: number; empty48: number } | null;
  onCreate: (payload: {
    date: string;
    time?: string;
    gas_type: "12kg" | "48kg";
    delta_full: number;
    delta_empty: number;
    reason: string;
  }) => Promise<void>;
  onUpdate: (id: string, payload: { delta_full?: number; delta_empty?: number; reason?: string }) => Promise<void>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [gasType, setGasType] = useState<"12kg" | "48kg">(entry?.gas_type ?? "12kg");
  const [full12, setFull12] = useState(String(entry?.gas_type === "12kg" ? entry?.delta_full ?? 0 : 0));
  const [empty12, setEmpty12] = useState(String(entry?.gas_type === "12kg" ? entry?.delta_empty ?? 0 : 0));
  const [full48, setFull48] = useState(String(entry?.gas_type === "48kg" ? entry?.delta_full ?? 0 : 0));
  const [empty48, setEmpty48] = useState(String(entry?.gas_type === "48kg" ? entry?.delta_empty ?? 0 : 0));
  const [reason, setReason] = useState(entry?.reason ?? "");
  const [adjustDate, setAdjustDate] = useState(() => date);
  const [adjustTime, setAdjustTime] = useState(() => getNowTime());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setGasType(entry?.gas_type ?? "12kg");
    setFull12(String(entry?.gas_type === "12kg" ? entry?.delta_full ?? 0 : 0));
    setEmpty12(String(entry?.gas_type === "12kg" ? entry?.delta_empty ?? 0 : 0));
    setFull48(String(entry?.gas_type === "48kg" ? entry?.delta_full ?? 0 : 0));
    setEmpty48(String(entry?.gas_type === "48kg" ? entry?.delta_empty ?? 0 : 0));
    setReason(entry?.reason ?? "");
    if (entry?.effective_at) {
      const parsed = new Date(entry.effective_at);
      if (!Number.isNaN(parsed.getTime())) {
        setAdjustDate(parsed.toISOString().slice(0, 10));
        setAdjustTime(parsed.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }));
      }
    } else {
      setAdjustDate(date);
      setAdjustTime(getNowTime());
    }
  }, [entry, visible]);

  const deltaFull12 = Number(full12) || 0;
  const deltaEmpty12 = Number(empty12) || 0;
  const deltaFull48 = Number(full48) || 0;
  const deltaEmpty48 = Number(empty48) || 0;
  const baseFull12 = inventoryBefore?.full12;
  const baseEmpty12 = inventoryBefore?.empty12;
  const baseFull48 = inventoryBefore?.full48;
  const baseEmpty48 = inventoryBefore?.empty48;

  const save = async () => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      Alert.alert("Reason required", "Please add a reason for the adjustment.");
      return;
    }
    try {
      if (entry) {
        const delta_full = gasType === "12kg" ? deltaFull12 : deltaFull48;
        const delta_empty = gasType === "12kg" ? deltaEmpty12 : deltaEmpty48;
        await onUpdate(entry.id, { delta_full, delta_empty, reason: trimmedReason });
      } else {
        if (deltaFull12 || deltaEmpty12) {
          await onCreate({
            date: adjustDate,
            time: adjustTime,
            gas_type: "12kg",
            delta_full: deltaFull12,
            delta_empty: deltaEmpty12,
            reason: trimmedReason,
          });
        }
        if (deltaFull48 || deltaEmpty48) {
          await onCreate({
            date: adjustDate,
            time: adjustTime,
            gas_type: "48kg",
            delta_full: deltaFull48,
            delta_empty: deltaEmpty48,
            reason: trimmedReason,
          });
        }
      }
      onSaved();
    } catch (err: any) {
      Alert.alert("Adjustment failed", err?.response?.data?.detail ?? "Failed to save adjustment.");
    }
  };

  const stepValue = (setter: (value: string) => void, value: string, delta: number) => {
    const current = Number(value) || 0;
    setter(String(current + delta));
  };

  return (
    <View style={[styles.hubForm, styles.hubSectionCard]}>
      <Text style={styles.modalLabel}>Date & time</Text>
      <View style={styles.row}>
        <Pressable style={styles.dateField} onPress={() => setCalendarOpen(true)}>
          <Text style={styles.dateText}>{adjustDate}</Text>
          <Ionicons name="calendar-outline" size={16} color="#0a7ea4" />
        </Pressable>
        <Pressable style={styles.dateField} onPress={() => setTimeOpen(true)}>
          <Text style={styles.dateText}>{adjustTime}</Text>
          <Ionicons name="time-outline" size={16} color="#0a7ea4" />
        </Pressable>
      </View>
      {entry ? (
        <>
          <Text style={styles.modalLabel}>Gas type</Text>
          <View style={styles.chipRow}>
            {(["12kg", "48kg"] as const).map((type) => (
              <Pressable
                key={type}
                onPress={() => !entry && setGasType(type)}
                style={[styles.chip, gasType === type && styles.chipActive, styles.chipDisabled]}
              >
                <Text style={[styles.chipText, gasType === type && styles.chipTextActive]}>{type}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.adjustGrid}>
        <View style={styles.adjustColumn}>
          <Text style={styles.modalLabel}>12kg</Text>
          <Text style={styles.adjustLabel}>Full</Text>
          <View style={styles.stepperRow}>
            <Pressable
              style={[styles.stepperBtn, entry && gasType !== "12kg" && styles.stepperBtnDisabled]}
              onPress={() => {
                if (entry && gasType !== "12kg") return;
                stepValue(setFull12, full12, -1);
              }}
            >
              <Ionicons name="remove" size={16} color="#0a7ea4" />
            </Pressable>
            <TextInput
              style={[styles.modalInput, styles.stepperInput]}
              placeholder="0"
              keyboardType="number-pad"
              value={full12}
              onChangeText={setFull12}
              inputAccessoryViewID={accessoryId}
              editable={!entry || gasType === "12kg"}
            />
            <Pressable
              style={[styles.stepperBtn, entry && gasType !== "12kg" && styles.stepperBtnDisabled]}
              onPress={() => {
                if (entry && gasType !== "12kg") return;
                stepValue(setFull12, full12, 1);
              }}
            >
              <Ionicons name="add" size={16} color="#0a7ea4" />
            </Pressable>
          </View>
          <Text style={styles.adjustLabel}>Empty</Text>
          <View style={styles.stepperRow}>
            <Pressable
              style={[styles.stepperBtn, entry && gasType !== "12kg" && styles.stepperBtnDisabled]}
              onPress={() => {
                if (entry && gasType !== "12kg") return;
                stepValue(setEmpty12, empty12, -1);
              }}
            >
              <Ionicons name="remove" size={16} color="#0a7ea4" />
            </Pressable>
            <TextInput
              style={[styles.modalInput, styles.stepperInput]}
              placeholder="0"
              keyboardType="number-pad"
              value={empty12}
              onChangeText={setEmpty12}
              inputAccessoryViewID={accessoryId}
              editable={!entry || gasType === "12kg"}
            />
            <Pressable
              style={[styles.stepperBtn, entry && gasType !== "12kg" && styles.stepperBtnDisabled]}
              onPress={() => {
                if (entry && gasType !== "12kg") return;
                stepValue(setEmpty12, empty12, 1);
              }}
            >
              <Ionicons name="add" size={16} color="#0a7ea4" />
            </Pressable>
          </View>
          {baseFull12 !== undefined && baseEmpty12 !== undefined && (deltaFull12 || deltaEmpty12) ? (
            <Text style={styles.impactLabel}>
              {baseFull12} -> {baseFull12 + deltaFull12} | {baseEmpty12} -> {baseEmpty12 + deltaEmpty12}
            </Text>
          ) : null}
        </View>

        <View style={styles.adjustColumn}>
          <Text style={styles.modalLabel}>48kg</Text>
          <Text style={styles.adjustLabel}>Full</Text>
          <View style={styles.stepperRow}>
            <Pressable
              style={[styles.stepperBtn, entry && gasType !== "48kg" && styles.stepperBtnDisabled]}
              onPress={() => {
                if (entry && gasType !== "48kg") return;
                stepValue(setFull48, full48, -1);
              }}
            >
              <Ionicons name="remove" size={16} color="#0a7ea4" />
            </Pressable>
            <TextInput
              style={[styles.modalInput, styles.stepperInput]}
              placeholder="0"
              keyboardType="number-pad"
              value={full48}
              onChangeText={setFull48}
              inputAccessoryViewID={accessoryId}
              editable={!entry || gasType === "48kg"}
            />
            <Pressable
              style={[styles.stepperBtn, entry && gasType !== "48kg" && styles.stepperBtnDisabled]}
              onPress={() => {
                if (entry && gasType !== "48kg") return;
                stepValue(setFull48, full48, 1);
              }}
            >
              <Ionicons name="add" size={16} color="#0a7ea4" />
            </Pressable>
          </View>
          <Text style={styles.adjustLabel}>Empty</Text>
          <View style={styles.stepperRow}>
            <Pressable
              style={[styles.stepperBtn, entry && gasType !== "48kg" && styles.stepperBtnDisabled]}
              onPress={() => {
                if (entry && gasType !== "48kg") return;
                stepValue(setEmpty48, empty48, -1);
              }}
            >
              <Ionicons name="remove" size={16} color="#0a7ea4" />
            </Pressable>
            <TextInput
              style={[styles.modalInput, styles.stepperInput]}
              placeholder="0"
              keyboardType="number-pad"
              value={empty48}
              onChangeText={setEmpty48}
              inputAccessoryViewID={accessoryId}
              editable={!entry || gasType === "48kg"}
            />
            <Pressable
              style={[styles.stepperBtn, entry && gasType !== "48kg" && styles.stepperBtnDisabled]}
              onPress={() => {
                if (entry && gasType !== "48kg") return;
                stepValue(setEmpty48, empty48, 1);
              }}
            >
              <Ionicons name="add" size={16} color="#0a7ea4" />
            </Pressable>
          </View>
          {baseFull48 !== undefined && baseEmpty48 !== undefined && (deltaFull48 || deltaEmpty48) ? (
            <Text style={styles.impactLabel}>
              {baseFull48} -> {baseFull48 + deltaFull48} | {baseEmpty48} -> {baseEmpty48 + deltaEmpty48}
            </Text>
          ) : null}
        </View>
      </View>

      <Text style={styles.modalLabel}>Reason</Text>
      <TextInput
        style={styles.modalInput}
        placeholder="Required"
        value={reason}
        onChangeText={setReason}
      />

      <View style={styles.modalActions}>
        <Pressable style={styles.modalBtn} onPress={onCancel}>
          <Text style={styles.modalBtnText}>Cancel</Text>
        </Pressable>
        <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={save}>
          <Text style={styles.modalBtnTextPrimary}>{entry ? "Save" : "Add"}</Text>
        </Pressable>
      </View>
      <CalendarModal
        visible={calendarOpen}
        value={adjustDate}
        onSelect={(next) => {
          setAdjustDate(next);
          setCalendarOpen(false);
        }}
        onClose={() => setCalendarOpen(false)}
      />
      <TimePickerModal
        visible={timeOpen}
        value={adjustTime}
        onSelect={(next) => {
          setAdjustTime(next);
          setTimeOpen(false);
        }}
        onClose={() => setTimeOpen(false)}
      />
    </View>
  );
}

function CashAdjustForm({
  visible,
  entry,
  date,
  accessoryId,
  cashBefore,
  onCreate,
  onUpdate,
  onSaved,
  onCancel,
}: {
  visible: boolean;
  entry: CashAdjustment | null;
  date: string;
  accessoryId?: string;
  cashBefore: number | null;
  onCreate: (payload: { date: string; time?: string; delta_cash: number; reason?: string }) => Promise<void>;
  onUpdate: (id: string, payload: { delta_cash?: number; reason?: string }) => Promise<void>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [deltaCash, setDeltaCash] = useState(String(entry?.delta_cash ?? 0));
  const [reason, setReason] = useState(entry?.reason ?? "");
  const [adjustDate, setAdjustDate] = useState(() => date);
  const [adjustTime, setAdjustTime] = useState(() => getNowTime());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDeltaCash(String(entry?.delta_cash ?? 0));
    setReason(entry?.reason ?? "");
    if (entry?.effective_at) {
      const parsed = new Date(entry.effective_at);
      if (!Number.isNaN(parsed.getTime())) {
        setAdjustDate(parsed.toISOString().slice(0, 10));
        setAdjustTime(parsed.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }));
      }
    } else {
      setAdjustDate(date);
      setAdjustTime(getNowTime());
    }
  }, [entry, visible]);

  const deltaValue = Number(deltaCash) || 0;

  const save = async () => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      Alert.alert("Reason required", "Please add a reason for the adjustment.");
      return;
    }
    if (!entry && !deltaFull12 && !deltaEmpty12 && !deltaFull48 && !deltaEmpty48) {
      Alert.alert("No changes", "Enter a 12kg or 48kg adjustment first.");
      return;
    }
    try {
      if (entry) {
        await onUpdate(entry.id, { delta_cash: deltaValue, reason: trimmedReason });
      } else {
        await onCreate({ date: adjustDate, time: adjustTime, delta_cash: deltaValue, reason: trimmedReason });
      }
      onSaved();
    } catch (err: any) {
      Alert.alert("Adjustment failed", err?.response?.data?.detail ?? "Failed to save adjustment.");
    }
  };

  const stepValue = (delta: number) => {
    const current = Number(deltaCash) || 0;
    setDeltaCash(String(current + delta));
  };

  return (
    <View style={[styles.hubForm, styles.hubSectionCard]}>
      <Text style={styles.modalLabel}>Date & time</Text>
      <View style={styles.row}>
        <Pressable style={styles.dateField} onPress={() => setCalendarOpen(true)}>
          <Text style={styles.dateText}>{adjustDate}</Text>
          <Ionicons name="calendar-outline" size={16} color="#0a7ea4" />
        </Pressable>
        <Pressable style={styles.dateField} onPress={() => setTimeOpen(true)}>
          <Text style={styles.dateText}>{adjustTime}</Text>
          <Ionicons name="time-outline" size={16} color="#0a7ea4" />
        </Pressable>
      </View>
      <Text style={styles.modalLabel}>Amount</Text>
      <View style={styles.stepperRow}>
        <Pressable style={styles.stepperBtn} onPress={() => stepValue(-1)}>
          <Ionicons name="remove" size={16} color="#0a7ea4" />
        </Pressable>
        <TextInput
          style={[styles.modalInput, styles.stepperInput]}
          placeholder="0"
          keyboardType="number-pad"
          value={deltaCash}
          onChangeText={setDeltaCash}
          inputAccessoryViewID={accessoryId}
        />
        <Pressable style={styles.stepperBtn} onPress={() => stepValue(1)}>
          <Ionicons name="add" size={16} color="#0a7ea4" />
        </Pressable>
      </View>

      {cashBefore !== null && deltaValue ? (
        <Text style={styles.impactLabel}>
          Impact: {cashBefore} NIS -> {cashBefore + deltaValue} NIS
        </Text>
      ) : null}

      <Text style={styles.modalLabel}>Reason</Text>
      <TextInput
        style={styles.modalInput}
        placeholder="Required"
        value={reason}
        onChangeText={setReason}
      />

      <View style={styles.modalActions}>
        <Pressable style={styles.modalBtn} onPress={onCancel}>
          <Text style={styles.modalBtnText}>Cancel</Text>
        </Pressable>
        <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={save}>
          <Text style={styles.modalBtnTextPrimary}>{entry ? "Save" : "Add"}</Text>
        </Pressable>
      </View>
      <CalendarModal
        visible={calendarOpen}
        value={adjustDate}
        onSelect={(next) => {
          setAdjustDate(next);
          setCalendarOpen(false);
        }}
        onClose={() => setCalendarOpen(false)}
      />
      <TimePickerModal
        visible={timeOpen}
        value={adjustTime}
        onSelect={(next) => {
          setAdjustTime(next);
          setTimeOpen(false);
        }}
        onClose={() => setTimeOpen(false)}
      />
    </View>
  );
}

function InventoryAdjustModal({
  visible,
  entry,
  date,
  onClose,
  onCreate,
  onUpdate,
}: {
  visible: boolean;
  entry: InventoryAdjustment | null;
  date: string;
  onClose: () => void;
  onCreate: (payload: {
    date: string;
    gas_type: "12kg" | "48kg";
    delta_full: number;
    delta_empty: number;
    reason: string;
  }) => Promise<void>;
  onUpdate: (id: string, payload: { delta_full?: number; delta_empty?: number; reason?: string }) => Promise<void>;
}) {
  const [gasType, setGasType] = useState<"12kg" | "48kg">(entry?.gas_type ?? "12kg");
  const [full, setFull] = useState(String(entry?.delta_full ?? 0));
  const [empty, setEmpty] = useState(String(entry?.delta_empty ?? 0));
  const [reason, setReason] = useState(entry?.reason ?? "");

  useEffect(() => {
    if (!visible) return;
    setGasType(entry?.gas_type ?? "12kg");
    setFull(String(entry?.delta_full ?? 0));
    setEmpty(String(entry?.delta_empty ?? 0));
    setReason(entry?.reason ?? "");
  }, [visible, entry]);

  const save = async () => {
    const delta_full = Number(full) || 0;
    const delta_empty = Number(empty) || 0;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      Alert.alert("Reason required", "Please add a reason for the adjustment.");
      return;
    }
    try {
      if (entry) {
        await onUpdate(entry.id, { delta_full, delta_empty, reason: trimmedReason });
      } else {
        await onCreate({ date, gas_type: gasType, delta_full, delta_empty, reason: trimmedReason });
      }
      onClose();
    } catch (err: any) {
      Alert.alert("Adjustment failed", err?.response?.data?.detail ?? "Failed to save adjustment.");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{entry ? "Edit inventory adjustment" : "Adjust inventory"}</Text>
          <Text style={styles.meta}>Date: {date}</Text>

          <Text style={styles.modalLabel}>Type</Text>
          <View style={styles.chipRow}>
            {(["12kg", "48kg"] as const).map((type) => (
              <Pressable
                key={type}
                onPress={() => !entry && setGasType(type)}
                style={[
                  styles.chip,
                  gasType === type && styles.chipActive,
                  entry && styles.chipDisabled,
                ]}
              >
                <Text style={[styles.chipText, gasType === type && styles.chipTextActive]}>{type}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.modalLabel}>Full delta</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="e.g. 5 or -3"
            keyboardType="number-pad"
            value={full}
            onChangeText={setFull}
          />

          <Text style={styles.modalLabel}>Empty delta</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="e.g. 2 or -1"
            keyboardType="number-pad"
            value={empty}
            onChangeText={setEmpty}
          />

          <Text style={styles.modalLabel}>Reason</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Required"
            value={reason}
            onChangeText={setReason}
          />

          <View style={styles.modalActions}>
            <Pressable style={styles.modalBtn} onPress={onClose}>
              <Text style={styles.modalBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={save}>
              <Text style={styles.modalBtnTextPrimary}>{entry ? "Save" : "Add"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CashAdjustModal({
  visible,
  entry,
  date,
  onClose,
  onCreate,
  onUpdate,
}: {
  visible: boolean;
  entry: CashAdjustment | null;
  date: string;
  onClose: () => void;
  onCreate: (payload: { date: string; delta_cash: number; reason?: string }) => Promise<void>;
  onUpdate: (id: string, payload: { delta_cash?: number; reason?: string }) => Promise<void>;
}) {
  const [deltaCash, setDeltaCash] = useState(String(entry?.delta_cash ?? 0));
  const [reason, setReason] = useState(entry?.reason ?? "");

  useEffect(() => {
    if (!visible) return;
    setDeltaCash(String(entry?.delta_cash ?? 0));
    setReason(entry?.reason ?? "");
  }, [visible, entry]);

  const save = async () => {
    const delta_cash = Number(deltaCash) || 0;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      Alert.alert("Reason required", "Please add a reason for the adjustment.");
      return;
    }
    try {
      if (entry) {
        await onUpdate(entry.id, { delta_cash, reason: trimmedReason });
      } else {
        await onCreate({ date, delta_cash, reason: trimmedReason });
      }
      onClose();
    } catch (err: any) {
      Alert.alert("Adjustment failed", err?.response?.data?.detail ?? "Failed to save adjustment.");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{entry ? "Edit cash adjustment" : "Adjust cash"}</Text>
          <Text style={styles.meta}>Date: {date}</Text>

          <Text style={styles.modalLabel}>Amount (positive or negative)</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="e.g. -200"
            keyboardType="number-pad"
            value={deltaCash}
            onChangeText={setDeltaCash}
          />

          <Text style={styles.modalLabel}>Reason</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Required"
            value={reason}
            onChangeText={setReason}
          />

          <View style={styles.modalActions}>
            <Pressable style={styles.modalBtn} onPress={onClose}>
              <Text style={styles.modalBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={save}>
              <Text style={styles.modalBtnTextPrimary}>{entry ? "Save" : "Add"}</Text>
            </Pressable>
          </View>
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
  hubOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  hubScreen: {
    flex: 1,
  },
  hubSafeArea: {
    flex: 1,
    backgroundColor: "#f3f5f7",
  },
  hubScreenInner: {
    flex: 1,
    padding: 14,
    gap: 8,
    backgroundColor: "#f3f5f7",
  },
  hubHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  hubTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0f172a",
  },
  hubClose: {
    padding: 6,
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
  modalLabel: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "700",
    color: "#1c1c1c",
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
    marginBottom: 2,
  },
  modeButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
  },
  modeButtonActive: { backgroundColor: "#0a7ea4" },
  modeText: { fontWeight: "700", color: "#1f2937" },
  modeTextActive: { color: "#fff" },
  hubContent: {
    gap: 12,
    paddingBottom: 4,
  },
  hubForm: {
    gap: 8,
  },
  hubFormContainer: {
    flexGrow: 1,
    width: "100%",
  },
  hubScroll: {
    maxHeight: "100%",
    width: "100%",
  },
  hubSectionCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  adjustGrid: {
    flexDirection: "row",
    gap: 12,
  },
  adjustColumn: {
    flex: 1,
    gap: 6,
  },
  adjustLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#e8eef1",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnDisabled: {
    opacity: 0.5,
  },
  stepperInput: {
    flex: 1,
    textAlign: "center",
  },
  impactLabel: {
    marginTop: 6,
    fontSize: 12,
    color: "#0f172a",
    fontWeight: "600",
  },
  modalInput: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#f7f7f8",
    borderWidth: 1,
    borderColor: "#e2e8f0",
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
  modalBtnPrimary: {
    backgroundColor: "#0a7ea4",
  },
  modalBtnDanger: {
    backgroundColor: "#b00020",
  },
  modalBtnText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  modalBtnTextPrimary: {
    color: "#fff",
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
  inventoryHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  inventoryToggle: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#e8eef1",
  },
  inventoryToggleActive: {
    backgroundColor: "#0a7ea4",
  },
  inventoryToggleText: {
    color: "#0a7ea4",
    fontWeight: "700",
    fontSize: 12,
  },
  inventoryToggleTextActive: {
    color: "#fff",
  },
  inventoryLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  inventoryTypeBadge: {
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  inventoryTypeBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  inventoryBadge: {
    backgroundColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  inventoryBadgeText: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
  },
  cardMuted: {
    opacity: 0.6,
  },
  iconBtnDisabled: {
    opacity: 0.5,
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
  timeList: {
    maxHeight: 240,
  },
  timeListContent: {
    gap: 6,
  },
  timeItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
  },
  timeItemSelected: {
    backgroundColor: "#0a7ea4",
  },
  timeText: {
    fontWeight: "600",
    color: "#1f2937",
  },
  timeTextSelected: {
    color: "#fff",
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
  chipDisabled: {
    opacity: 0.6,
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
  collectionBadge: {
    backgroundColor: "#e0f2fe",
    color: "#0a7ea4",
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
  collectionSnapshotGrid: {
    marginTop: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  collectionSnapshotBox: {
    minWidth: 120,
    flexGrow: 1,
    padding: 8,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  collectionSnapshotLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0f172a",
  },
  collectionSnapshotValue: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "900",
    color: "#0f172a",
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
