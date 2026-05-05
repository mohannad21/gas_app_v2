import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, InputAccessoryView, Keyboard, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import FilterChipRow from "@/components/add/FilterChipRow";
import NewSectionSearch from "@/components/add/NewSectionSearch";
import CollectionEditModal from "@/components/add/CollectionEditModal";
import ActivityListSection from "@/components/add/ActivityListSection";
import {
  CustomerListSubFilter,
  CustomerListTopFilter,
} from "@/components/customers/customerListFilters";
import CompanyBalancesSection from "@/components/reports/CompanyBalancesSection";
import SlimActivityRow from "@/components/reports/SlimActivityRow";
import {
  bankDepositToEvent,
  cashAdjustmentToEvent,
  collectionToEvent,
  companyBalanceAdjustmentToEvent,
  companyPaymentToEvent,
  customerAdjustmentToEvent,
    expenseToEvent,
    getCompanyInventoryEditTab,
    inventoryAdjustmentToEvent,
    inventoryAdjustmentGroupToEvent,
    orderToEvent,
    refillSummaryToEvent,
  } from "@/lib/activityAdapter";
import { formatDisplayMoney, getCurrencySymbol } from "@/lib/money";
import { useBankDeposits, useDeleteBankDeposit } from "@/hooks/useBankDeposits";
import { useCashAdjustments, useDeleteCashAdjustment } from "@/hooks/useCash";
import { useAddEntryDeleteHandlers } from "@/hooks/useAddEntryDeleteHandlers";
import { useCompanyPayments, useDeleteCompanyPayment } from "@/hooks/useCompanyPayments";
import { useBalancesSummary } from "@/hooks/useBalancesSummary";
import { useCompanyBalanceAdjustments, useDeleteCompanyBalanceAdjustment } from "@/hooks/useCompanyBalances";
import {
  CUSTOMER_DELETE_BLOCKED_MESSAGE,
  isCustomerDeleteBlockedError,
  useAllCustomerAdjustments,
  useCustomers,
  useDeleteCustomer,
  useDeleteCustomerAdjustment,
} from "@/hooks/useCustomers";
import { useCollections, useDeleteCollection, useUpdateCollection } from "@/hooks/useCollections";
import { useDeleteOrder, useOrders } from "@/hooks/useOrders";
import { useDeleteExpense, useExpenses } from "@/hooks/useExpenses";
import {
  useInventoryAdjustments,
  useDeleteInventoryAdjustment,
  useDeleteRefill,
  useInventoryRefills,
} from "@/hooks/useInventory";
import { InventoryActivityItem } from "@/hooks/useInventoryActivity";
import { usePriceSettings, useSavePriceSetting } from "@/hooks/usePrices";
import { useSystems } from "@/hooks/useSystems";
import { useActivityFilters } from "@/hooks/useActivityFilters";
import { useCollectionEdit } from "@/hooks/useCollectionEdit";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { usePriceModal } from "@/hooks/usePriceModal";
import { consumeAddShortcut } from "@/lib/addShortcut";
import { formatDateTimeYMDHM, toDateKey } from "@/lib/date";
import {
  PriceInputs,
  createDefaultPriceInputs,
  PriceMatrixSection,
  gasTypes,
} from "@/components/PriceMatrix";
import { BankDeposit, CashAdjustment, CollectionEvent, CompanyBalanceAdjustment, CompanyPayment, CustomerAdjustment, Expense, GasType, InventoryAdjustment, Order, PriceSetting } from "@/types/domain";

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

type CompanyActivityFilter = "all" | "refill" | "company_payment" | "buy_full" | "adjustment";
type ExpensePrimaryFilter = "all" | "expense" | "wallet_to_bank" | "bank_to_wallet";
type ExpenseCategoryFilter = "all_categories" | string;
type LedgerActivityFilter = "all" | "inventory_adjustment" | "cash_adjustment";
type PriceSaveStatusTone = "success" | "warning" | "error";

type CustomerActivityListItem =
  | {
      id: string;
      kind: "order";
      filterId: Exclude<CustomerActivityFilter, "all" | "late_payment" | "return_empties" | "payout" | "adjustment">;
      sortAt: string;
      createdAt: string;
      customerName: string;
      data: Order;
    }
  | {
      id: string;
      kind: "collection";
      filterId: Exclude<CustomerActivityFilter, "all" | "replacement" | "sell_full" | "buy_empty" | "adjustment">;
      sortAt: string;
      createdAt: string;
      customerName: string;
      data: CollectionEvent;
    }
  | {
      id: string;
      kind: "adjustment";
      filterId: "adjustment";
      sortAt: string;
      createdAt: string;
      customerName: string;
      data: CustomerAdjustment;
    };

type ExpenseListItem =
  | {
      id: string;
      kind: "expense";
      sortAt: string;
      createdAt: string;
      data: Expense;
    }
  | {
      id: string;
      kind: "bank_transfer";
      direction: Exclude<ExpensePrimaryFilter, "all" | "expense">;
      sortAt: string;
      createdAt: string;
      data: BankDeposit;
    };

type CompanyActivityListItem =
  | {
      id: string;
      kind: "refill";
      sortAt: string;
      createdAt: string;
      is_deleted: boolean;
      data: Extract<InventoryActivityItem, { kind: "refill" }>["data"];
    }
  | {
      id: string;
      kind: "company_payment";
      sortAt: string;
      createdAt: string;
      is_deleted: boolean;
      data: CompanyPayment;
    }
  | {
      id: string;
      kind: "company_adjustment";
      sortAt: string;
      createdAt: string;
      is_deleted: boolean;
      data: CompanyBalanceAdjustment;
    };

type LedgerAdjustmentListItem =
  | {
      id: string;
      kind: "inventory_adjustment";
      sortAt: string;
      createdAt: string;
      is_deleted: boolean;
      data: InventoryAdjustment[];
      representative: InventoryAdjustment;
      isGrouped: boolean;
    }
  | {
      id: string;
      kind: "cash_adjustment";
      sortAt: string;
      createdAt: string;
      is_deleted: boolean;
      data: CashAdjustment;
    };

function formatPriceGasList(items: string[]) {
  return items.join(", ");
}

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
  { id: "adjustment", label: "Adjustment" },
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
  // Extract activity filters state into custom hook
  const {
    mode,
    setMode,
    customerActivityFilter,
    setCustomerActivityFilter,
    companyActivityFilter,
    setCompanyActivityFilter,
    expensePrimaryFilter,
    setExpensePrimaryFilter,
    expenseCategoryFilter,
    setExpenseCategoryFilter,
    ledgerActivityFilter,
    setLedgerActivityFilter,
  } = useActivityFilters();

  const [customerSearch, setCustomerSearch] = useState("");
  const isCustomerActivities = mode === "customer_activities";
  const isCompanyActivities = mode === "company_activities";
  const isExpenses = mode === "expenses";
  const isLedgerAdjustments = mode === "ledger_adjustments";

  // Extract delete confirm state into custom hook
  const { confirm, setConfirm, deletingIds, setDeletingIds, markDeleting, unmarkDeleting } = useDeleteConfirm();
  const ordersQuery = useOrders(false);
  const collectionsQuery = useCollections(false);
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
  // Extract collection edit state into custom hook
  const {
    collectionEditOpen,
    setCollectionEditOpen,
    collectionEditTarget,
    setCollectionEditTarget,
    collectionAmount,
    setCollectionAmount,
    collectionQty12,
    setCollectionQty12,
    collectionQty48,
    setCollectionQty48,
    collectionNote,
    setCollectionNote,
    resetCollectionForm,
  } = useCollectionEdit();
  const accessoryId = Platform.OS === "ios" ? "addAccessory" : undefined;
  const deleteRefill = useDeleteRefill();
  const deleteCompanyPayment = useDeleteCompanyPayment();
  const deleteInventoryAdjust = useDeleteInventoryAdjustment();
  const deleteCashAdjust = useDeleteCashAdjustment();
  const deleteExpense = useDeleteExpense();
  const deleteCustomerAdjust = useDeleteCustomerAdjustment();
  const deleteCompanyAdjust = useDeleteCompanyBalanceAdjustment();

const formatDateTime = (value?: string) => {
  if (!value) return "—";
  return formatDateTimeYMDHM(value);
};
  const getLocalDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const todayDate = getLocalDateString();
  const allInventoryAdjustmentsQuery = useInventoryAdjustments(undefined, false);
  const allCashAdjustmentsQuery = useCashAdjustments(undefined, false);
  const companyRefillsQuery = useInventoryRefills(false);
  const companyPaymentsQuery = useCompanyPayments({ enabled: isCompanyActivities });
  const companyAdjustmentsQuery = useCompanyBalanceAdjustments({ enabled: isCompanyActivities });
  const expensesQuery = useExpenses(undefined, { enabled: isExpenses, includeDeleted: false });
  const bankDepositsQuery = useBankDeposits(undefined, { enabled: isExpenses, includeDeleted: false });
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
  const compareChronology = useCallback(
    (
      left: { id?: string; sortAt?: string; createdAt?: string },
      right: { id?: string; sortAt?: string; createdAt?: string }
    ) => {
      const effectiveDiff = toSafeTime(right.sortAt) - toSafeTime(left.sortAt);
      if (effectiveDiff !== 0) return effectiveDiff;
      const createdDiff = toSafeTime(right.createdAt) - toSafeTime(left.createdAt);
      if (createdDiff !== 0) return createdDiff;
      return String(right.id ?? "").localeCompare(String(left.id ?? ""));
    },
    [toSafeTime]
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
      createdAt: order.created_at || order.delivered_at || "",
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
      createdAt: collection.created_at || collection.effective_at || "",
      customerName: customersById.get(collection.customer_id)?.name ?? collection.customer_id,
      data: collection,
    }));
    const adjustmentItems = (customerAdjustmentsQuery.data ?? [])
      .filter((adjustment) => !adjustment.is_deleted)
      .map<CustomerActivityListItem>((adjustment) => ({
        id: `adjustment-${adjustment.id}`,
        kind: "adjustment" as const,
        filterId: "adjustment" as const,
        sortAt: adjustment.created_at || adjustment.effective_at || new Date().toISOString(),
        createdAt: adjustment.created_at || adjustment.effective_at || "",
        customerName: customersById.get(adjustment.customer_id)?.name ?? adjustment.customer_id,
        data: adjustment,
      }));

    return [...orderItems, ...collectionItems, ...adjustmentItems].sort(compareChronology);
  }, [collections, compareChronology, customerAdjustmentsQuery.data, customersById, orders]);
  const companyActivityItems = useMemo<CompanyActivityListItem[]>(() => {
    const refillItems = (companyRefillsQuery.data ?? [])
      .filter((refill) => {
        const totalBuys =
          Number(refill.buy12 ?? 0) +
          Number(refill.buy48 ?? 0) +
          Number(refill.new12 ?? 0) +
          Number(refill.new48 ?? 0);
        const totalReturns = Number(refill.return12 ?? 0) + Number(refill.return48 ?? 0);
        return totalBuys > 0 || totalReturns > 0;
      })
      .map((refill) => ({
        id: `refill-${refill.refill_id}`,
        kind: "refill" as const,
        sortAt: refill.created_at ?? refill.effective_at,
        createdAt: refill.created_at ?? refill.effective_at,
        is_deleted: Boolean(refill.is_deleted),
        data: refill,
      }));
    const companyPaymentItems = (companyPaymentsQuery.data ?? []).map((payment) => ({
        id: `company-payment-${payment.id}`,
        kind: "company_payment" as const,
        sortAt: payment.created_at ?? payment.happened_at,
        createdAt: payment.created_at ?? payment.happened_at,
        is_deleted: Boolean(payment.is_deleted),
        data: payment,
      }));
    const companyAdjustmentItems = (companyAdjustmentsQuery.data ?? []).map((adjustment) => ({
      id: `company-adjustment-${adjustment.id}`,
      kind: "company_adjustment" as const,
      sortAt: adjustment.created_at ?? adjustment.happened_at,
      createdAt: adjustment.created_at ?? adjustment.happened_at,
      is_deleted: Boolean(adjustment.is_deleted),
      data: adjustment,
    }));

    return [...refillItems, ...companyPaymentItems, ...companyAdjustmentItems]
      .filter((entry) => !entry.is_deleted)
      .sort(compareChronology);
  }, [compareChronology, companyAdjustmentsQuery.data, companyPaymentsQuery.data, companyRefillsQuery.data]);
  const ledgerAdjustmentItems = useMemo<LedgerAdjustmentListItem[]>(
    () => {
      const groupedInventory = new Map<string, InventoryAdjustment[]>();
      for (const adjustment of allInventoryAdjustmentsQuery.data ?? []) {
        const key = adjustment.group_id ?? adjustment.id;
        const existing = groupedInventory.get(key);
        if (existing) {
          existing.push(adjustment);
        } else {
          groupedInventory.set(key, [adjustment]);
        }
      }
      const inventoryItems = Array.from(groupedInventory.entries()).map<LedgerAdjustmentListItem>(([groupKey, entries]) => {
        const sortedEntries = [...entries].sort((left, right) => {
          const gasOrder =
            (left.gas_type === "12kg" ? 0 : 1) - (right.gas_type === "12kg" ? 0 : 1);
          if (gasOrder !== 0) return gasOrder;
          return compareChronology(
            { id: left.id, sortAt: left.effective_at, createdAt: left.created_at ?? left.effective_at },
            { id: right.id, sortAt: right.effective_at, createdAt: right.created_at ?? right.effective_at }
          );
        });
        const representative = sortedEntries[0];
        return {
          id: `inventory-adjustment-${groupKey}`,
          kind: "inventory_adjustment",
          sortAt: representative.created_at ?? representative.effective_at,
          createdAt: representative.created_at ?? representative.effective_at,
          is_deleted: sortedEntries.every((entry) => Boolean(entry.is_deleted)),
          data: sortedEntries,
          representative,
          isGrouped: sortedEntries.length > 1,
        };
      });
      const cashItems = (allCashAdjustmentsQuery.data ?? []).map<LedgerAdjustmentListItem>((adjustment) => ({
        id: `cash-adjustment-${adjustment.id}`,
        kind: "cash_adjustment",
        sortAt: adjustment.created_at ?? adjustment.effective_at,
        createdAt: adjustment.created_at ?? adjustment.effective_at,
        is_deleted: Boolean(adjustment.is_deleted),
        data: adjustment,
      }));

      return [...inventoryItems, ...cashItems]
        .filter((entry) => !entry.is_deleted)
        .sort(compareChronology);
    },
    [allCashAdjustmentsQuery.data, allInventoryAdjustmentsQuery.data, compareChronology]
  );
  const expenses = useMemo(() => {
    const rows = expensesQuery.data ?? [];
    return [...rows].sort((a, b) => {
      const effectiveDiff = toSafeTime(b.happened_at ?? b.date) - toSafeTime(a.happened_at ?? a.date);
      if (effectiveDiff !== 0) return effectiveDiff;
      const createdDiff = toSafeTime(b.created_at) - toSafeTime(a.created_at);
      if (createdDiff !== 0) return createdDiff;
      return String(b.id ?? "").localeCompare(String(a.id ?? ""));
    });
  }, [expensesQuery.data, toSafeTime]);
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
        if (entry.kind === "company_adjustment") {
          return companyActivityFilter === "adjustment";
        }
        if (entry.kind === "company_payment") {
          return companyActivityFilter === "company_payment";
        }
        const refill = entry.data;
        const totalBuys =
          Number(refill.buy12 ?? 0) +
          Number(refill.buy48 ?? 0) +
          Number(refill.new12 ?? 0) +
          Number(refill.new48 ?? 0);
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
    const expenseItems = expenses
      .filter((item) => !item.is_deleted)
      .map<ExpenseListItem>((item) => ({
        id: `expense-${item.id}`,
        kind: "expense" as const,
        sortAt: item.created_at ?? item.happened_at ?? item.date,
        createdAt: item.created_at ?? item.happened_at ?? item.date,
        data: item,
      }));
    const bankTransferItems = bankDeposits
      .filter((item) => !item.is_deleted)
      .map<ExpenseListItem>((item) => ({
        id: `bank-deposit-${item.id}`,
        kind: "bank_transfer" as const,
        direction: item.direction,
        sortAt: item.created_at ?? item.happened_at,
        createdAt: item.created_at ?? item.happened_at,
        data: item,
      }));

    return [...expenseItems, ...bankTransferItems].sort(compareChronology);
  }, [bankDeposits, compareChronology, expenses]);
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

  // Extract price modal state into custom hook
  const {
    priceModalOpen,
    setPriceModalOpen,
    priceInputs,
    setPriceInputs,
    lastSavedPrices,
    setLastSavedPrices,
    savingPrices,
    setSavingPrices,
    priceSaveStatus,
    setPriceSaveStatus,
    dirtyPriceCombosRef,
  } = usePriceModal(priceSettingsQuery.data);


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

  const customerActivitiesFocusRefetchers = useRef({
    orders: ordersQuery.refetch,
    collections: collectionsQuery.refetch,
    customers: customersQuery.refetch,
    adjustments: customerAdjustmentsQuery.refetch,
    expenses: expensesQuery.refetch,
    bankDeposits: bankDepositsQuery.refetch,
  });
  customerActivitiesFocusRefetchers.current = {
    orders: ordersQuery.refetch,
    collections: collectionsQuery.refetch,
    customers: customersQuery.refetch,
    adjustments: customerAdjustmentsQuery.refetch,
    expenses: expensesQuery.refetch,
    bankDeposits: bankDepositsQuery.refetch,
  };

  const companyActivitiesFocusRefetchers = useRef({
    balances: companyBalancesQuery.refetch,
    refills: companyRefillsQuery.refetch,
    payments: companyPaymentsQuery.refetch,
    adjustments: companyAdjustmentsQuery.refetch,
    inventoryAdjustments: allInventoryAdjustmentsQuery.refetch,
    cashAdjustments: allCashAdjustmentsQuery.refetch,
  });
  companyActivitiesFocusRefetchers.current = {
    balances: companyBalancesQuery.refetch,
    refills: companyRefillsQuery.refetch,
    payments: companyPaymentsQuery.refetch,
    adjustments: companyAdjustmentsQuery.refetch,
    inventoryAdjustments: allInventoryAdjustmentsQuery.refetch,
    cashAdjustments: allCashAdjustmentsQuery.refetch,
  };

  useFocusEffect(
    useCallback(() => {
      customerActivitiesFocusRefetchers.current.orders();
      customerActivitiesFocusRefetchers.current.collections();
      customerActivitiesFocusRefetchers.current.customers();
      if (isCustomerActivities) {
        customerActivitiesFocusRefetchers.current.adjustments();
      }
      if (isExpenses) {
        customerActivitiesFocusRefetchers.current.expenses();
        customerActivitiesFocusRefetchers.current.bankDeposits();
      }
    }, [
      isCustomerActivities,
      isExpenses,
    ])
  );
  useFocusEffect(
    useCallback(() => {
      if (isCompanyActivities || isLedgerAdjustments) {
        companyActivitiesFocusRefetchers.current.balances();
        if (isCompanyActivities) {
          companyActivitiesFocusRefetchers.current.refills();
          companyActivitiesFocusRefetchers.current.payments();
          companyActivitiesFocusRefetchers.current.adjustments();
        }
        if (isLedgerAdjustments) {
          companyActivitiesFocusRefetchers.current.inventoryAdjustments();
          companyActivitiesFocusRefetchers.current.cashAdjustments();
        }
      }
    }, [
      isCompanyActivities,
      isLedgerAdjustments,
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
    setConfirm({ type: "order", id });
  };

  const confirmDeleteCollection = (id: string) => {
    setConfirm({ type: "collection", id });
  };

  const handleDeleteCustomerAdjustment = (adjustment: CustomerAdjustment) => {
    Alert.alert(
      "Delete adjustment?",
      "This will reverse the balance adjustment and update the customer's ledger.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteCustomerAdjust.mutateAsync({ id: adjustment.id, customerId: adjustment.customer_id }),
        },
      ]
    );
  };

  const handleDeleteCompanyAdjustment = (adjustment: CompanyBalanceAdjustment) => {
    Alert.alert(
      "Delete adjustment?",
      "This will reverse the balance adjustment and update the company ledger.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteCompanyAdjust.mutateAsync(adjustment.id),
        },
      ]
    );
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
    setPriceSaveStatus(null);
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
    setPriceSaveStatus(null);
    const savedCombos: GasType[] = [];
    const failedCombos: GasType[] = [];
    try {
      for (const comboKey of dirtyCombos) {
        const gas = comboKey as GasType;
        const { selling, buying, selling_iron, buying_iron } = priceInputs[gas];
        try {
          const savedPrice = await savePrice.mutateAsync({
            gas_type: gas,
            selling_price: Number(selling) || 0,
            buying_price: buying ? Number(buying) : undefined,
            selling_iron_price: selling_iron ? Number(selling_iron) : undefined,
            buying_iron_price: buying_iron ? Number(buying_iron) : undefined,
          });
          savedCombos.push(gas);
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
        } catch {
          failedCombos.push(gas);
        }
      }
      if (failedCombos.length === 0) {
        setPriceModalOpen(false);
        return;
      }
      const savedText = savedCombos.length
        ? `Saved: ${formatPriceGasList(savedCombos)}.`
        : "No rows were saved.";
      const failedText = `Failed: ${formatPriceGasList(failedCombos)}. Review the failed rows and try again.`;
      const message = `${savedText} ${failedText}`;
      setPriceSaveStatus({
        tone: savedCombos.length > 0 ? "warning" : "error",
        message,
      });
      Alert.alert(savedCombos.length > 0 ? "Some prices saved" : "Price save failed", message);
    } finally {
      setSavingPrices(false);
    }
  };
  const canSavePrices = dirtyPriceCombosRef.current.size > 0;

  const {
      handleRemoveRefill,
      handleDeleteInventoryAdjustment,
      handleDeleteInventoryAdjustmentGroup,
      handleDeleteCashAdjustment,
      handleDeleteExpense,
      handleDeleteBankTransfer,
  } = useAddEntryDeleteHandlers({
    deleteRefill,
    deleteInventoryAdjust,
    deleteCashAdjust,
    deleteExpense,
    deleteBankDeposit,
    markDeleting,
    unmarkDeleting,
    todayDate,
  });

  const handleDeleteCompanyPayment = (payment: CompanyPayment) => {
    Alert.alert("Remove company payment?", "This will delete the company payment entry.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          markDeleting(payment.id);
          try {
            await deleteCompanyPayment.mutateAsync(payment.id);
          } catch (error) {
            console.error("[add] delete company payment failed", error);
            Alert.alert("Failed to delete", "Try again later.");
          } finally {
            unmarkDeleting(payment.id);
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
            formatMoney={(value) => formatDisplayMoney(value)}
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
            contentContainerStyle={{ gap: 0 }}
            ListEmptyComponent={
              !ordersQuery.isLoading && !collectionsQuery.isLoading && !customerAdjustmentsQuery.isLoading ? (
                <Text style={styles.meta}>{customerActivityEmptyMessage}</Text>
              ) : null
            }
            renderItem={({ item }) => {
              const fmtMoney = (v: number) => formatDisplayMoney(v);
              if (item.kind === "adjustment") {
                return (
                  <SlimActivityRow
                    event={customerAdjustmentToEvent(item.data, {
                      customerName: item.customerName,
                      customerDescription: customersById.get(item.data.customer_id)?.note ?? null,
                    })}
                    formatMoney={fmtMoney}
                    showCreatedAt
                    showEffectiveAtBottom
                    onDelete={() => handleDeleteCustomerAdjustment(item.data)}
                  />
                );
              }
              if (item.kind === "collection") {
                const collection = item.data;
                return (
                    <SlimActivityRow
                      event={collectionToEvent(collection, {
                        customerName: item.customerName,
                        customerDescription: customersById.get(collection.customer_id)?.note ?? null,
                      })}
                      formatMoney={fmtMoney}
                      showCreatedAt
                      showEffectiveAtBottom
                      onEdit={() => openCollectionEdit(collection)}
                      onDelete={() => confirmDeleteCollection(collection.id)}
                    />
                );
              }
              const order = item.data;
              const systemName = systemsQuery.data?.find((s) => s.id === order.system_id)?.name;
              return (
                <Pressable onPress={() => router.push(`/orders/${order.id}`)}>
                  <SlimActivityRow
                    event={orderToEvent(order, {
                      customerName: item.customerName,
                      customerDescription: customersById.get(order.customer_id)?.note ?? null,
                      systemName,
                    })}
                    formatMoney={fmtMoney}
                    showCreatedAt
                    showEffectiveAtBottom
                    onEdit={() => router.push(`/orders/${order.id}/edit`)}
                    onDelete={() => confirmDeleteOrder(order.id)}
                  />
                </Pressable>
              );
            }}
          />
        </>
      ) : isExpenses ? (
        <>
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
            <FlatList
              key="expenses-list"
              data={filteredExpenseItems}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ gap: 0 }}
              renderItem={({ item }) => {
                const fmtMoney = (v: number) => formatDisplayMoney(v);
                if (item.kind === "bank_transfer") {
                  return (
                    <SlimActivityRow
                      event={bankDepositToEvent(item.data)}
                      formatMoney={fmtMoney}
                      showCreatedAt
                      showEffectiveAtBottom
                      isDeleted={item.data.is_deleted || deletingIds.has(item.data.id)}
                      onDelete={() => handleDeleteBankTransfer(item.data)}
                    />
                  );
                }
                return (
                  <SlimActivityRow
                    event={expenseToEvent(item.data)}
                    formatMoney={fmtMoney}
                    showCreatedAt
                    showEffectiveAtBottom
                    isDeleted={item.data.is_deleted || deletingIds.has(item.data.id)}
                    onEdit={() =>
                      router.push({
                        pathname: "/expenses/new",
                        params: { expenseId: item.data.id },
                      })
                    }
                    onDelete={() => handleDeleteExpense(item.data)}
                  />
                );
              }}
            />
          )}
        </>
      ) : isCompanyActivities ? (
        <>
          {filteredCompanyActivityItems.length === 0 ? (
            <Text style={styles.meta}>No company activities match these filters.</Text>
          ) : (
            <FlatList
              key="company-list"
              data={filteredCompanyActivityItems}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ gap: 0 }}
              renderItem={({ item: entry }) => {
                const fmtMoney = (v: number) => formatDisplayMoney(v);
                if (entry.kind === "company_payment") {
                  return (
                    <SlimActivityRow
                      event={companyPaymentToEvent(entry.data)}
                      formatMoney={fmtMoney}
                      showCreatedAt
                      showEffectiveAtBottom
                      isDeleted={deletingIds.has(entry.data.id)}
                      onDelete={() => handleDeleteCompanyPayment(entry.data)}
                    />
                  );
                }
                if (entry.kind === "company_adjustment") {
                  return (
                    <SlimActivityRow
                      event={companyBalanceAdjustmentToEvent(entry.data)}
                      formatMoney={fmtMoney}
                      showCreatedAt
                      showEffectiveAtBottom
                      isDeleted={entry.is_deleted || deletingIds.has(entry.data.id)}
                      onEdit={() =>
                        router.push({
                          pathname: "/inventory/company-balance-adjust",
                          params: { adjustmentId: entry.data.id },
                        })
                      }
                      onDelete={() => handleDeleteCompanyAdjustment(entry.data)}
                    />
                  );
                }
                const refill = entry.data;
                return (
                  <SlimActivityRow
                    event={refillSummaryToEvent(refill)}
                    formatMoney={fmtMoney}
                    showCreatedAt
                    showEffectiveAtBottom
                    isDeleted={entry.is_deleted || deletingIds.has(refill.refill_id)}
                    onEdit={() =>
                      router.push({
                        pathname: "/inventory/new",
                        params: { section: "company", tab: getCompanyInventoryEditTab(refill), refillId: refill.refill_id },
                      })
                    }
                    onDelete={() => handleRemoveRefill(refill.refill_id)}
                  />
                );
              }}
            />
          )}
        </>
      ) : (
        <>
          {filteredLedgerAdjustmentItems.length === 0 ? (
            <Text style={styles.meta}>No ledger adjustments match these filters.</Text>
          ) : (
              <FlatList
                key="ledger-list"
                data={filteredLedgerAdjustmentItems}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ gap: 0 }}
                renderItem={({ item: entry }) => {
                  const fmtMoney = (v: number) => formatDisplayMoney(v);
                  if (entry.kind === "inventory_adjustment") {
                    const adjustments = entry.data;
                    const adjustment = entry.representative;
                    const deletingGroup = adjustments.some((item) => deletingIds.has(item.id));
                    return (
                      <SlimActivityRow
                        event={
                          entry.isGrouped
                            ? inventoryAdjustmentGroupToEvent(adjustments)
                            : inventoryAdjustmentToEvent(adjustment)
                        }
                        formatMoney={fmtMoney}
                        showCreatedAt
                        showEffectiveAtBottom
                        isDeleted={entry.is_deleted || deletingGroup}
                        onEdit={
                          entry.isGrouped
                            ? undefined
                            : () =>
                                router.push({
                                  pathname: "/inventory/new",
                                  params: { section: "ledger", tab: "inventory", adjustId: adjustment.id },
                                })
                        }
                        onDelete={() =>
                          entry.isGrouped
                            ? handleDeleteInventoryAdjustmentGroup(adjustments)
                            : handleDeleteInventoryAdjustment(adjustment)
                        }
                      />
                    );
                  }
                const adjustment = entry.data;
                return (
                  <SlimActivityRow
                    event={cashAdjustmentToEvent(adjustment)}
                    formatMoney={fmtMoney}
                    showCreatedAt
                    showEffectiveAtBottom
                    isDeleted={entry.is_deleted || deletingIds.has(adjustment.id)}
                    onEdit={() =>
                      router.push({
                        pathname: "/inventory/new",
                        params: { section: "ledger", tab: "cash", cashId: adjustment.id },
                      })
                    }
                    onDelete={() => handleDeleteCashAdjustment(adjustment)}
                  />
                );
              }}
            />
          )}
        </>
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

      <CollectionEditModal
        isOpen={collectionEditOpen}
        target={collectionEditTarget}
        amount={collectionAmount}
        qty12={collectionQty12}
        qty48={collectionQty48}
        note={collectionNote}
        onAmountChange={setCollectionAmount}
        onQty12Change={setCollectionQty12}
        onQty48Change={setCollectionQty48}
        onNoteChange={setCollectionNote}
        onClose={() => setCollectionEditOpen(false)}
        onSave={handleSaveCollectionEdit}
      />

      {/* Confirm modal */}
      <Modal transparent visible={!!confirm} animationType="fade" onRequestClose={() => setConfirm(null)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {confirm?.type === "order"
                ? "Delete order?"
                : "Delete collection?"}
            </Text>
            <Text style={styles.modalText}>
              {confirm?.type === "order"
                ? "This will reverse the order and update related ledger balances."
                : "This will permanently remove the collection and update related balances."}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel delete"
                style={styles.modalBtn}
                onPress={() => setConfirm(null)}
              >
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={confirm?.type === "order" ? "Delete order permanently" : "Delete collection permanently"}
                style={[styles.modalBtn, styles.modalBtnDanger]}
                onPress={async () => {
                  if (confirm?.type === "order") {
                    const id = confirm.id;
                    markDeleting(id);
                    deleteOrder.mutate(id, { onSettled: () => unmarkDeleting(id) });
                    setConfirm(null);
                    return;
                  }
                  if (confirm?.type === "collection") {
                    const id = confirm.id;
                    markDeleting(id);
                    deleteCollection.mutate(id, { onSettled: () => unmarkDeleting(id) });
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
              {priceSaveStatus ? (
                <View
                  style={[
                    styles.priceSaveStatusCard,
                    priceSaveStatus.tone === "error"
                      ? styles.priceSaveStatusError
                      : priceSaveStatus.tone === "warning"
                        ? styles.priceSaveStatusWarning
                        : styles.priceSaveStatusSuccess,
                  ]}
                >
                  <Text style={styles.priceSaveStatusText}>{priceSaveStatus.message}</Text>
                </View>
              ) : null}
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

  const customerListFocusRefetchers = useRef({
    customers: customersQuery.refetch,
    orders: ordersQuery.refetch,
    systems: systemsQuery.refetch,
  });
  customerListFocusRefetchers.current = {
    customers: customersQuery.refetch,
    orders: ordersQuery.refetch,
    systems: systemsQuery.refetch,
  };

  useFocusEffect(
    useCallback(() => {
      customerListFocusRefetchers.current.customers();
      customerListFocusRefetchers.current.orders();
      customerListFocusRefetchers.current.systems();
    }, [])
  );

  const confirmDeleteCustomer = (id: string) => {
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
            money > 0
              ? `Debts on customer ${formatDisplayMoney(money)} ${getCurrencySymbol()}`
              : money < 0
                ? `Credit for customer ${formatDisplayMoney(Math.abs(money))} ${getCurrencySymbol()}`
                : "Settled";
          const cyl12Label =
            cyl12 > 0
              ? `Debts on customer ${Math.abs(cyl12)}x 12kg`
              : cyl12 < 0
                ? `Credit for customer ${Math.abs(cyl12)}x 12kg`
                : "12kg settled";
          const cyl48Label =
            cyl48 > 0
              ? `Debts on customer ${Math.abs(cyl48)}x 48kg`
              : cyl48 < 0
                ? `Credit for customer ${Math.abs(cyl48)}x 48kg`
                : "48kg settled";

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
                  <Text style={styles.time}>{formatDateTimeYMDHM(item.created_at)}</Text>
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
            <Text style={styles.modalText}>
              This will permanently remove the customer if they have no unreversed transactions.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel customer deletion"
                style={styles.modalBtn}
                onPress={() => setConfirmCustomerId(null)}
              >
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete customer permanently"
                style={[styles.modalBtn, styles.modalBtnDanger]}
                onPress={async () => {
                  if (!confirmCustomerId) return;
                  try {
                    await deleteCustomer.mutateAsync(confirmCustomerId);
                  } catch (error: any) {
                    if (isCustomerDeleteBlockedError(error)) {
                      setInfoMessage(CUSTOMER_DELETE_BLOCKED_MESSAGE);
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
  priceSaveStatusCard: {
    borderRadius: 12,
    padding: 12,
  },
  priceSaveStatusError: {
    backgroundColor: "#fee2e2",
  },
  priceSaveStatusWarning: {
    backgroundColor: "#fef3c7",
  },
  priceSaveStatusSuccess: {
    backgroundColor: "#dcfce7",
  },
  priceSaveStatusText: {
    color: "#1f2937",
    fontWeight: "600",
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
