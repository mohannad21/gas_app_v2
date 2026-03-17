import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, InputAccessoryView, Keyboard, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import FilterChipRow from "@/components/add/FilterChipRow";
import NewSectionSearch from "@/components/add/NewSectionSearch";
import {
  CustomerListSubFilter,
  CustomerListTopFilter,
} from "@/components/customers/customerListFilters";
import CompanyBalancesSection from "@/components/reports/CompanyBalancesSection";
import { useBankDeposits, useDeleteBankDeposit } from "@/hooks/useBankDeposits";
import { useDeleteCashAdjustment } from "@/hooks/useCash";
import { useBalancesSummary } from "@/hooks/useBalancesSummary";
import { useAllCustomerAdjustments, useCustomers, useDeleteCustomer } from "@/hooks/useCustomers";
import { useCollections, useDeleteCollection, useUpdateCollection } from "@/hooks/useCollections";
import { useDeleteOrder, useOrders } from "@/hooks/useOrders";
import { useDeleteExpense, useExpenses } from "@/hooks/useExpenses";
import {
  useDeleteInventoryAdjustment,
  useDeleteRefill,
} from "@/hooks/useInventory";
import { InventoryActivityItem, useInventoryActivity } from "@/hooks/useInventoryActivity";
import { usePriceSettings, useSavePriceSetting } from "@/hooks/usePrices";
import { useDailyReportDayV2 } from "@/hooks/useReports";
import { useSystems } from "@/hooks/useSystems";
import { consumeAddShortcut } from "@/lib/addShortcut";
import { formatDateTimeLocale, toDateKey } from "@/lib/date";
import { calcCustomerCylinderDelta, calcMoneyUiResult } from "@/lib/ledgerMath";
import { gasColor } from "@/constants/gas";
import {
  PriceInputs,
  createDefaultPriceInputs,
  PriceMatrixSection,
  gasTypes,
} from "@/components/PriceMatrix";
import { BankDeposit, CashAdjustment, CollectionEvent, CustomerAdjustment, DailyReportV2Event, Expense, GasType, InventoryAdjustment, Order, PriceSetting } from "@/types/domain";

type AddMode =
  | "customer_activities"
  | "company_activities"
  | "expenses"
  | "ledger_adjustments";

type CustomerActivityFilter =
  | "all"
  | "replacement"
  | "late_payment"
  | "return_empties"
  | "payout"
  | "sell_full"
  | "buy_empty"
  | "adjustment";

type CompanyActivityFilter = "all" | "refill" | "company_payment" | "buy_full";
type ExpensePrimaryFilter = "all" | "expense" | "wallet_to_bank" | "bank_to_wallet";
type ExpenseCategoryFilter = "all_categories" | string;
type LedgerActivityFilter = "all" | "inventory_adjustment" | "cash_adjustment";

type CustomerActivityListItem =
  | {
      id: string;
      kind: "order";
      filterId: Exclude<CustomerActivityFilter, "all" | "late_payment" | "return_empties" | "payout" | "adjustment">;
      sortAt: string;
      customerName: string;
      data: Order;
    }
  | {
      id: string;
      kind: "collection";
      filterId: Exclude<CustomerActivityFilter, "all" | "replacement" | "sell_full" | "buy_empty" | "adjustment">;
      sortAt: string;
      customerName: string;
      data: CollectionEvent;
    }
  | {
      id: string;
      kind: "adjustment";
      filterId: "adjustment";
      sortAt: string;
      customerName: string;
      data: CustomerAdjustment;
    };

type ExpenseListItem =
  | {
      id: string;
      kind: "expense";
      sortAt: string;
      data: Expense;
    }
  | {
      id: string;
      kind: "bank_transfer";
      direction: Exclude<ExpensePrimaryFilter, "all" | "expense">;
      sortAt: string;
      data: BankDeposit;
    };

type CompanyActivityListItem =
  | {
      id: string;
      kind: "refill";
      sortAt: string;
      is_deleted: boolean;
      data: Extract<InventoryActivityItem, { kind: "refill" }>["data"];
    }
  | {
      id: string;
      kind: "company_payment";
      sortAt: string;
      is_deleted: false;
      data: DailyReportV2Event;
    };

const customerActivityFilters: { id: CustomerActivityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "replacement", label: "Replacement" },
  { id: "late_payment", label: "Late Payment" },
  { id: "return_empties", label: "Return Empties" },
  { id: "payout", label: "Payout" },
  { id: "sell_full", label: "Sell Full" },
  { id: "buy_empty", label: "Buy Empty" },
  { id: "adjustment", label: "Adjustment" },
];

const companyActivityFilters: { id: CompanyActivityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "refill", label: "Refill" },
  { id: "company_payment", label: "Company Payment" },
  { id: "buy_full", label: "Buy Full" },
];

const expensePrimaryFilters: { id: ExpensePrimaryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "expense", label: "Expense" },
  { id: "wallet_to_bank", label: "Wallet to Bank" },
  { id: "bank_to_wallet", label: "Bank to Wallet" },
];

const ledgerActivityFilters: { id: LedgerActivityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "inventory_adjustment", label: "Inventory Adjustment" },
  { id: "cash_adjustment", label: "Wallet Adjustment" },
];

export default function AddChooserScreen() {
  const addParams = useLocalSearchParams<{ prices?: string; open?: string }>();
  const [mode, setMode] = useState<AddMode>("customer_activities");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerActivityFilter, setCustomerActivityFilter] = useState<CustomerActivityFilter>("all");
  const [companyActivityFilter, setCompanyActivityFilter] = useState<CompanyActivityFilter>("all");
  const [expensePrimaryFilter, setExpensePrimaryFilter] = useState<ExpensePrimaryFilter>("all");
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<ExpenseCategoryFilter>("all_categories");
  const [ledgerActivityFilter, setLedgerActivityFilter] = useState<LedgerActivityFilter>("all");
  const isCustomerActivities = mode === "customer_activities";
  const isCompanyActivities = mode === "company_activities";
  const isExpenses = mode === "expenses";
  const isLedgerAdjustments = mode === "ledger_adjustments";
  const [confirm, setConfirm] = useState<{ type: "order" | "collection"; id: string; name?: string } | null>(null);
  const ordersQuery = useOrders();
  const collectionsQuery = useCollections();
  const updateCollection = useUpdateCollection();
  const deleteCollection = useDeleteCollection();
  const customersQuery = useCustomers();
  const customerIds = useMemo(
    () => (customersQuery.data ?? []).map((customer) => customer.id).sort(),
    [customersQuery.data]
  );
  const customerAdjustmentsQuery = useAllCustomerAdjustments(customerIds, { enabled: isCustomerActivities });
  const deleteOrder = useDeleteOrder();
  const systemsQuery = useSystems();
  const { companySummary, companyBalancesQuery } = useBalancesSummary();
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [collectionEditOpen, setCollectionEditOpen] = useState(false);
  const [collectionEditTarget, setCollectionEditTarget] = useState<any | null>(null);
  const [collectionAmount, setCollectionAmount] = useState("");
  const [collectionQty12, setCollectionQty12] = useState("");
  const [collectionQty48, setCollectionQty48] = useState("");
  const [collectionNote, setCollectionNote] = useState("");
  const accessoryId = Platform.OS === "ios" ? "addAccessory" : undefined;
  const deleteRefill = useDeleteRefill();
  const deleteInventoryAdjust = useDeleteInventoryAdjustment();
  const deleteCashAdjust = useDeleteCashAdjustment();
  const deleteExpense = useDeleteExpense();

const formatDateTime = (value?: string) => {
  if (!value) return "—";
  return formatDateTimeLocale(value, undefined, undefined, value);
};
  const getLocalDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const todayDate = getLocalDateString();
  const inventoryActivity = useInventoryActivity(todayDate);
  const dayReportQuery = useDailyReportDayV2(todayDate);
  const expensesQuery = useExpenses(undefined, { enabled: isExpenses });
  const bankDepositsQuery = useBankDeposits(todayDate, { enabled: isExpenses });
  const deleteBankDeposit = useDeleteBankDeposit();


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
  const customersById = useMemo(
    () => new Map((customersQuery.data ?? []).map((customer) => [customer.id, customer])),
    [customersQuery.data]
  );
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

  const customerActivityItems = useMemo<CustomerActivityListItem[]>(() => {
    const orderItems = orders.map<CustomerActivityListItem>((order) => ({
      id: `order-${order.id}`,
      kind: "order" as const,
      filterId:
        order.order_mode === "sell_iron"
          ? ("sell_full" as const)
          : order.order_mode === "buy_iron"
            ? ("buy_empty" as const)
            : ("replacement" as const),
      sortAt: order.created_at || order.delivered_at || new Date().toISOString(),
      customerName: customersById.get(order.customer_id)?.name ?? order.customer_id,
      data: order,
    }));
    const collectionItems = collections.map<CustomerActivityListItem>((collection) => ({
      id: `collection-${collection.id}`,
      kind: "collection" as const,
      filterId:
        collection.action_type === "payment"
          ? ("late_payment" as const)
          : collection.action_type === "payout"
            ? ("payout" as const)
            : ("return_empties" as const),
      sortAt: collection.created_at || collection.effective_at || new Date().toISOString(),
      customerName: customersById.get(collection.customer_id)?.name ?? collection.customer_id,
      data: collection,
    }));
    const adjustmentItems = (customerAdjustmentsQuery.data ?? []).map<CustomerActivityListItem>((adjustment) => ({
      id: `adjustment-${adjustment.id}`,
      kind: "adjustment" as const,
      filterId: "adjustment" as const,
      sortAt: adjustment.created_at || adjustment.effective_at || new Date().toISOString(),
      customerName: customersById.get(adjustment.customer_id)?.name ?? adjustment.customer_id,
      data: adjustment,
    }));

    return [...orderItems, ...collectionItems, ...adjustmentItems].sort(
      (left, right) => toSafeTime(right.sortAt) - toSafeTime(left.sortAt)
    );
  }, [collections, customerAdjustmentsQuery.data, customersById, orders, toSafeTime]);
  const filteredInventoryItems = useMemo(
    () =>
      inventoryActivity.items.filter((entry) => {
        if (entry.kind !== "refill") return true;
        const data = entry.data;
        return data.buy12 || data.buy48 || data.return12 || data.return48;
      }),
    [inventoryActivity.items]
  );
  const companyActivityItems = useMemo<CompanyActivityListItem[]>(() => {
    const refillItems = filteredInventoryItems
      .filter((entry): entry is Extract<InventoryActivityItem, { kind: "refill" }> => entry.kind === "refill")
      .map((entry) => ({
        id: `refill-${entry.data.refill_id}`,
        kind: "refill" as const,
        sortAt: entry.created_at,
        is_deleted: entry.is_deleted,
        data: entry.data,
      }));
    const companyPaymentItems = (dayReportQuery.data?.events ?? [])
      .filter((event) => event.event_type === "company_payment")
      .map((event) => ({
        id: `company-payment-${event.source_id ?? event.effective_at}`,
        kind: "company_payment" as const,
        sortAt: event.effective_at,
        is_deleted: false as const,
        data: event,
      }));

    return [...refillItems, ...companyPaymentItems].sort(
      (left, right) => toSafeTime(right.sortAt) - toSafeTime(left.sortAt)
    );
  }, [dayReportQuery.data?.events, filteredInventoryItems, toSafeTime]);
  const ledgerAdjustmentItems = useMemo(
    () =>
      filteredInventoryItems.filter(
        (
          entry
        ): entry is Extract<
          InventoryActivityItem,
          { kind: "inventory_adjustment" } | { kind: "cash_adjustment" }
        > => entry.kind === "inventory_adjustment" || entry.kind === "cash_adjustment"
      ),
    [filteredInventoryItems]
  );
  const expenses = useMemo(() => {
    const rows = expensesQuery.data ?? [];
    return [...rows].sort((a, b) => {
      const aTime = new Date(a.created_at ?? a.date).getTime();
      const bTime = new Date(b.created_at ?? b.date).getTime();
      return bTime - aTime;
    });
  }, [expensesQuery.data]);
  const bankDeposits = useMemo(() => {
    const rows = bankDepositsQuery.data ?? [];
    return [...rows].sort((a, b) => toSafeTime(b.happened_at) - toSafeTime(a.happened_at));
  }, [bankDepositsQuery.data, toSafeTime]);
  const expenseCategoryOptions = useMemo(
    () => [
      { id: "all_categories" as const, label: "All categories" },
      ...Array.from(new Set(expenses.map((item) => item.expense_type).filter(Boolean)))
        .sort((left, right) => left.localeCompare(right))
        .map((category) => ({ id: category, label: category })),
    ],
    [expenses]
  );
  const deferredCustomerSearch = useDeferredValue(customerSearch.trim().toLowerCase());
  const filteredCustomerActivityItems = useMemo(
    () =>
      customerActivityItems.filter((item) => {
        if (customerActivityFilter !== "all" && item.filterId !== customerActivityFilter) {
          return false;
        }
        if (!deferredCustomerSearch) {
          return true;
        }
        return item.customerName.toLowerCase().includes(deferredCustomerSearch);
      }),
    [customerActivityFilter, customerActivityItems, deferredCustomerSearch]
  );
  const filteredCompanyActivityItems = useMemo(
    () =>
      companyActivityItems.filter((entry) => {
        if (companyActivityFilter === "all") {
          return true;
        }
        if (entry.kind === "company_payment") {
          return companyActivityFilter === "company_payment";
        }
        const refill = entry.data;
        const totalBuys = Number(refill.buy12 ?? 0) + Number(refill.buy48 ?? 0);
        const totalReturns = Number(refill.return12 ?? 0) + Number(refill.return48 ?? 0);
        if (companyActivityFilter === "buy_full") {
          return totalBuys > 0 && totalReturns === 0;
        }
        if (companyActivityFilter === "refill") {
          return totalReturns > 0 || (totalBuys > 0 && totalReturns > 0);
        }
        return false;
      }),
    [companyActivityFilter, companyActivityItems]
  );
  const expenseListItems = useMemo<ExpenseListItem[]>(() => {
    const expenseItems = expenses.map<ExpenseListItem>((item) => ({
      id: `expense-${item.id}`,
      kind: "expense" as const,
      sortAt: item.created_at ?? item.date,
      data: item,
    }));
    const bankTransferItems = bankDeposits.map<ExpenseListItem>((item) => ({
      id: `bank-deposit-${item.id}`,
      kind: "bank_transfer" as const,
      direction: item.direction,
      sortAt: item.happened_at,
      data: item,
    }));

    return [...expenseItems, ...bankTransferItems].sort(
      (left, right) => toSafeTime(right.sortAt) - toSafeTime(left.sortAt)
    );
  }, [bankDeposits, expenses, toSafeTime]);
  const filteredExpenseItems = useMemo(
    () =>
      expenseListItems.filter((item) => {
        if (expensePrimaryFilter === "expense" && item.kind !== "expense") {
          return false;
        }
        if (expensePrimaryFilter === "wallet_to_bank") {
          return item.kind === "bank_transfer" && item.direction === "wallet_to_bank";
        }
        if (expensePrimaryFilter === "bank_to_wallet") {
          return item.kind === "bank_transfer" && item.direction === "bank_to_wallet";
        }
        if (
          item.kind === "expense" &&
          expensePrimaryFilter === "expense" &&
          expenseCategoryFilter !== "all_categories"
        ) {
          return item.data.expense_type === expenseCategoryFilter;
        }
        return true;
      }),
    [expenseCategoryFilter, expenseListItems, expensePrimaryFilter]
  );
  const filteredLedgerAdjustmentItems = useMemo(
    () =>
      ledgerAdjustmentItems.filter((entry) => {
        if (ledgerActivityFilter === "all") {
          return true;
        }
        return entry.kind === ledgerActivityFilter;
      }),
    [ledgerActivityFilter, ledgerAdjustmentItems]
  );
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
    const latestByGas = priceSettingsQuery.data.reduce<Record<GasType, PriceSetting>>(
      (acc, entry) => {
        const existing = acc[entry.gas_type];
        if (
          !existing ||
          new Date(entry.effective_from).getTime() > new Date(existing.effective_from).getTime()
        ) {
          acc[entry.gas_type] = entry;
        }
        return acc;
      },
      {} as Record<GasType, PriceSetting>
    );
    setLastSavedPrices((prev) => {
      const nextSaved = createDefaultPriceInputs();
      gasTypes.forEach((gas) => {
        const combo = latestByGas[gas];
        if (combo) {
          nextSaved[gas] = {
            selling: combo.selling_price.toString(),
            buying: combo.buying_price?.toString() ?? "",
            selling_iron: combo.selling_iron_price?.toString() ?? "",
            buying_iron: combo.buying_iron_price?.toString() ?? "",
          };
        } else {
          nextSaved[gas] = prev[gas] ?? {
            selling: "",
            buying: "",
            selling_iron: "",
            buying_iron: "",
          };
        }
      });
      return nextSaved;
    });
    setPriceInputs((prev) => {
      const dirtyCombos = dirtyPriceCombosRef.current;
      const next = createDefaultPriceInputs();
      gasTypes.forEach((gas) => {
        const combo = latestByGas[gas];
        const comboKey = gas;
        const previousValue = prev[gas] ?? {
          selling: "",
          buying: "",
          selling_iron: "",
          buying_iron: "",
        };
        if (dirtyCombos.has(comboKey)) {
          next[gas] = { ...previousValue };
        } else if (combo) {
          next[gas] = {
            selling: combo.selling_price.toString(),
            buying: combo.buying_price?.toString() ?? "",
            selling_iron: combo.selling_iron_price?.toString() ?? "",
            buying_iron: combo.buying_iron_price?.toString() ?? "",
          };
        } else {
          next[gas] = { ...previousValue };
        }
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
    if (expensePrimaryFilter !== "expense" && expenseCategoryFilter !== "all_categories") {
      setExpenseCategoryFilter("all_categories");
    }
  }, [expenseCategoryFilter, expensePrimaryFilter]);

  useEffect(() => {
    const openPrices = Array.isArray(addParams.prices) ? addParams.prices[0] : addParams.prices;
    if (openPrices === "1") {
      setPriceModalOpen(true);
    }
  }, [addParams.prices]);

  useEffect(() => {
    const openParam = Array.isArray(addParams.open) ? addParams.open[0] : addParams.open;
    if (!openParam) return;
    const openPrices = Array.isArray(addParams.prices) ? addParams.prices[0] : addParams.prices;
    router.replace({
      pathname: "/(tabs)/add",
      params: openPrices ? { prices: openPrices } : {},
    });
    setMode("ledger_adjustments");
    if (openParam === "adjust-inventory") {
      router.push({ pathname: "/inventory/new", params: { section: "ledger", tab: "inventory" } });
    } else if (openParam === "adjust-cash") {
      router.push({ pathname: "/inventory/new", params: { section: "ledger", tab: "cash" } });
    }
  }, [addParams.open, addParams.prices]);

  useFocusEffect(
    useCallback(() => {
      ordersQuery.refetch();
      collectionsQuery.refetch();
      customersQuery.refetch();
      if (isCustomerActivities) {
        customerAdjustmentsQuery.refetch();
      }
      if (isExpenses) {
        expensesQuery.refetch();
        bankDepositsQuery.refetch();
      }
    }, [
      bankDepositsQuery,
      collectionsQuery,
      customerAdjustmentsQuery,
      customersQuery,
      expensesQuery,
      isCustomerActivities,
      isExpenses,
      ordersQuery,
    ])
  );
  useFocusEffect(
    useCallback(() => {
      if (isCompanyActivities || isLedgerAdjustments) {
        inventoryActivity.refillsQuery.refetch();
        inventoryActivity.inventoryAdjustmentsQuery.refetch();
        inventoryActivity.cashAdjustmentsQuery.refetch();
      }
    }, [
      isCompanyActivities,
      isLedgerAdjustments,
      inventoryActivity.refillsQuery,
      inventoryActivity.inventoryAdjustmentsQuery,
      inventoryActivity.cashAdjustmentsQuery,
    ])
  );
  useFocusEffect(
    useCallback(() => {
      const shortcut = consumeAddShortcut();
      if (shortcut?.mode === "inventory") {
        setMode("company_activities");
        router.push({ pathname: "/inventory/new", params: { section: "company", tab: "refill" } });
      }
    }, [])
  );

  const confirmDeleteOrder = (id: string) => {
    console.log("[add] delete order pressed", id);
    setConfirm({ type: "order", id });
  };

  const confirmDeleteCollection = (id: string) => {
    console.log("[add] delete collection pressed", id);
    setConfirm({ type: "collection", id });
  };

  const openCollectionEdit = (collection: any) => {
    setCollectionEditTarget(collection);
    setCollectionAmount(
      collection.action_type !== "return" ? String(collection.amount_money ?? "") : ""
    );
    setCollectionQty12(collection.action_type === "return" ? String(collection.qty_12kg ?? "") : "");
    setCollectionQty48(collection.action_type === "return" ? String(collection.qty_48kg ?? "") : "");
    setCollectionNote(collection.note ?? "");
    setCollectionEditOpen(true);
  };

  const handleSaveCollectionEdit = async () => {
    if (!collectionEditTarget) return;
    const actionType = collectionEditTarget.action_type;
    if (actionType === "payment" || actionType === "payout") {
      const amount = Number(collectionAmount) || 0;
      if (amount <= 0) {
        Alert.alert("Missing amount", "Enter a payment amount.");
        return;
      }
      await updateCollection.mutateAsync({
        id: collectionEditTarget.id,
        payload: { action_type: actionType, amount_money: amount, note: collectionNote || undefined },
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
    field: "selling" | "buying" | "selling_iron" | "buying_iron",
    value: string
  ) => {
    const comboKey = gas;
    setPriceInputs((prev) => {
      const nextValue = {
        selling: field === "selling" ? value : prev[gas]?.selling ?? "",
        buying: field === "buying" ? value : prev[gas]?.buying ?? "",
        selling_iron: field === "selling_iron" ? value : prev[gas]?.selling_iron ?? "",
        buying_iron: field === "buying_iron" ? value : prev[gas]?.buying_iron ?? "",
      };
      const next: PriceInputs = {
        ...prev,
        [gas]: nextValue,
      };
      const baseline = lastSavedPrices[gas] ?? {
        selling: "",
        buying: "",
        selling_iron: "",
        buying_iron: "",
      };
      const matchesBaseline =
        (nextValue.selling || "") === (baseline.selling || "") &&
        (nextValue.buying || "") === (baseline.buying || "") &&
        (nextValue.selling_iron || "") === (baseline.selling_iron || "") &&
        (nextValue.buying_iron || "") === (baseline.buying_iron || "");
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
        const gas = comboKey as GasType;
        const { selling, buying, selling_iron, buying_iron } = priceInputs[gas];
        const savedPrice = await savePrice.mutateAsync({
          gas_type: gas,
          selling_price: Number(selling) || 0,
          buying_price: buying ? Number(buying) : undefined,
          selling_iron_price: selling_iron ? Number(selling_iron) : undefined,
          buying_iron_price: buying_iron ? Number(buying_iron) : undefined,
        });
        dirtyPriceCombosRef.current.delete(comboKey);
        const normalized = {
          selling: savedPrice.selling_price.toString(),
          buying: savedPrice.buying_price?.toString() ?? "",
          selling_iron: savedPrice.selling_iron_price?.toString() ?? "",
          buying_iron: savedPrice.buying_iron_price?.toString() ?? "",
        };
        setLastSavedPrices((prev) => ({
          ...prev,
          [gas]: normalized,
        }));
        setPriceInputs((prev) => ({
          ...prev,
          [gas]: normalized,
        }));
      }
      setPriceModalOpen(false);
    } finally {
      setSavingPrices(false);
    }
  };
  const canSavePrices = dirtyPriceCombosRef.current.size > 0;

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
    Alert.alert("Remove adjustment?", "This will delete the wallet adjustment.", [
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

  const handleDeleteExpense = (entry: Expense) => {
    Alert.alert("Remove expense?", "This will delete the expense entry.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteExpense.mutateAsync({ id: entry.id, date: entry.date });
            expensesQuery.refetch();
          } catch (error) {
            console.error("[add] delete expense failed", error);
            Alert.alert("Failed to delete", "Try again later.");
          }
        },
      },
    ]);
  };

  const handleDeleteBankTransfer = (entry: BankDeposit) => {
    const date = (entry.happened_at ?? "").slice(0, 10) || todayDate;
    Alert.alert("Remove transfer?", "This will delete the wallet/bank transfer entry.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteBankDeposit.mutateAsync({ id: entry.id, date });
            bankDepositsQuery.refetch();
          } catch (error) {
            console.error("[add] delete bank transfer failed", error);
            Alert.alert("Failed to delete", "Try again later.");
          }
        },
      },
    ]);
  };

  const handleRetryCustomerActivities = () => {
    ordersQuery.refetch();
    collectionsQuery.refetch();
    customerAdjustmentsQuery.refetch();
  };

  const handleRetryExpenses = () => {
    expensesQuery.refetch();
    bankDepositsQuery.refetch();
  };

  const handlePrimaryAction = () => {
    if (isCustomerActivities) {
      router.push("/orders/new");
      return;
    }
    if (isCompanyActivities) {
      router.push({ pathname: "/inventory/new", params: { section: "company", tab: "refill" } });
      return;
    }
    if (isExpenses) {
      router.push("/expenses/new");
      return;
    }
    router.push({ pathname: "/inventory/new", params: { section: "ledger", tab: "inventory" } });
  };

  const customerActivityEmptyMessage =
    customerActivityFilter === "all" && !deferredCustomerSearch
      ? "No customer activities yet."
      : "No customer activities match these filters.";
  const expenseEmptyMessage =
    expensePrimaryFilter === "all" && expenseCategoryFilter === "all_categories"
      ? "No expenses yet."
      : "No expenses match these filters.";

  const primaryCtaLabel = isCustomerActivities
    ? "+ New Customer Activity"
    : isCompanyActivities
      ? "+ New Company Activity"
      : isExpenses
        ? "+ Add Expense"
        : "+ New Ledger Adjustment";

  return (
    <View style={styles.container}>
      <View style={styles.segment}>
        <Pressable
          onPress={() => setMode("customer_activities")}
          style={[styles.segmentBtn, isCustomerActivities && styles.segmentActive]}
        >
          <Text style={[styles.segmentText, isCustomerActivities && styles.segmentTextActive]}>
            Customer{"\n"}Activities
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setMode("company_activities")}
          style={[styles.segmentBtn, isCompanyActivities && styles.segmentActive]}
        >
          <Text style={[styles.segmentText, isCompanyActivities && styles.segmentTextActive]}>
            Company{"\n"}Activities
          </Text>
        </Pressable>
        <Pressable onPress={() => setMode("expenses")} style={[styles.segmentBtn, isExpenses && styles.segmentActive]}>
          <Text style={[styles.segmentText, isExpenses && styles.segmentTextActive]}>Expenses</Text>
        </Pressable>
        <Pressable
          onPress={() => setMode("ledger_adjustments")}
          style={[styles.segmentBtn, isLedgerAdjustments && styles.segmentActive]}
        >
          <Text style={[styles.segmentText, isLedgerAdjustments && styles.segmentTextActive]}>
            Ledger{"\n"}Adjustments
          </Text>
        </Pressable>
      </View>

      <Pressable onPress={handlePrimaryAction} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
        <Text style={styles.primaryText}>{primaryCtaLabel}</Text>
      </Pressable>

      {isCustomerActivities ? (
        <>
          <NewSectionSearch
            value={customerSearch}
            onChangeText={setCustomerSearch}
            placeholder="Search customer by name"
          />
          <FilterChipRow
            options={customerActivityFilters}
            value={customerActivityFilter}
            onChange={setCustomerActivityFilter}
          />
        </>
      ) : null}

      {isCompanyActivities ? (
        <>
          <FilterChipRow
            options={companyActivityFilters}
            value={companyActivityFilter}
            onChange={setCompanyActivityFilter}
          />
          <CompanyBalancesSection
            companySummary={companySummary}
            companyBalancesReady={companyBalancesQuery.isSuccess}
            formatMoney={(value) => Number(value || 0).toFixed(0)}
            formatCount={(value) => Number(value || 0).toFixed(0)}
          />
        </>
      ) : null}

      {isExpenses ? (
        <>
          <FilterChipRow
            options={expensePrimaryFilters}
            value={expensePrimaryFilter}
            onChange={setExpensePrimaryFilter}
          />
          {expensePrimaryFilter === "expense" ? (
            <FilterChipRow
              options={expenseCategoryOptions}
              value={expenseCategoryFilter}
              onChange={setExpenseCategoryFilter}
              contentContainerStyle={styles.secondaryFilterRow}
            />
          ) : null}
        </>
      ) : null}

      {isLedgerAdjustments ? (
        <FilterChipRow
          options={ledgerActivityFilters}
          value={ledgerActivityFilter}
          onChange={setLedgerActivityFilter}
        />
      ) : null}

      {isCustomerActivities ? (
        <>
          {ordersQuery.isLoading || collectionsQuery.isLoading || customerAdjustmentsQuery.isLoading ? (
            <Text style={styles.meta}>Loading...</Text>
          ) : null}
          {ordersQuery.error || collectionsQuery.error || customerAdjustmentsQuery.error ? (
            <View style={styles.errorBox}>
              <Text style={styles.error}>Failed to load customer activities.</Text>
              <Pressable style={styles.retryBtn} onPress={handleRetryCustomerActivities}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
          <FlatList
            key="orders-list"
            data={filteredCustomerActivityItems}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ gap: 10 }}
            ListEmptyComponent={
              !ordersQuery.isLoading && !collectionsQuery.isLoading && !customerAdjustmentsQuery.isLoading ? (
                <Text style={styles.meta}>{customerActivityEmptyMessage}</Text>
              ) : null
            }
            renderItem={({ item }) => {
              if (item.kind === "adjustment") {
                const adjustment = item.data;
                const money = Number(adjustment.amount_money ?? 0);
                const qty12 = Number(adjustment.count_12kg ?? 0);
                const qty48 = Number(adjustment.count_48kg ?? 0);
                const summaryParts = [
                  money !== 0 ? `Money ${money > 0 ? "+" : ""}${money.toFixed(0)}` : null,
                  qty12 !== 0 ? `12kg ${qty12 > 0 ? "+" : ""}${qty12}` : null,
                  qty48 !== 0 ? `48kg ${qty48 > 0 ? "+" : ""}${qty48}` : null,
                ].filter(Boolean);
                return (
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={styles.titleBlock}>
                        <Text style={styles.name}>{item.customerName}</Text>
                        {adjustment.reason ? <Text style={styles.note}>{adjustment.reason}</Text> : null}
                      </View>
                      <View style={styles.headerRight}>
                        <Text style={styles.time}>{formatDateTime(adjustment.created_at ?? adjustment.effective_at)}</Text>
                      </View>
                    </View>
                    <View style={styles.infoRow}>
                      <View style={styles.leftInfo}>
                        <Text style={styles.metaLine}>
                          {summaryParts.length > 0 ? summaryParts.join(" | ") : "Manual adjustment"}
                        </Text>
                      </View>
                      <View style={styles.badgeStack}>
                        <Text style={[styles.statusBadge, styles.collectionBadge]}>Adjustment</Text>
                      </View>
                    </View>
                  </View>
                );
              }

              if (item.kind === "collection") {
                const collection = item.data;
                const customer = customersById.get(collection.customer_id);
                const createdAt = new Date(
                  normalizeIso(collection.created_at ?? collection.effective_at ?? "")
                );
                const system = systemsQuery.data?.find((s) => s.id === collection.system_id);
                const label =
                  collection.action_type === "payment"
                    ? "Receive"
                    : collection.action_type === "payout"
                      ? "Payout"
                      : "ReturnEmp";
                const amount = Number(collection.amount_money ?? 0);
                const qty12 = Number(collection.qty_12kg ?? 0);
                const qty48 = Number(collection.qty_48kg ?? 0);
                return (
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={styles.titleBlock}>
                        <Text style={styles.name}>{customer?.name ?? collection.id}</Text>
                        {customer?.note ? <Text style={styles.customerNote}>{customer.note}</Text> : null}
                        {system ? <Text style={styles.metaLine}>{system.name}</Text> : null}
                        {collection.note ? <Text style={styles.note}>{collection.note}</Text> : null}
                      </View>
                      <View style={styles.headerRight}>
                        <Text style={styles.time}>{formatDateTimeLocale(createdAt)}</Text>
                      </View>
                    </View>
                    <View style={styles.infoRow}>
                      <View style={styles.leftInfo}>
                        {collection.action_type !== "return" ? (
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
              const unpaid = calcMoneyUiResult(order.price_total, order.paid_amount ?? 0);
              const system = systemsQuery.data?.find((s) => s.id === order.system_id);
              const customer = customersById.get(order.customer_id);
              const createdAt = new Date(normalizeIso(order.created_at));
              const deliveredAt = new Date(normalizeIso(order.delivered_at));
              const outstandingCyl = Math.max(
                0,
                calcCustomerCylinderDelta(
                  order.order_mode ?? "replacement",
                  order.cylinders_installed ?? 0,
                  order.cylinders_received ?? 0
                )
              );
              const fullyReturned = outstandingCyl === 0;
              const returnedLabel = fullyReturned
                ? "Returned"
                : `Unreturned ${outstandingCyl} x ${order.gas_type}`;
              return (
                <Pressable onPress={() => router.push(`/orders/${order.id}`)} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
                  <View style={styles.cardHeader}>
                    <View style={styles.titleBlock}>
                      <Text style={styles.name}>{customer?.name ?? order.id}</Text>
                      {customer?.note ? <Text style={styles.customerNote}>{customer.note}</Text> : null}
                      {order.note ? <Text style={styles.note}>{order.note}</Text> : null}
                    </View>
                    <View style={styles.headerRight}>
                      <Text style={styles.time}>{formatDateTimeLocale(createdAt)}</Text>
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
                        <Text style={[styles.pill, styles.pillPrimary]}>Paid {(order.paid_amount ?? 0).toFixed(0)}</Text>
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
                    <Text style={styles.time}>Delivered {formatDateTimeLocale(deliveredAt)}</Text>
                  </View>
                </Pressable>
              );
            }}
          />
        </>
      ) : isExpenses ? (
        <View style={styles.formCard}>
          {expensesQuery.isLoading || bankDepositsQuery.isLoading ? <Text style={styles.meta}>Loading...</Text> : null}
          {expensesQuery.error || bankDepositsQuery.error ? (
            <View style={styles.errorBox}>
              <Text style={styles.error}>Failed to load expenses.</Text>
              <Pressable style={styles.retryBtn} onPress={handleRetryExpenses}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
          {filteredExpenseItems.length === 0 && !expensesQuery.isLoading && !bankDepositsQuery.isLoading ? (
            <Text style={styles.meta}>{expenseEmptyMessage}</Text>
          ) : (
            <View style={styles.listBlock}>
              {filteredExpenseItems.map((item) => {
                if (item.kind === "bank_transfer") {
                  const label = item.direction === "wallet_to_bank" ? "Wallet to Bank" : "Bank to Wallet";
                  return (
                    <View key={item.id} style={styles.card}>
                      <View style={styles.cardHeader}>
                        <View style={styles.titleBlock}>
                          <View style={styles.pillRow}>
                            <Text style={[styles.pill, styles.pillPrimary]}>{label}</Text>
                          </View>
                          <Text style={styles.metaLine}>{formatDateTime(item.data.happened_at)}</Text>
                          {item.data.note ? <Text style={styles.note}>{item.data.note}</Text> : null}
                        </View>
                        <View style={styles.headerRight}>
                          <Text style={styles.expenseAmount}>{Math.abs(item.data.amount)}</Text>
                          <Pressable
                            accessibilityLabel="Remove bank transfer"
                            onPress={() => handleDeleteBankTransfer(item.data)}
                            style={styles.iconBtn}
                          >
                            <Ionicons name="trash" size={16} color="#b00020" />
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  );
                }

                return (
                  <View key={item.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={styles.titleBlock}>
                        <View style={styles.pillRow}>
                          <Text style={[styles.pill, styles.pillPrimary]}>{item.data.expense_type}</Text>
                        </View>
                        <Text style={styles.metaLine}>{formatDateTime(item.data.created_at ?? item.data.date)}</Text>
                        {item.data.note ? <Text style={styles.note}>{item.data.note}</Text> : null}
                      </View>
                      <View style={styles.headerRight}>
                        <Text style={styles.expenseAmount}>{item.data.amount}</Text>
                        <Pressable
                          accessibilityLabel="Remove expense"
                          onPress={() => handleDeleteExpense(item.data)}
                          style={styles.iconBtn}
                        >
                          <Ionicons name="trash" size={16} color="#b00020" />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      ) : isCompanyActivities ? (
        <View style={styles.formCard}>
          <View style={styles.listBlock}>
            {filteredCompanyActivityItems.map((entry) => {
              if (entry.kind === "company_payment") {
                const amount = Number(entry.data.total_cost ?? 0);
                return (
                  <View key={entry.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={styles.titleBlock}>
                        <View style={styles.inventoryLabelRow}>
                          <View style={styles.inventoryTypeBadge}>
                            <Text style={styles.inventoryTypeBadgeText}>Company Payment</Text>
                          </View>
                        </View>
                        <Text style={styles.metaLine}>{formatDateTime(entry.data.effective_at)}</Text>
                        {entry.data.reason ? <Text style={styles.note}>{entry.data.reason}</Text> : null}
                      </View>
                      <View style={styles.headerRight}>
                        <Text style={styles.expenseAmount}>{amount.toFixed(0)}</Text>
                      </View>
                    </View>
                  </View>
                );
              }

              const refill = entry.data;
              const isDeleted = entry.is_deleted;
              return (
                <View key={`refill_${refill.refill_id}`} style={[styles.card, isDeleted && styles.cardMuted]}>
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
                          router.push({
                            pathname: "/inventory/new",
                            params: { section: "company", tab: "refill", refillId: refill.refill_id },
                          });
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
            })}
            {filteredCompanyActivityItems.length === 0 && <Text style={styles.meta}>No company activities match these filters.</Text>}
          </View>
        </View>
      ) : (
        <View style={styles.formCard}>
          <View style={styles.listBlock}>
            {filteredLedgerAdjustmentItems.map((entry) => {
              if (entry.kind === "inventory_adjustment") {
                const adjustment = entry.data;
                const isDeleted = entry.is_deleted;
                return (
                  <View key={`inv_adj_${adjustment.id}`} style={[styles.card, isDeleted && styles.cardMuted]}>
                    <View style={styles.cardHeader}>
                      <View style={styles.titleBlock}>
                        <View style={styles.inventoryLabelRow}>
                          <View style={styles.inventoryTypeBadge}>
                            <Text style={styles.inventoryTypeBadgeText}>Inventory Adjustment</Text>
                          </View>
                          {isDeleted && (
                            <View style={styles.inventoryBadge}>
                              <Text style={styles.inventoryBadgeText}>Deleted</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.metaLine}>{formatDateTime(adjustment.effective_at)}</Text>
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
                            router.push({
                              pathname: "/inventory/new",
                              params: { section: "ledger", tab: "inventory", adjustId: adjustment.id },
                            });
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
                <View key={`cash_adj_${adjustment.id}`} style={[styles.card, isDeleted && styles.cardMuted]}>
                  <View style={styles.cardHeader}>
                    <View style={styles.titleBlock}>
                      <View style={styles.inventoryLabelRow}>
                        <View style={styles.inventoryTypeBadge}>
                          <Text style={styles.inventoryTypeBadgeText}>Wallet Adjustment</Text>
                        </View>
                        {isDeleted && (
                          <View style={styles.inventoryBadge}>
                            <Text style={styles.inventoryBadgeText}>Deleted</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.metaLine}>{formatDateTime(adjustment.effective_at)}</Text>
                      <Text style={styles.metaLine}>Amount: {adjustment.delta_cash}</Text>
                      {adjustment.reason ? <Text style={styles.note}>{adjustment.reason}</Text> : null}
                    </View>
                    <View style={styles.actionsCompact}>
                      <Pressable
                        accessibilityLabel="Update wallet adjustment"
                        onPress={() => {
                          if (isDeleted) return;
                          router.push({
                            pathname: "/inventory/new",
                            params: { section: "ledger", tab: "cash", cashId: adjustment.id },
                          });
                        }}
                        style={[styles.iconBtn, isDeleted && styles.iconBtnDisabled]}
                      >
                        <Ionicons name="build-outline" size={16} color={isDeleted ? "#94a3b8" : "#0a7ea4"} />
                      </Pressable>
                      <Pressable
                        accessibilityLabel="Remove wallet adjustment"
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
            {filteredLedgerAdjustmentItems.length === 0 && <Text style={styles.meta}>No ledger adjustments match these filters.</Text>}
          </View>
        </View>
      )}

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
            {collectionEditTarget?.action_type !== "return" ? (
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
                : "Delete collection?"}
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

    </View>
  );
}

export function AddCustomersSection({
  searchQuery = "",
  topFilter = "all",
  subFilter = "all",
}: {
  searchQuery?: string;
  topFilter?: CustomerListTopFilter;
  subFilter?: CustomerListSubFilter;
}) {
  const customersQuery = useCustomers();
  const ordersQuery = useOrders();
  const systemsQuery = useSystems();
  const deleteCustomer = useDeleteCustomer();
  const customers = customersQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const [confirmCustomerId, setConfirmCustomerId] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const systemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (systemsQuery.data ?? []).forEach((system) => {
      counts[system.customer_id] = (counts[system.customer_id] ?? 0) + 1;
    });
    return counts;
  }, [systemsQuery.data]);

  const systemsByCustomer = useMemo(() => {
    const map = new Map<string, typeof systemsQuery.data>();
    (systemsQuery.data ?? []).forEach((system) => {
      const list = map.get(system.customer_id) ?? [];
      map.set(system.customer_id, [...list, system]);
    });
    return map;
  }, [systemsQuery.data]);

  const todayKey = toDateKey(new Date());
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());

  const filteredCustomers = useMemo(() => {
    const rows = customers.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return rows.filter((customer) => {
      if (deferredSearchQuery) {
        const haystack = [
          customer.name,
          customer.phone,
          customer.note,
          customer.address,
        ]
          .map((value) => (value ?? "").toLowerCase())
          .join("\n");
        if (!haystack.includes(deferredSearchQuery)) {
          return false;
        }
      }

      const money = Number(customer.money_balance ?? 0);
      const cyl12 = Number(customer.cylinder_balance_12kg ?? 0);
      const cyl48 = Number(customer.cylinder_balance_48kg ?? 0);
      const systems = systemsByCustomer.get(customer.id) ?? [];
      const hasActive = systems.some((system) => system.is_active);
      const requiresCheck = systems.some((system) => system.requires_security_check);
      const inactiveSystems = systems.length === 0 || !hasActive;

      switch (topFilter) {
        case "money":
          if (subFilter === "debt") return money > 0;
          if (subFilter === "credit") return money < 0;
          return true;
        case "cyl12":
          if (subFilter === "debt") return cyl12 > 0;
          if (subFilter === "credit") return cyl12 < 0;
          return true;
        case "cyl48":
          if (subFilter === "debt") return cyl48 > 0;
          if (subFilter === "credit") return cyl48 < 0;
          return true;
        case "systems":
          if (subFilter === "active") return hasActive;
          if (subFilter === "inactive") return inactiveSystems;
          return true;
        case "security_check":
          if (subFilter === "required") return requiresCheck;
          if (subFilter === "not_required") return !requiresCheck;
          return true;
        default:
          return true;
      }
    });
  }, [customers, deferredSearchQuery, subFilter, systemsByCustomer, topFilter]);

  const customerListEmptyMessage =
    deferredSearchQuery || topFilter !== "all" || subFilter !== "all"
      ? "No customers match these filters."
      : "No customers yet.";

  useFocusEffect(
    useCallback(() => {
      customersQuery.refetch();
      ordersQuery.refetch();
      systemsQuery.refetch();
    }, [customersQuery, ordersQuery, systemsQuery])
  );

  const confirmDeleteCustomer = (id: string) => {
    const customer = customers.find((entry) => entry.id === id);
    const orderCount = customer?.order_count ?? 0;
    const hasOrders = orderCount > 0 || orders.some((order) => order.customer_id === id);
    if (hasOrders) {
      setInfoMessage("You cannot delete this customer while they still have orders. Remove or reassign their orders first.");
      return;
    }
    setConfirmCustomerId(id);
  };

  return (
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
        data={filteredCustomers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 10, paddingTop: 6 }}
        ListEmptyComponent={!customersQuery.isLoading ? <Text style={styles.meta}>{customerListEmptyMessage}</Text> : null}
        renderItem={({ item }) => {
          const money = Number(item.money_balance ?? 0);
          const cyl12 = Number(item.cylinder_balance_12kg ?? 0);
          const cyl48 = Number(item.cylinder_balance_48kg ?? 0);
          const systems = systemsByCustomer.get(item.id) ?? [];
          const hasActive = systems.some((system) => system.is_active);
          const requiresCheck = systems.some((system) => system.requires_security_check);
          const noCheck = !requiresCheck;
          const dueCheck = systems.some(
            (system) => (system.next_security_check_at ?? "") !== "" && (system.next_security_check_at ?? "") <= todayKey
          );
          const futureCheck = systems.some(
            (system) => (system.next_security_check_at ?? "") !== "" && (system.next_security_check_at ?? "") > todayKey
          );
          const activeSystems = systems.filter((system) => system.is_active).length;
          const showMoney = topFilter === "all" || topFilter === "money";
          const show12 = topFilter === "all" || topFilter === "cyl12";
          const show48 = topFilter === "all" || topFilter === "cyl48";
          const showSystems = topFilter === "all" || topFilter === "systems";
          const showSecurity = topFilter === "all" || topFilter === "security_check";

          const moneyLabel =
            money > 0 ? `Debt ${money.toFixed(0)}` : money < 0 ? `Credit ${Math.abs(money).toFixed(0)}` : "Money 0";
          const cyl12Label =
            cyl12 > 0 ? `Missing ${Math.abs(cyl12)}x 12kg` : cyl12 < 0 ? `Credit ${Math.abs(cyl12)}x 12kg` : "12kg 0";
          const cyl48Label =
            cyl48 > 0 ? `Missing ${Math.abs(cyl48)}x 48kg` : cyl48 < 0 ? `Credit ${Math.abs(cyl48)}x 48kg` : "48kg 0";

          return (
            <Pressable
              onPress={() => router.push(`/customers/${item.id}`)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <View style={styles.cardHeader}>
                <View style={styles.titleBlock}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>
                    Address: {item.address ?? "-"} | Systems: {systemCounts[item.id] ?? 0}
                  </Text>
                  {item.phone ? <Text style={styles.metaLine}>Phone: {item.phone}</Text> : null}
                  {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
                  <View style={styles.pillRow}>
                    {showMoney ? <Text style={[styles.pill, styles.pillPrimary]}>{moneyLabel}</Text> : null}
                    {show12 ? (
                      <Text style={[styles.pill, cyl12 > 0 ? styles.pillWarn : styles.pillPrimary]}>{cyl12Label}</Text>
                    ) : null}
                    {show48 ? (
                      <Text style={[styles.pill, cyl48 > 0 ? styles.pillWarn : styles.pillPrimary]}>{cyl48Label}</Text>
                    ) : null}
                    {showSystems && activeSystems > 0 ? (
                      <Text style={[styles.pill, styles.pillPrimary]}>{`Active ${activeSystems}`}</Text>
                    ) : null}
                    {showSystems && !hasActive ? (
                      <Text style={[styles.pill, styles.pillMuted]}>Inactive</Text>
                    ) : null}
                    {showSecurity && requiresCheck ? (
                      <Text style={[styles.pill, styles.pillWarn]}>Needs check</Text>
                    ) : null}
                    {showSecurity && noCheck ? (
                      <Text style={[styles.pill, styles.pillMuted]}>No check</Text>
                    ) : null}
                    {showSecurity && dueCheck ? (
                      <Text style={[styles.pill, styles.pillWarn]}>Check due</Text>
                    ) : null}
                    {showSecurity && futureCheck ? (
                      <Text style={[styles.pill, styles.pillPrimary]}>Future check</Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.headerRight}>
                  <Text style={styles.time}>{formatDateTimeLocale(item.created_at)}</Text>
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
                      onPress={(event) => {
                        event.stopPropagation?.();
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
          );
        }}
      />

      <Modal transparent visible={!!confirmCustomerId} animationType="fade" onRequestClose={() => setConfirmCustomerId(null)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete customer?</Text>
            <Text style={styles.modalText}>This action cannot be undone in this mock data. Proceed?</Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={() => setConfirmCustomerId(null)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnDanger]}
                onPress={async () => {
                  if (!confirmCustomerId) return;
                  try {
                    await deleteCustomer.mutateAsync(confirmCustomerId);
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
                    setConfirmCustomerId(null);
                  }
                }}
              >
                <Text style={[styles.modalBtnText, styles.modalBtnTextDanger]}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
    </>
  );
}

export function AddCustomerEntryAction() {
  return (
    <Pressable onPress={() => router.push("/customers/new")} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
      <Text style={styles.primaryText}>+ New Customer</Text>
    </Pressable>
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
  modalHint: {
    marginTop: 6,
    fontSize: 11,
    color: "#64748b",
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
  segment: {
    flexDirection: "row",
    backgroundColor: "#e8eef1",
    borderRadius: 12,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
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
    fontSize: 11,
    lineHeight: 13,
    textAlign: "center",
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
  expenseScreen: {
    flex: 1,
    position: "relative",
    backgroundColor: "#f3f5f7",
  },
  expenseContent: {
    paddingBottom: 140,
    gap: 12,
  },
  walletCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    gap: 6,
  },
  walletRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  walletLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  walletValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
  walletWarning: {
    backgroundColor: "#fdecea",
    borderColor: "#f5c6cb",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  walletWarningText: {
    color: "#b00020",
    fontWeight: "700",
    fontSize: 12,
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
  expenseTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  expenseTypeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  expenseTypeCardActive: {
    backgroundColor: "#0a7ea4",
    borderColor: "#0a7ea4",
  },
  expenseTypeText: {
    fontWeight: "700",
    color: "#1f2937",
    fontSize: 12,
  },
  expenseTypeTextActive: {
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
  expenseAmountInput: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  walletTransition: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  walletTransitionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  walletTransitionValue: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0f172a",
  },
  expenseFooter: {
    paddingHorizontal: 0,
    paddingBottom: 10,
    paddingTop: 6,
    backgroundColor: "transparent",
  },
  expenseFooterPage: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 6,
    backgroundColor: "#f3f5f7",
  },
  expenseFooterRow: {
    flexDirection: "row",
    gap: 10,
  },
  expenseFooterPrimary: {
    flex: 1,
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  expenseFooterSecondary: {
    flex: 1,
    borderColor: "#cbd5e1",
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  expenseFooterPrimaryText: {
    color: "#fff",
    fontWeight: "700",
  },
  expenseFooterSecondaryText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  expenseFooterDisabled: {
    opacity: 0.6,
  },
  expensePageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  expenseTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0f172a",
  },
  walletSentence: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  modalCloseBtn: {
    padding: 6,
  },
  nowButton: {
    alignSelf: "stretch",
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#0a7ea4",
    alignItems: "center",
    justifyContent: "center",
  },
  nowButtonText: {
    color: "#fff",
    fontWeight: "700",
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
  pillWarn: {
    backgroundColor: "#fee2e2",
    color: "#b91c1c",
  },
  pillMuted: {
    backgroundColor: "#e2e8f0",
    color: "#1f2937",
  },
  secondaryFilterRow: {
    paddingTop: 0,
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
