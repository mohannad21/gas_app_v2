import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  InputAccessoryView,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { gasColor } from "@/constants/gas";
import { useCustomers } from "@/hooks/useCustomers";
import { useCreateExpense } from "@/hooks/useExpenses";
import {
  useAdjustInventory,
  useDeleteRefill,
  useInventoryRefills,
} from "@/hooks/useInventory";
import { usePriceSettings } from "@/hooks/usePrices";
import { useDailyReports, useDailyReportsV2 } from "@/hooks/useReports";
import { setAddShortcut } from "@/lib/addShortcut";
import { getDailyReportV2, getInventoryDay } from "@/lib/api";
import { DailyReportV2Day, InventoryDayResponse, InventorySnapshot } from "@/types/domain";

/**
 * NOTE:
 * - Your original file was truncated/garbled, with unbalanced JSX and some state setters using wrong types.
 * - This version fixes syntax issues (balanced JSX), fixes setExpanded([date]) usage, and includes minimal local
 *   implementations for referenced UI helpers (DeltaArrowRow, InventoryTwinPanels, etc.) so bundling succeeds.
 * - Replace these helper components with your real ones if they exist elsewhere in the codebase.
 */

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

type RefillEntry = {
  refill_id: string;
  timeOfDay: "morning" | "evening";
  effective_at?: string;
  buy12: number;
  ret12: number;
  buy48: number;
  ret48: number;
};

type FixEntry = {
  full12: number;
  empty12: number;
  full48: number;
  empty48: number;
  reason: string;
  note?: string;
  delta12: { full: number; empty: number };
  delta48: { full: number; empty: number };
};

export default function ReportsScreen() {
  const { data, isLoading, error, refetch } = useDailyReports();

  const [expanded, setExpanded] = useState<string[]>([]);
  const [inventorySalesExpanded, setInventorySalesExpanded] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"inventory" | "quick" | "payments" | "new">("new");

  // Expense modal state
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseDate, setExpenseDate] = useState<string | null>(null);
  const [expenseType, setExpenseType] = useState("fuel");
  const [customExpenseType, setCustomExpenseType] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [useCustomType, setUseCustomType] = useState(false);

  // Sync tooltip
  const [syncInfoDate, setSyncInfoDate] = useState<string | null>(null);

  // Route handling
  const params = useLocalSearchParams<{ mode?: string; addExpense?: string; expand?: string; date?: string }>();
  const [routeHandled, setRouteHandled] = useState(false);
  const [allowExpenseInput, setAllowExpenseInput] = useState(false);

  // Refills/Fixes
  const [refillByDate, setRefillByDate] = useState<Record<string, RefillEntry | null>>({});
  const [fixByDate, setFixByDate] = useState<Record<string, FixEntry | null>>({});
  const [fixOpenDate, setFixOpenDate] = useState<string | null>(null);

  // Refill edit placeholders (modal)
  const [refillOpenDate, setRefillOpenDate] = useState<string | null>(null);
  const [refillEditEntry, setRefillEditEntry] = useState<RefillEntry | null>(null);
  const [refillEditSnapshots, setRefillEditSnapshots] = useState<{
    start: NormalizedSnapshot | null;
    end: NormalizedSnapshot | null;
  }>({ start: null, end: null });
  const [refillEditPrices, setRefillEditPrices] = useState<{ buy12: number; buy48: number }>({
    buy12: 0,
    buy48: 0,
  });

  // Inventory Day cache
  const [inventoryDayByDate, setInventoryDayByDate] = useState<Record<string, InventoryDayResponse | null>>({});

  // V2
  const [v2Expanded, setV2Expanded] = useState<string[]>([]);
  const [v2DayByDate, setV2DayByDate] = useState<Record<string, DailyReportV2Day | null>>({});
  const [topSummaryOpen, setTopSummaryOpen] = useState(true);
  const [v2SummaryOpen, setV2SummaryOpen] = useState<string | null>(null);

  // Hooks
  const createExpense = useCreateExpense();
  const deleteRefill = useDeleteRefill();
  const adjustInventory = useAdjustInventory();
  const refillsQuery = useInventoryRefills();
  const pricesQuery = usePriceSettings();
  const customersQuery = useCustomers();

  // Formatters
  const formatMoney = (value: number) => Number(value || 0).toFixed(0);
  const formatCount = (value: number) => Number(value || 0).toFixed(0);
  const formatRange = (start: number, end: number) => `${start} -> ${end}`;
  const formatDelta = (start: number, end: number) => {
    const delta = (end || 0) - (start || 0);
    const sign = delta > 0 ? "+" : "";
    return `${sign}${delta}`;
  };
  const getLocalDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const todayDate = getLocalDateString();
  const isToday = (date: string) => date === getLocalDateString();

  const formatSnapshot = useCallback((snap?: InventorySnapshot | null): NormalizedSnapshot | null => {
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
  }, []);

  // V2 query range
  const today = getLocalDateString();
  const v2From = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    const year = start.getFullYear();
    const month = String(start.getMonth() + 1).padStart(2, "0");
    const day = String(start.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, []);
  const v2To = today;
  const v2Query = useDailyReportsV2(v2From, v2To);
  const refetchV2 = v2Query.refetch;
  const v2Rows = useMemo(() => {
    const rows = Array.isArray(v2Query.data) ? v2Query.data : [];
    return [...rows].sort((a, b) => String(b?.date ?? "").localeCompare(String(a?.date ?? "")));
  }, [v2Query.data]);

  const balanceSummary = useMemo(() => {
    const latest = v2Rows[0];
    const hasServerTotals =
      latest &&
      (typeof latest.customer_money_receivable === "number" ||
        typeof latest.customer_money_payable === "number" ||
        typeof latest.customer_12kg_receivable === "number" ||
        typeof latest.customer_12kg_payable === "number" ||
        typeof latest.customer_48kg_receivable === "number" ||
        typeof latest.customer_48kg_payable === "number");

    if (hasServerTotals) {
      return {
        debt: Number(latest?.customer_money_receivable ?? 0),
        credit: Number(latest?.customer_money_payable ?? 0),
        cylDebt12: Number(latest?.customer_12kg_receivable ?? 0),
        cylDebt48: Number(latest?.customer_48kg_receivable ?? 0),
        cylCredit12: Number(latest?.customer_12kg_payable ?? 0),
        cylCredit48: Number(latest?.customer_48kg_payable ?? 0),
      };
    }

    const customers = Array.isArray(customersQuery.data) ? customersQuery.data : [];
    let debt = 0;
    let credit = 0;
    let cylDebt12 = 0;
    let cylDebt48 = 0;
    let cylCredit12 = 0;
    let cylCredit48 = 0;
    customers.forEach((customer) => {
      const balance = Number(customer.money_balance || 0);
      const moneyReceive = Number(customer.money_to_receive ?? 0);
      const moneyGive = Number(customer.money_to_give ?? 0);
      if (moneyReceive > 0 || moneyGive > 0) {
        if (moneyReceive > 0) debt += moneyReceive;
        if (moneyGive > 0) credit += moneyGive;
      } else {
        if (balance > 0) debt += balance;
        if (balance < 0) credit += Math.abs(balance);
      }
      const cyl12 = Number(customer.cylinder_balance_12kg || 0);
      const cyl48 = Number(customer.cylinder_balance_48kg || 0);
      const cylReceive12 = Number(customer.cylinder_to_receive_12kg ?? 0);
      const cylGive12 = Number(customer.cylinder_to_give_12kg ?? 0);
      const cylReceive48 = Number(customer.cylinder_to_receive_48kg ?? 0);
      const cylGive48 = Number(customer.cylinder_to_give_48kg ?? 0);
      if (cylReceive12 > 0 || cylGive12 > 0 || cylReceive48 > 0 || cylGive48 > 0) {
        if (cylReceive12 > 0) cylDebt12 += cylReceive12;
        if (cylGive12 > 0) cylCredit12 += cylGive12;
        if (cylReceive48 > 0) cylDebt48 += cylReceive48;
        if (cylGive48 > 0) cylCredit48 += cylGive48;
      } else {
        if (cyl12 > 0) cylDebt12 += cyl12;
        if (cyl12 < 0) cylCredit12 += Math.abs(cyl12);
        if (cyl48 > 0) cylDebt48 += cyl48;
        if (cyl48 < 0) cylCredit48 += Math.abs(cyl48);
      }
    });
    return {
      debt,
      credit,
      cylDebt12,
      cylDebt48,
      cylCredit12,
      cylCredit48,
    };
  }, [customersQuery.data, v2Rows]);

  const companySummary = useMemo(() => {
    const latest = v2Rows[0];
    const payable = Number(latest?.company_end ?? 0);
    const moneyGive = Number(latest?.company_give_end ?? 0);
    const moneyReceive = Number(latest?.company_receive_end ?? 0);
    const cylGive12 = Number(latest?.company_12kg_give_end ?? 0);
    const cylReceive12 = Number(latest?.company_12kg_receive_end ?? 0);
    const cylGive48 = Number(latest?.company_48kg_give_end ?? 0);
    const cylReceive48 = Number(latest?.company_48kg_receive_end ?? 0);
    return {
      payable,
      moneyGive,
      moneyReceive,
      cylDebt12: cylGive12,
      cylCredit12: cylReceive12,
      cylDebt48: cylGive48,
      cylCredit48: cylReceive48,
    };
  }, [v2Rows]);

  const resolveBuyingPrice = useCallback(
    (gas: "12kg" | "48kg", date: string, timeOfDay?: "morning" | "evening", effectiveAt?: string) => {
      const time = timeOfDay ? (timeOfDay === "morning" ? "09:00" : "18:00") : "12:00";
      const target = effectiveAt ? new Date(effectiveAt) : new Date(`${date}T${time}:00`);
      const effectiveTarget = Number.isNaN(target.getTime()) ? new Date(date) : target;

      const prices = pricesQuery.data ?? [];
      const matches = prices.filter((p: any) => {
        if (p.gas_type !== gas) return false;
        if (p.customer_type !== "private" && p.customer_type !== "any") return false;
        if (!p.buying_price) return false;
        return new Date(p.effective_from) <= effectiveTarget;
      });

      const privateMatches = matches.filter((entry: any) => entry.customer_type === "private");
      const anyMatches = matches.filter((entry: any) => entry.customer_type === "any");
      const candidates = privateMatches.length > 0 ? privateMatches : anyMatches;
      candidates.sort((a: any, b: any) => (a.effective_from < b.effective_from ? 1 : -1));
      return candidates[0]?.buying_price ?? 0;
    },
    [pricesQuery.data]
  );

  const expenseTypes = ["fuel", "food", "car test", "car repair", "car insurance", "others"];
  const accessoryId = Platform.OS === "ios" ? "expenseAccessory" : undefined;

  // Initial snapshot (for oldest day)
  const initialInventorySnapshot = useMemo(() => {
    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) return null;
    const oldest = rows.reduce((acc, row) => (row.date < acc.date ? row : acc), rows[0]);
    return formatSnapshot(oldest.inventory_end ?? oldest.inventory_start);
  }, [data, formatSnapshot]);

  const oldestDate = useMemo(() => {
    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) return null;
    return rows.reduce((acc, row) => (row.date < acc.date ? row : acc), rows[0]).date;
  }, [data]);

  // Map refills by date
  useEffect(() => {
    if (!refillsQuery.data) return;
    const next: Record<string, RefillEntry | null> = {};
    (refillsQuery.data as any[]).forEach((entry) => {
      next[entry.date] = {
        refill_id: entry.refill_id,
        timeOfDay: entry.time_of_day,
        effective_at: entry.effective_at,
        buy12: entry.buy12,
        ret12: entry.return12,
        buy48: entry.buy48,
        ret48: entry.return48,
      };
    });
    setRefillByDate(next);
  }, [refillsQuery.data]);

  // Load inventory day details for expanded days
  useEffect(() => {
    if (expanded.length === 0) return;
    const missing = expanded.filter((date) => !(date in inventoryDayByDate));
    if (missing.length === 0) return;

    let cancelled = false;
    const load = async () => {
      for (const date of missing) {
        try {
          const day = await getInventoryDay(date);
          if (cancelled) return;
          setInventoryDayByDate((prev) => ({ ...prev, [date]: day }));
        } catch {
          if (cancelled) return;
          setInventoryDayByDate((prev) => ({ ...prev, [date]: null }));
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [expanded, inventoryDayByDate]);

  // Load v2 day details for v2Expanded or visible list
  useEffect(() => {
    const wanted = new Set<string>([...v2Expanded, ...((v2Query.data ?? []) as any[]).map((row) => row.date)]);
    if (wanted.size === 0) return;

    const missing = Array.from(wanted).filter((date) => !(date in v2DayByDate));
    if (missing.length === 0) return;

    let cancelled = false;
    const load = async () => {
      for (const date of missing) {
        try {
          const day = await getDailyReportV2(date);
          if (cancelled) return;
          setV2DayByDate((prev) => ({ ...prev, [date]: day }));
        } catch {
          if (cancelled) return;
          setV2DayByDate((prev) => ({ ...prev, [date]: null }));
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [v2Expanded, v2DayByDate, v2Query.data]);

  useEffect(() => {
    if (!v2Query.data) return;
    setV2DayByDate({});
  }, [v2Query.data]);

  const openInventoryShortcut = useCallback((date: string) => {
    setAddShortcut({ mode: "inventory", date });
    router.push("/(tabs)/add");
  }, []);

  const openExpenseModal = useCallback(
    (date: string, preset?: { type: string; amount: number; note?: string | null }) => {
      setExpenseDate(date);
      if (preset) {
        const match = expenseTypes.includes(preset.type) ? preset.type : "";
        if (match) {
          setExpenseType(match);
          setUseCustomType(false);
          setCustomExpenseType("");
        } else {
          setUseCustomType(true);
          setCustomExpenseType(preset.type);
        }
        setExpenseAmount(String(preset.amount));
        setExpenseNote(preset.note ?? "");
      } else {
        setExpenseType("fuel");
        setCustomExpenseType("");
        setUseCustomType(false);
        setExpenseAmount("");
        setExpenseNote("");
      }
      setExpenseModalOpen(true);
    },
    [expenseTypes]
  );

  const saveExpense = useCallback(async () => {
    const date = expenseDate;
    const type = useCustomType ? customExpenseType.trim() : expenseType.trim();
    const amount = Number(expenseAmount);

    if (!date) return;

    if (!type) {
      Alert.alert("Missing type", "Please select or enter an expense type.");
      return;
    }
    if (!amount || amount <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount.");
      return;
    }

    await createExpense.mutateAsync({
      date,
      expense_type: type,
      amount,
      note: expenseNote.trim() ? expenseNote.trim() : undefined,
    });

    setExpenseModalOpen(false);
    setAllowExpenseInput(false);
  }, [expenseAmount, expenseDate, expenseNote, expenseType, useCustomType, customExpenseType, createExpense]);

  // Route params (FIXED: setExpanded expects string[])
  useEffect(() => {
    if (routeHandled) return;

    const addExpense = Array.isArray(params.addExpense) ? params.addExpense[0] : params.addExpense;
    const expand = Array.isArray(params.expand) ? params.expand[0] : params.expand;
    const dateParam = Array.isArray(params.date) ? params.date[0] : params.date;

    const todayStr = new Date().toISOString().slice(0, 10);
    const date = dateParam || todayStr;

    if (addExpense === "1") {
      setAllowExpenseInput(true);
      setExpanded([date]); // FIX
      openExpenseModal(date);
      setRouteHandled(true);
      return;
    }

    if (expand === "1") {
      setExpanded([date]); // FIX
      setRouteHandled(true);
    }
  }, [params, routeHandled, openExpenseModal]);

  useFocusEffect(
    useCallback(() => {
      refetch();
      refetchV2();
      customersQuery.refetch();
      refillsQuery.refetch();
    }, [refetch, refetchV2, customersQuery, refillsQuery])
  );

  // Clear cached day info when collapsing
  useEffect(() => {
    if (!v2Query.data || v2Expanded.length === 0) return;
    setV2DayByDate((prev) => {
      const next = { ...prev };
      v2Expanded.forEach((date) => {
        delete next[date];
      });
      return next;
    });
  }, [v2Query.data, v2Expanded]);

  useEffect(() => {
    if (!data || expanded.length === 0) return;
    setInventoryDayByDate((prev) => {
      const next = { ...prev };
      expanded.forEach((date) => {
        delete next[date];
      });
      return next;
    });
  }, [data, expanded]);

  const handleDeleteRefill = useCallback(
    async (date: string, entry: RefillEntry) => {
      try {
        await deleteRefill.mutateAsync(entry.refill_id);
        setRefillByDate((prev) => ({ ...prev, [date]: null }));
      } catch (err: any) {
        Alert.alert("Remove failed", err?.response?.data?.detail ?? "Failed to remove refill.");
      }
    },
    [deleteRefill]
  );

  const handleDeleteFix = useCallback(
    async (date: string, entry: FixEntry) => {
      try {
        if (entry.delta12.full || entry.delta12.empty) {
          await adjustInventory.mutateAsync({
            date,
            gas_type: "12kg",
            delta_full: -entry.delta12.full,
            delta_empty: -entry.delta12.empty,
            reason: "fix",
            note: "revert",
          });
        }
        if (entry.delta48.full || entry.delta48.empty) {
          await adjustInventory.mutateAsync({
            date,
            gas_type: "48kg",
            delta_full: -entry.delta48.full,
            delta_empty: -entry.delta48.empty,
            reason: "fix",
            note: "revert",
          });
        }
        setFixByDate((prev) => ({ ...prev, [date]: null }));
      } catch (err: any) {
        Alert.alert("Remove failed", err?.response?.data?.detail ?? "Failed to remove fix.");
      }
    },
    [adjustInventory]
  );

  // -------------------------
  // VIEW MODE: NEW (V2)
  // -------------------------
  if (viewMode === "new") {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Daily Reports</Text>
        

        {v2Query.isLoading && <Text style={styles.meta}>Loading...</Text>}
        {v2Query.error && <Text style={styles.error}>Failed to load reports.</Text>}

        <Pressable
          onPress={() => setTopSummaryOpen((prev) => !prev)}
          style={[styles.topSummaryCard, styles.topSummaryToggle]}
        >
          <Text style={[styles.topSummaryTitle, styles.topSummaryTitleTight]}>Dashboard</Text>
          <Ionicons name={topSummaryOpen ? "chevron-up" : "chevron-down"} size={16} color="#0a7ea4" />
        </Pressable>

        {topSummaryOpen ? (
          <>
            <View style={[styles.topSummaryCard, styles.balancesCard]}>
              <Text style={styles.topSummaryTitle}>Balances</Text>
              {(() => {
                const hasCustomerBalance =
                  balanceSummary.debt > 0 ||
                  balanceSummary.credit > 0 ||
                  balanceSummary.cylDebt12 > 0 ||
                  balanceSummary.cylDebt48 > 0 ||
                  balanceSummary.cylCredit12 > 0 ||
                  balanceSummary.cylCredit48 > 0;
                const hasCompanyBalance =
                  companySummary.moneyGive > 0 ||
                  companySummary.moneyReceive > 0 ||
                  companySummary.cylCredit12 > 0 ||
                  companySummary.cylCredit48 > 0 ||
                  companySummary.cylDebt12 > 0 ||
                  companySummary.cylDebt48 > 0;

                return (
                  <View style={styles.balanceSplitRow}>
                    <View style={styles.balanceColumn}>
                      <Text style={styles.balancePanelTitle}>Customers</Text>
                      {!hasCustomerBalance ? (
                        <Text style={styles.balanceEmpty}>No balances</Text>
                      ) : (
                        <>
                          {balanceSummary.debt > 0 ? (
                            <Text style={styles.relationshipLine}>
                              Customers pay you {formatMoney(balanceSummary.debt)} ?
                            </Text>
                          ) : null}
                          {balanceSummary.credit > 0 ? (
                            <Text style={styles.relationshipLine}>
                              You pay customers {formatMoney(balanceSummary.credit)} ?
                            </Text>
                          ) : null}
                          {balanceSummary.cylDebt12 > 0 ? (
                            <Text style={styles.relationshipLine}>
                              Customers give you {balanceSummary.cylDebt12}x{' '}
                              <Text style={{ color: gasColor('12kg') }}>12kg</Text>
                            </Text>
                          ) : null}
                          {balanceSummary.cylDebt48 > 0 ? (
                            <Text style={styles.relationshipLine}>
                              Customers give you {balanceSummary.cylDebt48}x{' '}
                              <Text style={{ color: gasColor('48kg') }}>48kg</Text>
                            </Text>
                          ) : null}
                          {balanceSummary.cylCredit12 > 0 ? (
                            <Text style={styles.relationshipLine}>
                              You give customers {balanceSummary.cylCredit12}x{' '}
                              <Text style={{ color: gasColor('12kg') }}>12kg</Text>
                            </Text>
                          ) : null}
                          {balanceSummary.cylCredit48 > 0 ? (
                            <Text style={styles.relationshipLine}>
                              You give customers {balanceSummary.cylCredit48}x{' '}
                              <Text style={{ color: gasColor('48kg') }}>48kg</Text>
                            </Text>
                          ) : null}
                        </>
                      )}
                    </View>
                    <View style={styles.balanceColumn}>
                      <Text style={styles.balancePanelTitle}>Company</Text>
                      {!hasCompanyBalance ? (
                        <Text style={styles.balanceEmpty}>No balances</Text>
                      ) : (
                        <>
                          {companySummary.moneyGive > 0 ? (
                            <Text style={styles.relationshipLine}>
                              You pay company {formatMoney(companySummary.moneyGive)} ?
                            </Text>
                          ) : null}
                          {companySummary.moneyReceive > 0 ? (
                            <Text style={styles.relationshipLine}>
                              Company gives you {formatMoney(companySummary.moneyReceive)} ?
                            </Text>
                          ) : null}
                          {companySummary.cylCredit12 > 0 ? (
                            <Text style={styles.relationshipLine}>
                              Company gives you {companySummary.cylCredit12}x{' '}
                              <Text style={{ color: gasColor('12kg') }}>12kg</Text>
                            </Text>
                          ) : null}
                          {companySummary.cylCredit48 > 0 ? (
                            <Text style={styles.relationshipLine}>
                              Company gives you {companySummary.cylCredit48}x{' '}
                              <Text style={{ color: gasColor('48kg') }}>48kg</Text>
                            </Text>
                          ) : null}
                          {companySummary.cylDebt12 > 0 ? (
                            <Text style={styles.relationshipLine}>
                              You give company {companySummary.cylDebt12}x{' '}
                              <Text style={{ color: gasColor('12kg') }}>12kg</Text>
                            </Text>
                          ) : null}
                          {companySummary.cylDebt48 > 0 ? (
                            <Text style={styles.relationshipLine}>
                              You give company {companySummary.cylDebt48}x{' '}
                              <Text style={{ color: gasColor('48kg') }}>48kg</Text>
                            </Text>
                          ) : null}
                        </>
                      )}
                    </View>
                  </View>
                );
              })()}
            </View>

<View style={styles.topSummaryCard}>
              <Text style={styles.topSummaryTitle}>Current Inventory and Cash</Text>
              {(() => {
                const latest = v2Rows[0];
                const inventory = latest?.inventory_end;
                return (
                  <View style={styles.topSummaryRow}>
                    <SummaryPill
                      label="12 F"
                      value={formatCount(inventory?.full12 ?? 0)}
                      accent={gasColor("12kg")}
                    />
                    <SummaryPill
                      label="12 E"
                      value={formatCount(inventory?.empty12 ?? 0)}
                      accent={gasColor("12kg")}
                    />
                    <SummaryPill
                      label="48 F"
                      value={formatCount(inventory?.full48 ?? 0)}
                      accent={gasColor("48kg")}
                    />
                    <SummaryPill
                      label="48 E"
                      value={formatCount(inventory?.empty48 ?? 0)}
                      accent={gasColor("48kg")}
                    />
                    <SummaryPill label="Cash" value={formatMoney(latest?.cash_end ?? 0)} />
                  </View>
                );
              })()}
              <View style={styles.adjustButtonRow}>
                <TouchableOpacity
                  onPress={() => {
                    router.push("/(tabs)/add?open=adjust-inventory");
                  }}
                  activeOpacity={0.85}
                  style={styles.adjustButton}
                >
                  <Text style={styles.adjustButtonText}>Adjust Inventory</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    router.push("/(tabs)/add?open=adjust-cash");
                  }}
                  activeOpacity={0.85}
                  style={styles.adjustButton}
                >
                  <Text style={styles.adjustButtonText}>Adjust Cash</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : null}

        <FlatList
          data={v2Rows}
          keyExtractor={(item) => item.date}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={!v2Query.isLoading ? <Text style={styles.meta}>No reports yet.</Text> : null}
          renderItem={({ item }) => {
            const isOpen = v2Expanded.includes(item.date);
            const weekday = new Date(item.date).toLocaleDateString("en-US", { weekday: "short" });

            const problems = item.problems ?? [];
            const companyStart = item.company_start ?? 0;
            const companyEnd = item.company_end ?? 0;

            const actionItems = [...problems];
            if (companyEnd > 0) actionItems.push(`you pay cmpy ${formatMoney(companyEnd)}₪`);

            const problemSummary =
              actionItems.length > 0
                ? `Next Actions: ${actionItems.slice(0, 2).join(" - ")}${
                    actionItems.length > 2 ? ` +${actionItems.length - 2} more` : ""
                  }`
                : null;

            const dayInfo = v2DayByDate[item.date] ?? null;
            const events = (dayInfo?.events ?? []) as any[];
            const recalculated = dayInfo?.recalculated ?? item.recalculated;
            const initAfter = getInitInventoryAfter(events);
            const displayInventoryStart = initAfter
              ? {
                  full12: initAfter.full12 ?? item.inventory_start.full12,
                  empty12: initAfter.empty12 ?? item.inventory_start.empty12,
                  full48: initAfter.full48 ?? item.inventory_start.full48,
                  empty48: initAfter.empty48 ?? item.inventory_start.empty48,
                }
              : item.inventory_start;

            return (
              <View>
                <Pressable
                  onPress={() => {
                    setV2Expanded((prev) =>
                      prev.includes(item.date) ? prev.filter((date) => date !== item.date) : [...prev, item.date]
                    );
                  }}
                  style={({ pressed }) => [
                    styles.card,
                    !isOpen && styles.cardCollapsed,
                    isOpen && styles.cardExpanded,
                    pressed && styles.cardPressed,
                  ]}
                >
                  <View>
                    {(() => {
                      const summary = dayInfo ? summarizeOrderEvents(events) : null;
                      const dayScan = dayInfo ? scanDaySummary(events) : null;
                      const alertLines = dayScan ? buildDaySummaryLines(dayScan, formatMoney, formatCount) : [];
                      const cashEnd = dayInfo?.cash_end ?? item.cash_end ?? 0;
                      return (
                        <View style={styles.collapsedHeaderRow}>
                          <View style={styles.collapsedLeft}>
                            <Text style={styles.v2Date}>
                              {weekday}, {item.date}
                            </Text>

                            <View style={styles.collapsedList}>
                              <Text style={styles.collapsedListItem}>
                                <Text style={[styles.collapsedListItem, { color: gasColor("12kg") }]}>
                                  {formatCount(summary?.sold12 ?? 0)}x 12kg
                                </Text>
                                <Text style={styles.collapsedListItem}> | </Text>
                                <Text style={[styles.collapsedListItem, { color: gasColor("48kg") }]}>
                                  {formatCount(summary?.sold48 ?? 0)}x 48kg
                                </Text>
                              </Text>
                              <Text style={styles.collapsedListItem}>
                                total {formatMoney(summary?.total ?? 0)} | paid {formatMoney(summary?.paid ?? 0)}
                              </Text>
                              <Text style={styles.collapsedListItem}>
                                cash end {formatMoney(cashEnd)}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.collapsedRight}>
                            {alertLines.length > 0 ? (
                              <View style={styles.missingInlineBox}>
                                {alertLines.map((line, index) => (
                                  <Text
                                    key={`${line.label}-${index}`}
                                    style={[styles.auditValue, { color: line.color }]}
                                  >
                                    {line.label}
                                  </Text>
                                ))}
                              </View>
                            ) : null}
                            {dayInfo ? (
                              (() => {
                                const entries = summarizeEventTypes(events);
                                const rows: typeof entries[] = [];
                                for (let i = 0; i < entries.length; i += 3) {
                                  rows.push(entries.slice(i, i + 3));
                                }
                                return (
                                  <View>
                                    {rows.map((row, rowIndex) => (
                                      <View
                                        key={`event-row-${rowIndex}`}
                                        style={[styles.v2EventSummaryRow, styles.collapsedEventRow]}
                                      >
                                        {row.map((entry) => (
                                          <View
                                            key={entry.type}
                                            style={[
                                              styles.v2EventSummaryChip,
                                              styles.collapsedEventChip,
                                              { backgroundColor: entry.color },
                                            ]}
                                          >
                                            <Text style={styles.v2EventSummaryText}>{entry.label}</Text>
                                          </View>
                                        ))}
                                      </View>
                                    ))}
                                  </View>
                                );
                              })()
                            ) : null}
                          </View>
                        </View>
                      );
                    })()}
                  </View>

                  {isOpen ? (
                    <>
                      <View style={styles.expandedDivider} />
                      {dayInfo ? (
                        <V2Timeline
                          date={item.date}
                          events={events}
                          inventoryStart={dayInfo.inventory_start as any}
                          formatMoney={formatMoney}
                          formatCount={formatCount}
                        />
                      ) : (
                        <Text style={styles.meta}>Loading events...</Text>
                      )}

                      <View style={styles.rowBetween}>
                        <View />
                        <View style={styles.badgeRow}>
                          {recalculated ? (
                            <Pressable style={styles.recalcBadge} onPress={() => setSyncInfoDate(item.date)}>
                              <Text style={styles.recalcBadgeText}>Sync Update</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>

                      {(() => {
                        const summary = dayInfo ? summarizeOrderEvents(events) : null;
                        const refillSummary = dayInfo ? summarizeRefillEvents(events) : null;
                        const sold12 = summary?.sold12 ?? 0;
                        const missing12 = summary?.missing12 ?? 0;
                        const credit12 = summary?.credit12 ?? 0;
                        const sold48 = summary?.sold48 ?? 0;
                        const missing48 = summary?.missing48 ?? 0;
                        const credit48 = summary?.credit48 ?? 0;
                        const total = summary?.total ?? 0;
                        const paid = summary?.paid ?? 0;
                        const moneyMissing = summary?.missingCash ?? 0;
                        const moneyCredit = summary?.creditCash ?? 0;
                        const fmtCount = (value: number) => (value === 0 ? "-" : formatCount(value));
                        const fmtMoney = (value: number) => (value === 0 ? "-" : formatMoney(value));
                        const refillBuy12 = refillSummary?.buy12 ?? 0;
                        const refillRet12 = refillSummary?.ret12 ?? 0;
                        const refillBuy48 = refillSummary?.buy48 ?? 0;
                        const refillRet48 = refillSummary?.ret48 ?? 0;
                        const refillDelta12 = refillBuy12 - refillRet12;
                        const refillDelta48 = refillBuy48 - refillRet48;
                        const refillMissing12 = Math.max(refillDelta12, 0);
                        const refillCredit12 = Math.max(-refillDelta12, 0);
                        const refillMissing48 = Math.max(refillDelta48, 0);
                        const refillCredit48 = Math.max(-refillDelta48, 0);
                        const refillTotal = refillSummary?.total ?? 0;
                        const refillPaid = refillSummary?.paid ?? 0;
                        const refillUnpaid = refillSummary?.unpaid ?? 0;
                        const refillMissingCash = Math.max(refillUnpaid, 0);
                        const refillCreditCash = Math.max(-refillUnpaid, 0);
                        const summaryOpen = v2SummaryOpen === item.date;
                        return (
                          <Pressable
                            style={styles.summaryToggleCard}
                            onPress={() => {
                              setV2SummaryOpen((prev) => (prev === item.date ? null : item.date));
                            }}
                          >
                            <View style={styles.summaryToggleHeader}>
                              <Text style={styles.summaryToggleTitle}>Summary</Text>
                              <Ionicons
                                name={summaryOpen ? "chevron-up" : "chevron-down"}
                                size={16}
                                color="#0a7ea4"
                              />
                            </View>
                            {summaryOpen ? (
                              <View style={styles.summaryToggleBody}>
                                <View style={styles.summaryTable}>
                                  <View style={[styles.summaryRowLine, styles.summaryHeaderRow]}>
                                    <Text style={[styles.summaryCell, styles.summaryHeaderCell]}>type</Text>
                                    <Text style={[styles.summaryCell, styles.summaryHeaderCell]}>inst/buy/ttl</Text>
                                    <Text style={[styles.summaryCell, styles.summaryHeaderCell]}>recv/rtrn/paid</Text>
                                    <Text style={[styles.summaryCell, styles.summaryHeaderCell]}>msg</Text>
                                    <Text style={[styles.summaryCell, styles.summaryHeaderCell]}>crdt</Text>
                                  </View>
                                  <View style={styles.summaryRowLine}>
                                    <Text style={[styles.summaryCell, styles.summaryLabelCell, { color: gasColor("12kg") }]}>
                                      12kg
                                    </Text>
                                    <Text style={styles.summaryCell}>{fmtCount(sold12)}</Text>
                                    <Text style={styles.summaryCell}>{fmtCount(sold12 - missing12 + credit12)}</Text>
                                    <Text style={[styles.summaryCell, styles.summaryMissing]}>{fmtCount(missing12)}</Text>
                                    <Text style={[styles.summaryCell, styles.summaryCredit]}>{fmtCount(credit12)}</Text>
                                  </View>
                                  <View style={styles.summaryRowLine}>
                                    <Text style={[styles.summaryCell, styles.summaryLabelCell, { color: gasColor("48kg") }]}>
                                      48kg
                                    </Text>
                                    <Text style={styles.summaryCell}>{fmtCount(sold48)}</Text>
                                    <Text style={styles.summaryCell}>{fmtCount(sold48 - missing48 + credit48)}</Text>
                                    <Text style={[styles.summaryCell, styles.summaryMissing]}>{fmtCount(missing48)}</Text>
                                    <Text style={[styles.summaryCell, styles.summaryCredit]}>{fmtCount(credit48)}</Text>
                                  </View>
                                  <View style={styles.summaryRowLine}>
                                    <Text style={[styles.summaryCell, styles.summaryLabelCell]}>money</Text>
                                    <Text style={styles.summaryCell}>{fmtMoney(total)}</Text>
                                    <Text style={styles.summaryCell}>{fmtMoney(paid)}</Text>
                                    <Text style={[styles.summaryCell, styles.summaryMissing]}>{fmtMoney(moneyMissing)}</Text>
                                    <Text style={[styles.summaryCell, styles.summaryCredit]}>{fmtMoney(moneyCredit)}</Text>
                                  </View>
                                  {(refillBuy12 > 0 || refillRet12 > 0 || refillBuy48 > 0 || refillRet48 > 0) ? (
                                    <>
                                      <View style={styles.summaryRowLine}>
                                        <Text style={[styles.summaryCell, styles.summaryLabelCell, { color: gasColor("12kg") }]}>
                                          rfl 12kg
                                        </Text>
                                        <Text style={styles.summaryCell}>{fmtCount(refillBuy12)}</Text>
                                        <Text style={styles.summaryCell}>{fmtCount(refillRet12)}</Text>
                                        <Text style={[styles.summaryCell, styles.summaryMissing]}>{fmtCount(refillMissing12)}</Text>
                                        <Text style={[styles.summaryCell, styles.summaryCredit]}>{fmtCount(refillCredit12)}</Text>
                                      </View>
                                      <View style={styles.summaryRowLine}>
                                        <Text style={[styles.summaryCell, styles.summaryLabelCell, { color: gasColor("48kg") }]}>
                                          rfl 48kg
                                        </Text>
                                        <Text style={styles.summaryCell}>{fmtCount(refillBuy48)}</Text>
                                        <Text style={styles.summaryCell}>{fmtCount(refillRet48)}</Text>
                                        <Text style={[styles.summaryCell, styles.summaryMissing]}>{fmtCount(refillMissing48)}</Text>
                                        <Text style={[styles.summaryCell, styles.summaryCredit]}>{fmtCount(refillCredit48)}</Text>
                                      </View>
                                      <View style={styles.summaryRowLine}>
                                        <Text style={[styles.summaryCell, styles.summaryLabelCell]}>rfl money</Text>
                                        <Text style={styles.summaryCell}>{fmtMoney(refillTotal)}</Text>
                                        <Text style={styles.summaryCell}>{fmtMoney(refillPaid)}</Text>
                                        <Text style={[styles.summaryCell, styles.summaryMissing]}>{fmtMoney(refillMissingCash)}</Text>
                                        <Text style={[styles.summaryCell, styles.summaryCredit]}>{fmtMoney(refillCreditCash)}</Text>
                                      </View>
                                    </>
                                  ) : null}
                                </View>

                                <View style={styles.v2InvCashRow}>
                                  <View style={styles.v2InvCompactBox}>
                                    <Text style={[styles.v2InvCompactLabel, { color: gasColor("12kg") }]}>12kg F</Text>
                                    <View style={styles.v2DeltaBlock}>
                                      <DeltaArrowRow
                                        start={displayInventoryStart.full12}
                                        end={item.inventory_end.full12}
                                        format={formatCount}
                                        size="sm"
                                      />
                                    </View>
                                    <Text style={[styles.v2InvCompactLabel, { color: gasColor("12kg") }]}>12kg E</Text>
                                    <View style={styles.v2DeltaBlock}>
                                      <DeltaArrowRow
                                        start={displayInventoryStart.empty12}
                                        end={item.inventory_end.empty12}
                                        format={formatCount}
                                        size="sm"
                                      />
                                    </View>
                                  </View>
                                  <View style={styles.v2InvCompactBox}>
                                    <Text style={[styles.v2InvCompactLabel, { color: gasColor("48kg") }]}>48kg F</Text>
                                    <View style={styles.v2DeltaBlock}>
                                      <DeltaArrowRow
                                        start={displayInventoryStart.full48}
                                        end={item.inventory_end.full48}
                                        format={formatCount}
                                        size="sm"
                                      />
                                    </View>
                                    <Text style={[styles.v2InvCompactLabel, { color: gasColor("48kg") }]}>48kg E</Text>
                                    <View style={styles.v2DeltaBlock}>
                                      <DeltaArrowRow
                                        start={displayInventoryStart.empty48}
                                        end={item.inventory_end.empty48}
                                        format={formatCount}
                                        size="sm"
                                      />
                                    </View>
                                  </View>
                                  <View style={styles.v2InvCompactBox}>
                                    <Text style={styles.v2InvCompactLabel}>Cash</Text>
                                    <View style={styles.v2DeltaBlock}>
                                      <DeltaArrowRow start={item.cash_start} end={item.cash_end} format={formatMoney} size="sm" />
                                    </View>
                                  </View>
                                </View>
                              </View>
                            ) : null}
                          </Pressable>
                        );
                      })()}

                      <View style={styles.v2DetailsRow}>
                        <Text style={styles.v2DetailsText}>Hide details</Text>
                        <Ionicons name="chevron-up" size={16} color="#0a7ea4" />
                      </View>
                    </>
                  ) : null}
                </Pressable>

              </View>
            );
          }}
        />

        {/* Sync tooltip */}
        <Modal transparent visible={!!syncInfoDate} animationType="fade" onRequestClose={() => setSyncInfoDate(null)}>
          <Pressable style={styles.syncOverlay} onPress={() => setSyncInfoDate(null)}>
            <Pressable style={styles.syncTooltip} onPress={(event) => event.stopPropagation()}>
              <Text style={styles.syncTitle}>Sync Update</Text>
              <Text style={styles.syncText}>Totals refreshed after closing time to include late entries.</Text>
              <Pressable style={styles.syncClose} onPress={() => setSyncInfoDate(null)}>
                <Text style={styles.syncCloseText}>Close</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Expense modal (minimal, to avoid unused state and keep feature workable) */}
        <ExpenseModal
          visible={expenseModalOpen}
          accessoryId={accessoryId}
          allowAutoFocus={allowExpenseInput}
          expenseTypes={expenseTypes}
          useCustomType={useCustomType}
          setUseCustomType={setUseCustomType}
          expenseType={expenseType}
          setExpenseType={setExpenseType}
          customExpenseType={customExpenseType}
          setCustomExpenseType={setCustomExpenseType}
          expenseAmount={expenseAmount}
          setExpenseAmount={setExpenseAmount}
          expenseNote={expenseNote}
          setExpenseNote={setExpenseNote}
          onClose={() => {
            setExpenseModalOpen(false);
            setAllowExpenseInput(false);
          }}
          onSave={saveExpense}
        />

        {/* Refill edit modal (placeholder) */}
        <RefillEditModal
          visible={!!refillOpenDate}
          date={refillOpenDate}
          entry={refillEditEntry}
          snapshots={refillEditSnapshots}
          prices={refillEditPrices}
          onClose={() => {
            setRefillOpenDate(null);
            setRefillEditEntry(null);
          }}
        />
      </View>
    );
  }

  // -------------------------
  // VIEW MODE: LEGACY (v1)
  // -------------------------
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Daily Reports</Text>
      <Text style={styles.meta}>Today: {new Date().toISOString().slice(0, 10)}</Text>

      <View style={styles.tabRow}>
        <Pressable onPress={() => setViewMode("new")} style={styles.tabChip}>
          <Text style={styles.tabChipText}>New Approach</Text>
        </Pressable>

        <Pressable onPress={() => setViewMode("quick")} style={[styles.tabChip, viewMode === "quick" && styles.tabChipActive]}>
          <Text style={[styles.tabChipText, viewMode === "quick" && styles.tabChipTextActive]}>Quick</Text>
        </Pressable>

        <Pressable
          onPress={() => setViewMode("inventory")}
          style={[styles.tabChip, viewMode === "inventory" && styles.tabChipActive]}
        >
          <Text style={[styles.tabChipText, viewMode === "inventory" && styles.tabChipTextActive]}>Inventory</Text>
        </Pressable>

        <Pressable
          onPress={() => setViewMode("payments")}
          style={[styles.tabChip, viewMode === "payments" && styles.tabChipActive]}
        >
          <Text style={[styles.tabChipText, viewMode === "payments" && styles.tabChipTextActive]}>Payments</Text>
        </Pressable>
      </View>

      {isLoading && <Text style={styles.meta}>Loading...</Text>}
      {error && <Text style={styles.error}>Failed to load reports.</Text>}

      <FlatList
        data={(data ?? []) as any[]}
        keyExtractor={(item) => item.date}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={!isLoading ? <Text style={styles.meta}>No reports yet.</Text> : null}
        renderItem={({ item }) => {
          const unpaid = item.expected - item.received;
          const missing12 = Math.max(0, item.installed12 - item.received12);
          const missing48 = Math.max(0, item.installed48 - item.received48);

          const missingParts = [missing12 ? `${missing12}x 12kg` : null, missing48 ? `${missing48}x 48kg` : null].filter(
            Boolean
          ) as string[];

          const missingTotal = missing12 + missing48;

          const orders = item.orders ?? [];
          const totalsByGas = (gas: "12kg" | "48kg") =>
            (orders as any[]).reduce(
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

          const endInv = formatSnapshot(item.inventory_end);
          const refillEntry = refillByDate[item.date] ?? null;
          const fixEntry = fixByDate[item.date] ?? null;

          const buy12Price = resolveBuyingPrice("12kg", item.date, refillEntry?.timeOfDay, refillEntry?.effective_at);
          const buy48Price = resolveBuyingPrice("48kg", item.date, refillEntry?.timeOfDay, refillEntry?.effective_at);

          const dayInfo = inventoryDayByDate[item.date] ?? null;
          const adjustTotals = dayInfo?.events?.reduce(
            (acc: any, event: any) => {
              if (event.source_type !== "adjust") return acc;
              if (event.gas_type === "12kg") {
                acc.full12 += event.delta_full;
                acc.empty12 += event.delta_empty;
              } else {
                acc.full48 += event.delta_full;
                acc.empty48 += event.delta_empty;
              }
              return acc;
            },
            { full12: 0, empty12: 0, full48: 0, empty48: 0 }
          );

          const hasAdjust =
            !!adjustTotals && (adjustTotals.full12 || adjustTotals.empty12 || adjustTotals.full48 || adjustTotals.empty48);

          const isOpen = expanded.includes(item.date);
          const weekday = new Date(item.date).toLocaleDateString("en-US", { weekday: "short" });
          const isOldest = oldestDate === item.date;
          const beforeInv = isOldest ? initialInventorySnapshot : formatSnapshot(item.inventory_start);

          if (viewMode === "quick") {
            return (
              <View>
                <Pressable
                  onPress={() => {
                    setExpanded((prev) =>
                      prev.includes(item.date) ? prev.filter((date) => date !== item.date) : [...prev, item.date]
                    );
                  }}
                  style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                >
                  <View style={styles.rowBetween}>
                    <Text style={styles.date}>
                      {weekday}, {item.display}
                    </Text>
                    <Text style={[styles.statusText, styles.paid]}>Paid {formatMoney(item.received)}</Text>
                  </View>

                  <Text style={[styles.statusText, unpaid > 0 ? styles.unpaid : styles.paid]}>
                    Missing cash: {formatMoney(unpaid)} ?
                  </Text>

                  <Text style={[styles.statusText, missingTotal > 0 ? styles.unpaid : styles.paid]}>
                    {missingTotal > 0 ? `cstmr give you ${missingParts.join(" - ")}` : "Returned"}
                  </Text>

                  <Text style={styles.meta}>Orders: {orders.length}</Text>

                  <Text style={styles.meta}>
                    Inventory (end): 12kg {endInv?.full12 ?? 0}/{endInv?.empty12 ?? 0} - 48kg {endInv?.full48 ?? 0}/
                    {endInv?.empty48 ?? 0}
                  </Text>
                </Pressable>

                {isOpen && (
                  <View style={[styles.expanded, styles.quickSummary]}>
                    <Text style={styles.expandedTitle}>Summary</Text>

                    <View style={styles.rowBetween}>
                      <Text style={styles.orderMeta}>Orders</Text>
                      <Text style={styles.statusText}>{orders.length}</Text>
                    </View>

                    <View style={styles.rowBetween}>
                      <Text style={styles.orderMeta}>Paid</Text>
                      <Text style={[styles.statusText, styles.paid]}>{formatMoney(item.received)}</Text>
                    </View>

                    <View style={styles.rowBetween}>
                      <Text style={styles.orderMeta}>cstmr pay you</Text>
                      <Text style={[styles.statusText, unpaid > 0 ? styles.unpaid : styles.paid]}>
                        {formatMoney(unpaid)}₪
                      </Text>
                    </View>

                    <View style={styles.rowBetween}>
                      <Text style={styles.orderMeta}>cstmr give you</Text>
                      <Text style={[styles.statusText, missingTotal > 0 ? styles.unpaid : styles.paid]}>
                        {missingTotal > 0 ? missingParts.join(" - ") : "Returned"}
                      </Text>
                    </View>

                    <View style={styles.rowBetween}>
                      <Text style={styles.orderMeta}>Inventory end</Text>
                      <Text style={styles.statusText}>
                        12kg {endInv?.full12 ?? 0}/{endInv?.empty12 ?? 0} - 48kg {endInv?.full48 ?? 0}/
                        {endInv?.empty48 ?? 0}
                      </Text>
                    </View>

                    <Pressable
                      style={styles.quickDetailsButton}
                      onPress={() => {
                        setViewMode("inventory");
                        setExpanded([item.date]);
                      }}
                    >
                      <Text style={styles.quickDetailsText}>Open full details</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }

          return (
            <View>
              <Pressable
                onPress={() => {
                  setExpanded((prev) =>
                    prev.includes(item.date) ? prev.filter((date) => date !== item.date) : [...prev, item.date]
                  );
                }}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              >
                <View style={styles.rowBetween}>
                  <View>
                    <View style={styles.dateRow}>
                      <Text style={styles.date}>
                        {weekday}, {item.display}
                      </Text>

                      {viewMode === "inventory" && (
                        <View style={styles.dayActions}>
                          <Pressable
                            onPress={() => openInventoryShortcut(item.date)}
                            style={styles.dayIconBtn}
                            accessibilityLabel="Add inventory"
                          >
                            <Ionicons name="add-circle-outline" size={18} color="#0a7ea4" />
                          </Pressable>

                          <Pressable
                            onPress={() => setFixOpenDate(item.date)}
                            style={styles.dayIconBtn}
                            accessibilityLabel="Add fix"
                          >
                            <Ionicons name="build-outline" size={18} color="#f97316" />
                          </Pressable>

                          <Pressable
                            onPress={() => openExpenseModal(item.date)}
                            style={styles.dayIconBtn}
                            accessibilityLabel="Add expense"
                          >
                            <Ionicons name="cash-outline" size={18} color="#16a34a" />
                          </Pressable>
                        </View>
                      )}
                    </View>

                    {viewMode === "payments" && (
                      <View style={styles.statusBelow}>
                        <View style={styles.statusRow}>
                          <Text style={[styles.statusText, styles.paid]}>Paid {formatMoney(item.received)}</Text>
                          {unpaid > 0 && <Text style={[styles.statusText, styles.unpaid]}> - Unpaid {formatMoney(unpaid)}</Text>}
                        </View>
                        <Text style={[styles.statusText, missingTotal > 0 ? styles.unpaid : styles.paid]}>
                          {missingTotal > 0 ? `Missing ${missingParts.join(" - ")}` : "Returned"}
                        </Text>
                      </View>
                    )}
                  </View>

                  {viewMode !== "payments" && (
                    <View style={{ alignItems: "flex-end" }}>
                      <View style={styles.statusRow}>
                        <Text style={[styles.statusText, styles.paid]}>Paid {formatMoney(item.received)}</Text>
                        {unpaid > 0 && <Text style={[styles.statusText, styles.unpaid]}> - Unpaid {formatMoney(unpaid)}</Text>}
                      </View>

                      <Text style={[styles.statusText, missingTotal > 0 ? styles.unpaid : styles.paid]}>
                        {missingTotal > 0 ? `Missing ${missingParts.join(" - ")}` : "Returned"}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={{ marginTop: 10 }}>
                  <View style={styles.labeledRowGroupCard}>
                    <LabeledSection label="sales" color="#0a7ea4">
                      <Pressable
                        onPress={() => {
                          setExpanded((prev) =>
                            prev.includes(item.date) ? prev.filter((date) => date !== item.date) : [...prev, item.date]
                          );
                        }}
                      >
                        <SalesTable
                          installed12={item.installed12}
                          received12={item.received12}
                          installed48={item.installed48}
                          received48={item.received48}
                          totals12={totals12}
                          totals48={totals48}
                          formatMoney={formatMoney}
                          showPayments={false}
                          showSigns={false}
                        />
                      </Pressable>
                    </LabeledSection>
                  </View>
                </View>
              </Pressable>

              {isOpen && (
                <View style={[styles.expanded, styles.labeledRowGroupCard]}>
                  <LabeledSection label="after" color="#0f766e">
                    <InventoryBlock title="" snapshot={endInv} variant="grey" />
                  </LabeledSection>

                  {refillEntry && (
                    <LabeledSection label="refill" color="#e0b93f">
                      <RefillTable
                        entry={refillEntry}
                        buy12Price={buy12Price}
                        buy48Price={buy48Price}
                        onEdit={() => {
                          setRefillOpenDate(item.date);
                          setRefillEditEntry(refillEntry);
                          setRefillEditSnapshots({ start: beforeInv, end: endInv });
                          setRefillEditPrices({ buy12: buy12Price, buy48: buy48Price });
                        }}
                        onDelete={() => handleDeleteRefill(item.date, refillEntry)}
                        editTestId={`refill-edit-${item.date}`}
                        deleteTestId={`refill-delete-${item.date}`}
                      />
                    </LabeledSection>
                  )}

                  <LabeledSection label="sales" color="#0a7ea4">
                    <Pressable onPress={() => setInventorySalesExpanded((prev) => (prev === item.date ? null : item.date))}>
                      <SalesTable
                        installed12={item.installed12}
                        received12={item.received12}
                        installed48={item.installed48}
                        received48={item.received48}
                        totals12={totals12}
                        totals48={totals48}
                        formatMoney={formatMoney}
                        showPayments={false}
                        showSigns
                        variant="expanded"
                        showTotalsRow
                      />
                    </Pressable>
                  </LabeledSection>

                  {inventorySalesExpanded === item.date && <OrdersForDay date={item.date} orders={item.orders} />}

                  {fixEntry && (
                    <LabeledSection label="fix" color="#f97316">
                      <FixTable
                        entry={fixEntry}
                        onEdit={() => setFixOpenDate(item.date)}
                        onDelete={() => {
                          setFixOpenDate(null);
                          handleDeleteFix(item.date, fixEntry);
                        }}
                      />
                    </LabeledSection>
                  )}

                  {hasAdjust && adjustTotals && (
                    <LabeledSection label="adjust" color="#8b5cf6">
                      <AdjustTable entry={adjustTotals} />
                    </LabeledSection>
                  )}

                  <LabeledSection label="before" color="#64748b">
                    <InventoryBlock title="" snapshot={beforeInv} variant="grey" />
                  </LabeledSection>
                </View>
              )}

              {viewMode === "inventory" && (
                <FixModal
                  visible={fixOpenDate === item.date}
                  onClose={() => setFixOpenDate(null)}
                  date={item.date}
                  snapshot={endInv}
                  entry={fixEntry}
                  onSaved={(entry) => setFixByDate((prev) => ({ ...prev, [item.date]: entry }))}
                />
              )}
            </View>
          );
        }}
      />

      {/* Expense modal (usable) */}
      <ExpenseModal
        visible={expenseModalOpen}
        accessoryId={accessoryId}
        allowAutoFocus={allowExpenseInput}
        expenseTypes={expenseTypes}
        useCustomType={useCustomType}
        setUseCustomType={setUseCustomType}
        expenseType={expenseType}
        setExpenseType={setExpenseType}
        customExpenseType={customExpenseType}
        setCustomExpenseType={setCustomExpenseType}
        expenseAmount={expenseAmount}
        setExpenseAmount={setExpenseAmount}
        expenseNote={expenseNote}
        setExpenseNote={setExpenseNote}
        onClose={() => {
          setExpenseModalOpen(false);
          setAllowExpenseInput(false);
        }}
        onSave={saveExpense}
      />

      {/* Refill edit modal (placeholder) */}
      <RefillEditModal
        visible={!!refillOpenDate}
        date={refillOpenDate}
        entry={refillEditEntry}
        snapshots={refillEditSnapshots}
        prices={refillEditPrices}
        onClose={() => {
          setRefillOpenDate(null);
          setRefillEditEntry(null);
        }}
      />

    </View>
  );
}

/* -----------------------------------------
 * Minimal helper UI components (safe defaults)
 * ----------------------------------------- */

function DeltaArrowRow({
  start,
  end,
  format,
  size = "sm",
}: {
  start: number;
  end: number;
  format: (v: number) => string;
  size?: "sm" | "lg";
}) {
  const valueStyle = size === "lg" ? styles.deltaValueLg : styles.deltaValueSm;
  const delta = (end || 0) - (start || 0);
  const sign = delta > 0 ? "+" : "";
  return (
    <View style={styles.deltaRow}>
      <Text style={valueStyle}>{format(start)}</Text>
      <Text style={styles.deltaArrow}>-></Text>
      <View style={styles.deltaEndColumn}>
        <Text style={valueStyle}>{format(end)}</Text>
        <Text style={styles.deltaMeta}>
          ({sign}
          {delta})
        </Text>
      </View>
    </View>
  );
}

function MetricRow({
  label,
  labelStyle,
  children,
}: {
  label: string;
  labelStyle?: any;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.metricRow}>
      <Text style={[styles.metricLabel, labelStyle]}>{label}</Text>
      <View style={{ flex: 1, alignItems: "flex-end" }}>{children}</View>
    </View>
  );
}

function InventoryTwinPanels({
  fullStart,
  fullEnd,
  emptyStart,
  emptyEnd,
  formatCount,
}: {
  fullStart: number;
  fullEnd: number;
  emptyStart: number;
  emptyEnd: number;
  formatCount: (v: number) => string;
}) {
  return (
    <View style={styles.invTwin}>
      <View style={styles.invTwinRow}>
        <Text style={styles.invTwinKey}>Full</Text>
        <Text style={styles.invTwinVal}>
          {formatCount(fullStart)} -> {formatCount(fullEnd)}
        </Text>
        <Text style={styles.invTwinDelta}>({formatSigned(fullEnd - fullStart)})</Text>
      </View>
      <View style={styles.invTwinRow}>
        <Text style={styles.invTwinKey}>Empty</Text>
        <Text style={styles.invTwinVal}>
          {formatCount(emptyStart)} -> {formatCount(emptyEnd)}
        </Text>
        <Text style={styles.invTwinDelta}>({formatSigned(emptyEnd - emptyStart)})</Text>
      </View>
    </View>
  );
}

function InventoryBlock({
  title,
  snapshot,
  variant,
}: {
  title: string;
  snapshot: NormalizedSnapshot | null;
  variant?: "grey" | "default";
}) {
  return (
    <View style={[styles.invBlock, variant === "grey" && styles.invBlockGrey]}>
      {title ? <Text style={styles.invBlockTitle}>{title}</Text> : null}
      <Text style={styles.invBlockLine}>12kg: {snapshot ? `${snapshot.full12}/${snapshot.empty12}` : "-"}</Text>
      <Text style={styles.invBlockLine}>48kg: {snapshot ? `${snapshot.full48}/${snapshot.empty48}` : "-"}</Text>
      {snapshot?.as_of ? <Text style={styles.invBlockMeta}>as of: {snapshot.as_of}</Text> : null}
    </View>
  );
}

function LabeledSection({
  label,
  color,
  children,
}: {
  label: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.labeledSection}>
      <View style={[styles.labeledHeader, { borderLeftColor: color }]}>
        <Text style={styles.labeledHeaderText}>{label.toUpperCase()}</Text>
      </View>
      <View style={styles.labeledBody}>{children}</View>
    </View>
  );
}

function SalesTable(props: any) {
  // Minimal placeholder. Replace with your real table if available.
  const {
    installed12,
    received12,
    installed48,
    received48,
    totals12,
    totals48,
    formatMoney,
    variant,
    showTotalsRow,
  } = props;

  return (
    <View style={[styles.table, variant === "expanded" && styles.tableExpanded]}>
      <Text style={styles.tableRow}>
        12kg: {installed12} -> {received12} | ? {formatMoney(totals12?.paid ?? 0)}/{formatMoney(totals12?.total ?? 0)}
      </Text>
      <Text style={styles.tableRow}>
        48kg: {installed48} -> {received48} | ? {formatMoney(totals48?.paid ?? 0)}/{formatMoney(totals48?.total ?? 0)}
      </Text>
      {showTotalsRow ? <Text style={styles.tableMeta}>Totals row enabled</Text> : null}
    </View>
  );
}

function OrdersForDay({ date, orders }: { date: string; orders: any[] }) {
  return (
    <View style={styles.subCard}>
      <Text style={styles.subCardTitle}>Orders ({date})</Text>
      {orders?.length ? (
        orders.map((o, idx) => (
          <Text key={`${date}-order-${idx}`} style={styles.subCardRow}>
            {(o as any)?.customer_name ?? (o as any)?.customer ?? "Order"} - paid{" "}
            {(o as any)?.paid_amount ?? (o as any)?.paid ?? 0}
          </Text>
        ))
      ) : (
        <Text style={styles.meta}>No orders.</Text>
      )}
    </View>
  );
}

function RefillTable({
  entry,
  buy12Price,
  buy48Price,
  onEdit,
  onDelete,
}: {
  entry: RefillEntry;
  buy12Price: number;
  buy48Price: number;
  onEdit: () => void;
  onDelete: () => void;
  editTestId?: string;
  deleteTestId?: string;
}) {
  return (
    <View style={styles.subCard}>
      <View style={styles.rowBetween}>
        <Text style={styles.subCardTitle}>Refill ({entry.timeOfDay})</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable onPress={onEdit} style={styles.smallBtn}>
            <Text style={styles.smallBtnText}>Edit</Text>
          </Pressable>
          <Pressable onPress={onDelete} style={[styles.smallBtn, styles.smallBtnDanger]}>
            <Text style={styles.smallBtnText}>Remove</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.subCardRow}>
        12kg buy/ret: {entry.buy12}/{entry.ret12} (buy ? {buy12Price})
      </Text>
      <Text style={styles.subCardRow}>
        48kg buy/ret: {entry.buy48}/{entry.ret48} (buy ? {buy48Price})
      </Text>
      {entry.effective_at ? <Text style={styles.meta}>effective: {entry.effective_at}</Text> : null}
    </View>
  );
}

function FixTable({ entry, onEdit, onDelete }: { entry: FixEntry; onEdit: () => void; onDelete: () => void }) {
  return (
    <View style={styles.subCard}>
      <View style={styles.rowBetween}>
        <Text style={styles.subCardTitle}>Fix</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable onPress={onEdit} style={styles.smallBtn}>
            <Text style={styles.smallBtnText}>Edit</Text>
          </Pressable>
          <Pressable onPress={onDelete} style={[styles.smallBtn, styles.smallBtnDanger]}>
            <Text style={styles.smallBtnText}>Remove</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.subCardRow}>Reason: {entry.reason}</Text>
    </View>
  );
}

function AdjustTable({ entry }: { entry: any }) {
  return (
    <View style={styles.subCard}>
      <Text style={styles.subCardTitle}>Adjust totals</Text>
      <Text style={styles.subCardRow}>
        12kg Δ full/empty: {entry.full12}/{entry.empty12}
      </Text>
      <Text style={styles.subCardRow}>
        48kg Δ full/empty: {entry.full48}/{entry.empty48}
      </Text>
    </View>
  );
}

function FixModal({
  visible,
  onClose,
  date,
  snapshot,
  entry,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  date: string;
  snapshot: NormalizedSnapshot | null;
  entry: FixEntry | null;
  onSaved: (entry: FixEntry) => void;
}) {
  const adjustInventory = useAdjustInventory();
  const [reason, setReason] = useState(entry?.reason ?? "fix");
  const [note, setNote] = useState(entry?.note ?? "");
  const [full12, setFull12] = useState(String(entry?.delta12?.full ?? 0));
  const [empty12, setEmpty12] = useState(String(entry?.delta12?.empty ?? 0));
  const [full48, setFull48] = useState(String(entry?.delta48?.full ?? 0));
  const [empty48, setEmpty48] = useState(String(entry?.delta48?.empty ?? 0));

  useEffect(() => {
    if (!visible) return;
    setReason(entry?.reason ?? "fix");
    setNote(entry?.note ?? "");
    setFull12(String(entry?.delta12?.full ?? 0));
    setEmpty12(String(entry?.delta12?.empty ?? 0));
    setFull48(String(entry?.delta48?.full ?? 0));
    setEmpty48(String(entry?.delta48?.empty ?? 0));
  }, [visible, entry]);

  const save = async () => {
    const d12f = Number(full12) || 0;
    const d12e = Number(empty12) || 0;
    const d48f = Number(full48) || 0;
    const d48e = Number(empty48) || 0;

    try {
      if (d12f || d12e) {
        await adjustInventory.mutateAsync({
          date,
          gas_type: "12kg",
          delta_full: d12f,
          delta_empty: d12e,
          reason,
          note: note.trim() ? note.trim() : undefined,
        });
      }
      if (d48f || d48e) {
        await adjustInventory.mutateAsync({
          date,
          gas_type: "48kg",
          delta_full: d48f,
          delta_empty: d48e,
          reason,
          note: note.trim() ? note.trim() : undefined,
        });
      }

      onSaved({
        full12: snapshot?.full12 ?? 0,
        empty12: snapshot?.empty12 ?? 0,
        full48: snapshot?.full48 ?? 0,
        empty48: snapshot?.empty48 ?? 0,
        reason,
        note: note.trim() ? note.trim() : undefined,
        delta12: { full: d12f, empty: d12e },
        delta48: { full: d48f, empty: d48e },
      });

      onClose();
    } catch (err: any) {
      Alert.alert("Fix failed", err?.response?.data?.detail ?? "Failed to save fix.");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Fix inventory ({date})</Text>

          <Text style={styles.modalLabel}>Reason</Text>
          <TextInput value={reason} onChangeText={setReason} style={styles.input} />

          <Text style={styles.modalLabel}>12kg Δ full / empty</Text>
          <View style={styles.rowBetween}>
            <TextInput value={full12} onChangeText={setFull12} style={[styles.input, styles.half]} keyboardType="number-pad" />
            <TextInput value={empty12} onChangeText={setEmpty12} style={[styles.input, styles.half]} keyboardType="number-pad" />
          </View>

          <Text style={styles.modalLabel}>48kg Δ full / empty</Text>
          <View style={styles.rowBetween}>
            <TextInput value={full48} onChangeText={setFull48} style={[styles.input, styles.half]} keyboardType="number-pad" />
            <TextInput value={empty48} onChangeText={setEmpty48} style={[styles.input, styles.half]} keyboardType="number-pad" />
          </View>

          <Text style={styles.modalLabel}>Note</Text>
          <TextInput value={note} onChangeText={setNote} style={styles.input} />

          <View style={styles.rowBetween}>
            <Pressable style={[styles.primaryBtn, styles.secondaryBtn]} onPress={onClose}>
              <Text style={styles.primaryBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={save}>
              <Text style={styles.primaryBtnText}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ExpenseModal(props: {
  visible: boolean;
  accessoryId?: string;
  allowAutoFocus: boolean;
  expenseTypes: string[];
  useCustomType: boolean;
  setUseCustomType: (v: boolean) => void;
  expenseType: string;
  setExpenseType: (v: string) => void;
  customExpenseType: string;
  setCustomExpenseType: (v: string) => void;
  expenseAmount: string;
  setExpenseAmount: (v: string) => void;
  expenseNote: string;
  setExpenseNote: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const {
    visible,
    accessoryId,
    allowAutoFocus,
    expenseTypes,
    useCustomType,
    setUseCustomType,
    expenseType,
    setExpenseType,
    customExpenseType,
    setCustomExpenseType,
    expenseAmount,
    setExpenseAmount,
    expenseNote,
    setExpenseNote,
    onClose,
    onSave,
  } = props;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Add Expense</Text>

          <View style={styles.rowBetween}>
            <Pressable style={[styles.smallBtn, !useCustomType && styles.smallBtnActive]} onPress={() => setUseCustomType(false)}>
              <Text style={styles.smallBtnText}>Preset</Text>
            </Pressable>
            <Pressable style={[styles.smallBtn, useCustomType && styles.smallBtnActive]} onPress={() => setUseCustomType(true)}>
              <Text style={styles.smallBtnText}>Custom</Text>
            </Pressable>
          </View>

          {!useCustomType ? (
            <View style={styles.chipGrid}>
              {expenseTypes.map((t) => (
                <Pressable
                  key={t}
                  style={[styles.chip, expenseType === t && styles.chipActive]}
                  onPress={() => setExpenseType(t)}
                >
                  <Text style={[styles.chipText, expenseType === t && styles.chipTextActive]}>{t}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <>
              <Text style={styles.modalLabel}>Type</Text>
              <TextInput
                value={customExpenseType}
                onChangeText={setCustomExpenseType}
                style={styles.input}
                placeholder="e.g., toll, parking"
              />
            </>
          )}

          <Text style={styles.modalLabel}>Amount</Text>
          <TextInput
            value={expenseAmount}
            onChangeText={setExpenseAmount}
            style={styles.input}
            placeholder="0"
            keyboardType="number-pad"
            inputAccessoryViewID={accessoryId}
            autoFocus={allowAutoFocus}
          />

          <Text style={styles.modalLabel}>Note</Text>
          <TextInput
            value={expenseNote}
            onChangeText={setExpenseNote}
            style={styles.input}
            placeholder="Optional"
            inputAccessoryViewID={accessoryId}
          />

          {Platform.OS === "ios" && accessoryId ? (
            <InputAccessoryView nativeID={accessoryId}>
              <View style={styles.accessory}>
                <Pressable onPress={() => Keyboard.dismiss()} style={styles.accessoryBtn}>
                  <Text style={styles.accessoryBtnText}>Done</Text>
                </Pressable>
              </View>
            </InputAccessoryView>
          ) : null}

          <View style={styles.rowBetween}>
            <Pressable style={[styles.primaryBtn, styles.secondaryBtn]} onPress={onClose}>
              <Text style={styles.primaryBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={onSave}>
              <Text style={styles.primaryBtnText}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function RefillEditModal({
  visible,
  date,
  entry,
  snapshots,
  prices,
  onClose,
}: {
  visible: boolean;
  date: string | null;
  entry: RefillEntry | null;
  snapshots: { start: NormalizedSnapshot | null; end: NormalizedSnapshot | null };
  prices: { buy12: number; buy48: number };
  onClose: () => void;
}) {
  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Refill (preview)</Text>
          <Text style={styles.meta}>Date: {date}</Text>
          {entry ? (
            <>
              <Text style={styles.subCardRow}>
                12kg buy/ret: {entry.buy12}/{entry.ret12} (buy ? {prices.buy12})
              </Text>
              <Text style={styles.subCardRow}>
                48kg buy/ret: {entry.buy48}/{entry.ret48} (buy ? {prices.buy48})
              </Text>
              <View style={{ height: 10 }} />
              <Text style={styles.modalLabel}>Before</Text>
              <Text style={styles.subCardRow}>
                12: {snapshots.start ? `${snapshots.start.full12}/${snapshots.start.empty12}` : "-"} · 48:{" "}
                {snapshots.start ? `${snapshots.start.full48}/${snapshots.start.empty48}` : "-"}
              </Text>
              <Text style={styles.modalLabel}>After</Text>
              <Text style={styles.subCardRow}>
                12: {snapshots.end ? `${snapshots.end.full12}/${snapshots.end.empty12}` : "-"} · 48:{" "}
                {snapshots.end ? `${snapshots.end.full48}/${snapshots.end.empty48}` : "-"}
              </Text>
              <Text style={styles.meta}>
                (Editing UI can be reconnected to your existing refill update flow; this placeholder prevents bundling issues.)
              </Text>
            </>
          ) : (
            <Text style={styles.meta}>No refill data.</Text>
          )}

          <View style={styles.rowBetween}>
            <Pressable style={styles.primaryBtn} onPress={onClose}>
              <Text style={styles.primaryBtnText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function V2Timeline({
  date,
  events,
  formatMoney,
  formatCount,
}: {
  date: string;
  events: any[];
  inventoryStart: any;
  formatMoney: (v: number) => string;
  formatCount: (v: number) => string;
}) {
  const [openEvents, setOpenEvents] = useState<string[]>([]);

  const getEventColor = (eventType: string) => {
    const palette: Record<string, string> = {
      order: "#0a7ea4",
      refill: "#f97316",
      expense: "#16a34a",
      init: "#8b5cf6",
      adjust: "#64748b",
      collection_money: "#22c55e",
      collection_empty: "#14b8a6",
    };
    return palette[eventType] ?? "#0a7ea4";
  };

  const normalizedEvents = useMemo(() => {
    const merged: any[] = [];
    const initMap = new Map<string, any>();

    const mergeInventory = (target: any, source: any) => {
      if (!source) return target;
      const next = target ? { ...target } : {};
      ["full12", "empty12", "full48", "empty48"].forEach((key) => {
        if (next[key] == null && source[key] != null) {
          next[key] = source[key];
        }
      });
      return next;
    };

    events.forEach((ev) => {
      const eventType = String(ev?.event_type ?? ev?.type ?? ev?.source_type ?? "event");
      if (eventType !== "init") {
        merged.push(ev);
        return;
      }
      const key = `init:${ev?.effective_at ?? ev?.created_at ?? ""}`;
      const existing = initMap.get(key);
      if (!existing) {
        initMap.set(key, { ...ev });
        return;
      }
      existing.inventory_before = mergeInventory(existing.inventory_before, ev?.inventory_before);
      existing.inventory_after = mergeInventory(existing.inventory_after, ev?.inventory_after);
      if (!existing.gas_type) {
        existing.gas_type = ev?.gas_type;
      }
    });

    merged.push(...initMap.values());
    return merged;
  }, [events]);

  const sortedEvents = useMemo(() => {
    const getTime = (value?: string) => {
      if (!value) return 0;
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    };
    return [...normalizedEvents].sort((a, b) => {
      const aTime = getTime(a?.effective_at ?? a?.created_at);
      const bTime = getTime(b?.effective_at ?? b?.created_at);
      return bTime - aTime;
    });
  }, [normalizedEvents]);

  const getOrderQtyLabel = (ev: any) => {
    const gasType = ev?.gas_type;
    if (!gasType) return null;
    const before =
      gasType === "12kg" ? ev?.inventory_before?.full12 : gasType === "48kg" ? ev?.inventory_before?.full48 : null;
    const after =
      gasType === "12kg" ? ev?.inventory_after?.full12 : gasType === "48kg" ? ev?.inventory_after?.full48 : null;
    if (typeof before !== "number" || typeof after !== "number") return null;
    const qty = Math.abs(after - before);
    if (!qty) return null;
    return `${qty} x ${gasType}`;
  };

  const renderInventorySection = (
    label: string,
    accent: string,
    before: { full?: number | null; empty?: number | null },
    after: { full?: number | null; empty?: number | null },
    missing?: number | null,
    showSingle?: boolean
  ) => {
    const showFull = typeof before.full === "number" && typeof after.full === "number";
    const showEmpty = typeof before.empty === "number" && typeof after.empty === "number";
    const showMissing = typeof missing === "number";
    if (!showFull && !showEmpty && !showMissing) return null;
    const deltaFull = showFull ? (after.full ?? 0) - (before.full ?? 0) : 0;
    const deltaEmpty = showEmpty ? (after.empty ?? 0) - (before.empty ?? 0) : 0;
    const hasPair = showFull && showEmpty;
    const pairMatch = hasPair && Math.abs(deltaFull) === Math.abs(deltaEmpty);
    const pairValueStyle = hasPair ? (pairMatch ? styles.deltaValueGood : styles.deltaValueBad) : undefined;
    const missingOk = typeof missing === "number" ? missing <= 0 : null;
    const badgeTone = missingOk == null ? undefined : missingOk ? "good" : "bad";
    return (
      <View style={styles.eventSection}>
        <View style={styles.eventSectionHeader}>
          <View style={[styles.eventSectionDot, { backgroundColor: accent }]} />
          <Text style={styles.eventSectionTitle}>{label}</Text>
        </View>
        <View style={styles.inventoryRow}>
          {showFull ? (
            <DeltaBox
              label="Full"
              before={before.full ?? 0}
              after={after.full ?? 0}
              format={formatCount}
              accent={accent}
              compact
              badgeTone={badgeTone}
              singleValue={showSingle ? (after.full ?? 0) : undefined}
            />
          ) : null}
          {showEmpty ? (
            <DeltaBox
              label="Empty"
              before={before.empty ?? 0}
              after={after.empty ?? 0}
              format={formatCount}
              accent={accent}
              compact
              badgeTone={badgeTone}
              singleValue={showSingle ? (after.empty ?? 0) : undefined}
            />
          ) : null}
          {showMissing ? (
            <ValueBox
              label="Missing"
              value={missing && missing > 0 ? formatCount(missing) : "OK"}
              valueStyle={missing && missing > 0 ? styles.valueBoxValueBad : styles.valueBoxValueOk}
              compact
            />
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View>
      <Text style={styles.subCardTitle}>Events ({sortedEvents.length})</Text>
      {sortedEvents.map((ev, idx) => {
        const eventType = String(ev?.event_type ?? ev?.type ?? ev?.source_type ?? "event");
        const eventTitle = formatEventType(eventType);
        const eventKey = `${date}-ev-${idx}-${ev?.source_id ?? ev?.id ?? ""}`;
        const isOpenEvent = openEvents.includes(eventKey);
        const formatEventDateTime = (value: string) => {
          if (!value) return "";
          const dt = new Date(value);
          if (Number.isNaN(dt.getTime())) return value;
          const year = dt.getFullYear();
          const month = String(dt.getMonth() + 1).padStart(2, "0");
          const day = String(dt.getDate()).padStart(2, "0");
          const hours = String(dt.getHours()).padStart(2, "0");
          const minutes = String(dt.getMinutes()).padStart(2, "0");
          return `${year}-${month}-${day} ${hours}:${minutes}`;
        };
        const eventTimeRaw =
          eventType === "order"
            ? ev?.delivered_at ?? ev?.effective_at ?? ev?.created_at ?? ""
            : eventType === "refill"
              ? isOpenEvent
                ? ev?.created_at ?? ev?.effective_at ?? ""
                : ev?.effective_at ?? ev?.created_at ?? ""
              : eventType === "expense"
                ? ev?.created_at ?? ev?.effective_at ?? ""
              : ev?.effective_at ?? ev?.created_at ?? "";
        const eventTime = formatEventDateTime(eventTimeRaw);
        const createdAtTime = formatEventDateTime(ev?.created_at ?? "");
        const hasDescription =
          typeof ev?.customer_description === "string" && ev.customer_description.trim().length > 0;
        const gasTypeLabel = ev?.gas_type ?? "";
        const orderTotal = typeof ev?.order_total === "number" ? ev.order_total : 0;
        const orderPaid =
          typeof ev?.order_paid === "number"
            ? ev.order_paid
            : typeof ev?.cash_before === "number" && typeof ev?.cash_after === "number"
              ? ev.cash_after - ev.cash_before
              : 0;
        const collectionAmount = Number(
          ev?.collection_amount ??
            ev?.amount_money ??
            ev?.amount ??
            ev?.order_paid ??
            0
        );
        const collectionQty12 = Number(ev?.collection_qty_12kg ?? ev?.qty_12kg ?? 0);
        const collectionQty48 = Number(ev?.collection_qty_48kg ?? ev?.qty_48kg ?? 0);
        const orderUnpaid = Math.max(orderTotal - orderPaid, 0);
        const orderCredit = Math.max(orderPaid - orderTotal, 0);
        const orderMissingCyl =
          typeof ev?.order_installed === "number" && typeof ev?.order_received === "number"
            ? Math.max(ev.order_installed - ev.order_received, 0)
            : 0;
        const orderCylCredit =
          typeof ev?.order_installed === "number" && typeof ev?.order_received === "number"
            ? Math.max(ev.order_received - ev.order_installed, 0)
            : 0;
        const installed =
          typeof ev?.order_installed === "number"
            ? ev.order_installed
            : typeof ev?.cylinders_installed === "number"
              ? ev.cylinders_installed
              : 0;
        const received =
          typeof ev?.order_received === "number"
            ? ev.order_received
            : typeof ev?.cylinders_received === "number"
              ? ev.cylinders_received
              : 0;
        const refillTotal = typeof ev?.total_cost === "number" ? ev.total_cost : 0;
        const refillPaid = typeof ev?.paid_now === "number" ? ev.paid_now : 0;
        const refillUnpaid = Math.max(refillTotal - refillPaid, 0);
        const refillCredit12 =
          typeof ev?.buy12 === "number" && typeof ev?.return12 === "number"
            ? Math.max(ev.return12 - ev.buy12, 0)
            : 0;
        const refillCredit48 =
          typeof ev?.buy48 === "number" && typeof ev?.return48 === "number"
            ? Math.max(ev.return48 - ev.buy48, 0)
            : 0;

        const invBefore = ev?.inventory_before ?? {};
        const invAfter = ev?.inventory_after ?? {};
        const showInv12 =
          invBefore.full12 != null ||
          invBefore.empty12 != null ||
          invAfter.full12 != null ||
          invAfter.empty12 != null;
        const showInv48 =
          invBefore.full48 != null ||
          invBefore.empty48 != null ||
          invAfter.full48 != null ||
          invAfter.empty48 != null;
        const orderMissing = orderMissingCyl > 0 ? orderMissingCyl : null;
        const cashBeforeNum = Number(ev?.cash_before);
        const cashAfterNum = Number(ev?.cash_after);
        const cashDelta =
          Number.isFinite(cashBeforeNum) && Number.isFinite(cashAfterNum)
            ? cashAfterNum - cashBeforeNum
            : null;
        const invEmpty12Before =
          typeof invBefore?.empty12 === "number"
            ? invBefore.empty12
            : Number(ev?.inv12_empty_before ?? 0);
        const invEmpty12After =
          typeof invAfter?.empty12 === "number"
            ? invAfter.empty12
            : Number(ev?.inv12_empty_after ?? 0);
        const invEmpty48Before =
          typeof invBefore?.empty48 === "number"
            ? invBefore.empty48
            : Number(ev?.inv48_empty_before ?? 0);
        const invEmpty48After =
          typeof invAfter?.empty48 === "number"
            ? invAfter.empty48
            : Number(ev?.inv48_empty_after ?? 0);
        const hasInvEmpty12 = Number.isFinite(invEmpty12Before) && Number.isFinite(invEmpty12After);
        const hasInvEmpty48 = Number.isFinite(invEmpty48Before) && Number.isFinite(invEmpty48After);
        const collectionEmpty12Delta = hasInvEmpty12 ? invEmpty12After - invEmpty12Before : 0;
        const collectionEmpty48Delta = hasInvEmpty48 ? invEmpty48After - invEmpty48Before : 0;
        const collectionEmpty12Display = hasInvEmpty12 ? collectionEmpty12Delta : collectionQty12;
        const collectionEmpty48Display = hasInvEmpty48 ? collectionEmpty48Delta : collectionQty48;
        const orderPaidForCash = typeof orderPaid === "number" ? orderPaid : cashDelta;
        const orderUnpaidForCash =
          typeof orderTotal === "number" && typeof orderPaidForCash === "number"
            ? Math.max(orderTotal - orderPaidForCash, 0)
            : null;
        const cashBadgeTone =
          typeof cashDelta === "number" && typeof orderTotal === "number"
            ? Math.abs(cashDelta) < orderTotal
              ? "bad"
              : "good"
            : undefined;
        const refillCashBadgeTone =
          typeof cashDelta === "number" && typeof ev?.total_cost === "number"
            ? Math.abs(cashDelta) < ev.total_cost
              ? "bad"
              : "good"
            : undefined;
        const refillMissing12 =
          eventType === "refill" && (typeof ev?.buy12 === "number" || typeof ev?.return12 === "number")
            ? Math.max((ev?.buy12 ?? 0) - (ev?.return12 ?? 0), 0)
            : null;
        const refillMissing48 =
          eventType === "refill" && (typeof ev?.buy48 === "number" || typeof ev?.return48 === "number")
            ? Math.max((ev?.buy48 ?? 0) - (ev?.return48 ?? 0), 0)
            : null;

        const isOrderLike =
          eventType === "order" || eventType === "collection_money" || eventType === "collection_empty";

        return (
          <Pressable
            key={`${date}-ev-${idx}`}
            onPress={() => {
              setOpenEvents((prev) =>
                prev.includes(eventKey) ? prev.filter((key) => key !== eventKey) : [...prev, eventKey]
              );
            }}
            style={({ pressed }) => [styles.eventCard, pressed && styles.cardPressed]}
          >
            <View style={styles.eventHeader}>
              {isOrderLike ? (
                <>
                  <View style={styles.eventHeaderLeft}>
                    <Text style={[styles.eventCustomerName, styles.eventCustomerNameTight]}>
                      {ev?.customer_name ?? "Unknown"}
                    </Text>
                    {hasDescription ? (
                      <Text style={[styles.eventMetaSmall, styles.eventMetaSmallTight]}>
                        {ev.customer_description}
                      </Text>
                    ) : null}
                    {eventType === "order" ? (
                      <Text style={[styles.eventMetaSmall, !hasDescription && styles.eventMetaSmallTight]}>
                        {(ev?.system_type ?? ev?.system_name ?? "Unknown")} | {getOrderQtyLabel(ev) ?? ev?.gas_type ?? "N/A"}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.eventHeaderRightStack}>
                    <View style={styles.eventTimePill}>
                      <Text style={styles.eventTimeText}>{eventTime}</Text>
                    </View>
                    <View style={[styles.eventTypePill, { backgroundColor: getEventColor(eventType) }]}>
                      <Text style={styles.eventTypePillText}>{eventTitle}</Text>
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <View style={[styles.eventTypePill, { backgroundColor: getEventColor(eventType) }]}>
                    <Text style={styles.eventTypePillText}>{eventTitle}</Text>
                  </View>
                  <View style={styles.eventHeaderRight}>
                    <View style={styles.eventTimePill}>
                      <Text style={styles.eventTimeText}>{eventTime}</Text>
                    </View>
                  </View>
                </>
              )}
            </View>

            {eventType === "refill" ? (
              <View style={styles.eventMetaBlock}>
                <Text style={styles.eventCustomerName}>Refill</Text>
              </View>
            ) : null}

            {ev?.reason && (eventType !== "order" || String(ev.reason).toLowerCase() !== "order") ? (
              <View style={styles.eventMetaBlock}>
                <Text style={styles.eventMetaSmall}>{ev.reason}</Text>
              </View>
            ) : null}

            {eventType === "order" ? (
              <>
                <View style={styles.eventSummaryRow}>
                  <Text style={[styles.eventSummaryLine, styles.eventSummaryLeft]}>
                    installed {formatCount(installed)} | received {formatCount(received)}
                  </Text>
                  {(orderMissingCyl > 0 || orderCylCredit > 0) ? (
                    <Text style={[styles.eventSummaryLine, styles.eventSummaryAlert, styles.eventSummaryRight]}>
                      {orderMissingCyl > 0 ? `missing ${formatCount(orderMissingCyl)}` : null}
                      {orderMissingCyl > 0 && orderCylCredit > 0 ? " | " : null}
                      {orderCylCredit > 0 ? `credit ${formatCount(orderCylCredit)}` : null}
                    </Text>
                  ) : null}
                </View>
                <View style={[styles.eventSummaryRow, styles.eventSummaryRowTight]}>
                  <Text style={[styles.eventSummaryLine, styles.eventSummaryLeft]}>
                    total {formatMoney(orderTotal)} | paid {formatMoney(orderPaidForCash ?? 0)}
                  </Text>
                  {(orderUnpaid > 0 || orderCredit > 0) ? (
                    <Text style={[styles.eventSummaryLine, styles.eventSummaryAlert, styles.eventSummaryRight]}>
                      {orderUnpaid > 0 ? `unpaid ${formatMoney(orderUnpaid)}` : null}
                      {orderUnpaid > 0 && orderCredit > 0 ? " | " : null}
                      {orderCredit > 0 ? `credit ${formatMoney(orderCredit)}` : null}
                    </Text>
                  ) : null}
                </View>
              </>
            ) : null}

            {eventType === "collection_money" ? (
              <View style={styles.eventSummaryRow}>
                <Text style={[styles.eventSummaryLine, styles.eventSummaryLeft]}>
                  paid {formatMoney(
                    typeof cashDelta === "number" ? cashDelta : collectionAmount
                  )}
                </Text>
              </View>
            ) : null}

            {eventType === "collection_empty" ? (
              <View style={styles.eventSummaryRow}>
                  <Text style={[styles.eventSummaryLine, styles.eventSummaryLeft]}>
                    <Text style={{ color: gasColor("12kg") }}>
                    received {formatCount(collectionEmpty12Display)} x 12kg
                    </Text>
                    {" | "}
                    <Text style={{ color: gasColor("48kg") }}>
                    received {formatCount(collectionEmpty48Display)} x 48kg
                    </Text>
                  </Text>
                </View>
              ) : null}

            {eventType === "refill" ? (
              <>
                <Text style={[styles.eventSummaryLine, { color: gasColor("12kg") }]}>
                  12kg bought {formatCount(ev?.buy12 ?? 0)} | returned {formatCount(ev?.return12 ?? 0)} | missing {formatCount(refillMissing12 ?? 0)} | credit {formatCount(refillCredit12)}
                </Text>
                <Text style={[styles.eventSummaryLine, { color: gasColor("48kg") }]}>
                  48kg bought {formatCount(ev?.buy48 ?? 0)} | returned {formatCount(ev?.return48 ?? 0)} | missing {formatCount(refillMissing48 ?? 0)} | credit {formatCount(refillCredit48)}
                </Text>
                <Text style={styles.eventSummaryLine}>
                  total {formatMoney(refillTotal)} | paid {formatMoney(refillPaid)} | unpaid {formatMoney(refillUnpaid)} | credit {formatMoney(refillPaid > refillTotal ? refillPaid - refillTotal : 0)}
                </Text>
              </>
            ) : null}

            {eventType === "expense" ? (
              <Text style={styles.eventSummaryLine}>
                total {formatMoney(ev?.amount ?? 0)} | paid {formatMoney(ev?.amount ?? 0)} | unpaid 0 | credit 0
              </Text>
            ) : null}

            {isOpenEvent ? (
              <>
                {eventType === "order" ? (
                  <View style={styles.eventExpandedRow}>
                    <DeltaBox
                      label={`${ev?.gas_type ?? "12kg"} F`}
                      before={ev?.gas_type === "48kg" ? invBefore.full48 ?? 0 : invBefore.full12 ?? 0}
                      after={ev?.gas_type === "48kg" ? invAfter.full48 ?? 0 : invAfter.full12 ?? 0}
                      format={formatCount}
                      accent={gasColor(ev?.gas_type ?? "12kg")}
                      compact
                    />
                    <DeltaBox
                      label={`${ev?.gas_type ?? "12kg"} E`}
                      before={ev?.gas_type === "48kg" ? invBefore.empty48 ?? 0 : invBefore.empty12 ?? 0}
                      after={ev?.gas_type === "48kg" ? invAfter.empty48 ?? 0 : invAfter.empty12 ?? 0}
                      format={formatCount}
                      accent={gasColor(ev?.gas_type ?? "12kg")}
                      compact
                    />
                    <DeltaBox
                      label="Cash"
                      before={ev?.cash_before ?? 0}
                      after={ev?.cash_after ?? 0}
                      format={formatMoney}
                      smallDelta
                      compact
                      badgeTone={cashBadgeTone}
                    />
                  </View>
                ) : null}

                {eventType === "collection_money" || eventType === "collection_empty" ? (
                  <View style={styles.eventExpandedRow}>
                    <DeltaBox
                      label="12kg E"
                      before={invEmpty12Before}
                      after={invEmpty12After}
                      format={formatCount}
                      accent={gasColor("12kg")}
                      compact
                    />
                    <DeltaBox
                      label="48kg E"
                      before={invEmpty48Before}
                      after={invEmpty48After}
                      format={formatCount}
                      accent={gasColor("48kg")}
                      compact
                    />
                    <DeltaBox
                      label="Cash"
                      before={ev?.cash_before ?? 0}
                      after={ev?.cash_after ?? 0}
                      format={formatMoney}
                      smallDelta
                      compact
                      badgeTone={cashBadgeTone}
                    />
                  </View>
                ) : null}

                {eventType === "refill" ? (
                  <>
                    <View style={styles.eventExpandedRow}>
                      <DeltaBox
                        label="12kg F"
                        before={invBefore.full12 ?? 0}
                        after={invAfter.full12 ?? 0}
                        format={formatCount}
                        accent={gasColor("12kg")}
                        compact
                      />
                      <DeltaBox
                        label="12kg E"
                        before={invBefore.empty12 ?? 0}
                        after={invAfter.empty12 ?? 0}
                        format={formatCount}
                        accent={gasColor("12kg")}
                        compact
                      />
                    </View>
                    <View style={styles.eventExpandedRow}>
                      <DeltaBox
                        label="48kg F"
                        before={invBefore.full48 ?? 0}
                        after={invAfter.full48 ?? 0}
                        format={formatCount}
                        accent={gasColor("48kg")}
                        compact
                      />
                      <DeltaBox
                        label="48kg E"
                        before={invBefore.empty48 ?? 0}
                        after={invAfter.empty48 ?? 0}
                        format={formatCount}
                        accent={gasColor("48kg")}
                        compact
                      />
                    </View>
                    <View style={styles.eventExpandedRow}>
                      <DeltaBox
                        label="Cash"
                        before={ev?.cash_before ?? 0}
                        after={ev?.cash_after ?? 0}
                        format={formatMoney}
                        smallDelta
                        compact
                        badgeTone={refillCashBadgeTone}
                      />
                    </View>
                  </>
                ) : null}

                {createdAtTime ? (
                  <Text style={styles.eventCreatedAtText}>created {createdAtTime}</Text>
                ) : null}
              </>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function formatEventType(type: string) {
  if (type === "collection_money") return "Coll M";
  if (type === "collection_empty") return "Coll C";
  if (type === "init_balance") return "Init Co";
  if (type === "init_credit") return "Init Cr";
  if (type === "init_return") return "Init Ret";
  return type
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function summarizeOrderEvents(events: any[]) {
  const summary = {
    sold12: 0,
    missing12: 0,
    credit12: 0,
    sold48: 0,
    missing48: 0,
    credit48: 0,
    total: 0,
    paid: 0,
    missingCash: 0,
    creditCash: 0,
  };
  const perCustomerCyl12 = new Map<string, number>();
  const perCustomerCyl48 = new Map<string, number>();
  const perCustomerMoney = new Map<string, number>();
  events.forEach((ev) => {
    if (String(ev?.event_type ?? ev?.type ?? ev?.source_type) !== "order") return;
    const installed = typeof ev?.order_installed === "number" ? ev.order_installed : 0;
    const received = typeof ev?.order_received === "number" ? ev.order_received : 0;
    const missing = installed - received;
    const customerKey =
      (typeof ev?.customer_id === "string" && ev.customer_id) ||
      (typeof ev?.customer_name === "string" && ev.customer_name) ||
      `unknown:${ev?.source_id ?? ""}`;
    if (ev?.gas_type === "12kg") {
      summary.sold12 += installed;
      perCustomerCyl12.set(customerKey, (perCustomerCyl12.get(customerKey) ?? 0) + missing);
    }
    if (ev?.gas_type === "48kg") {
      summary.sold48 += installed;
      perCustomerCyl48.set(customerKey, (perCustomerCyl48.get(customerKey) ?? 0) + missing);
    }
    const orderTotal = typeof ev?.order_total === "number" ? ev.order_total : 0;
    const orderPaid = typeof ev?.order_paid === "number" ? ev.order_paid : 0;
    summary.total += orderTotal;
    summary.paid += orderPaid;
    perCustomerMoney.set(customerKey, (perCustomerMoney.get(customerKey) ?? 0) + (orderTotal - orderPaid));
  });
  perCustomerCyl12.forEach((net) => {
    if (net > 0) summary.missing12 += net;
    if (net < 0) summary.credit12 += Math.abs(net);
  });
  perCustomerCyl48.forEach((net) => {
    if (net > 0) summary.missing48 += net;
    if (net < 0) summary.credit48 += Math.abs(net);
  });
  perCustomerMoney.forEach((net) => {
    if (net > 0) summary.missingCash += net;
    if (net < 0) summary.creditCash += Math.abs(net);
  });
  return summary;
}

function summarizeDayNet(events: any[]) {
  const perCustomerMoney = new Map<string, number>();
  const perCustomerCyl12 = new Map<string, number>();
  const perCustomerCyl48 = new Map<string, number>();

  const addNet = (map: Map<string, number>, key: string, delta: number) => {
    map.set(key, (map.get(key) ?? 0) + delta);
  };

  events.forEach((ev) => {
    const eventType = String(ev?.event_type ?? ev?.type ?? ev?.source_type);
    const customerKey =
      (typeof ev?.customer_id === "string" && ev.customer_id) ||
      (typeof ev?.customer_name === "string" && ev.customer_name) ||
      `unknown:${ev?.source_id ?? ""}`;

    if (eventType === "order") {
      const installed = typeof ev?.order_installed === "number" ? ev.order_installed : 0;
      const received = typeof ev?.order_received === "number" ? ev.order_received : 0;
      const missing = installed - received;
      if (ev?.gas_type === "12kg") addNet(perCustomerCyl12, customerKey, missing);
      if (ev?.gas_type === "48kg") addNet(perCustomerCyl48, customerKey, missing);

      const orderTotal = typeof ev?.order_total === "number" ? ev.order_total : 0;
      const orderPaid = typeof ev?.order_paid === "number" ? ev.order_paid : 0;
      addNet(perCustomerMoney, customerKey, orderTotal - orderPaid);
      return;
    }

    if (eventType === "collection_money") {
      const cashBefore = typeof ev?.cash_before === "number" ? ev.cash_before : null;
      const cashAfter = typeof ev?.cash_after === "number" ? ev.cash_after : null;
      const delta =
        cashBefore != null && cashAfter != null
          ? cashAfter - cashBefore
          : typeof ev?.collection_amount === "number"
            ? ev.collection_amount
            : typeof ev?.amount_money === "number"
              ? ev.amount_money
              : 0;
      if (delta !== 0) addNet(perCustomerMoney, customerKey, -delta);
      return;
    }

    if (eventType === "collection_empty") {
      const invBefore = ev?.inventory_before ?? {};
      const invAfter = ev?.inventory_after ?? {};
      const empty12Before =
        typeof invBefore?.empty12 === "number"
          ? invBefore.empty12
          : typeof ev?.inv12_empty_before === "number"
            ? ev.inv12_empty_before
            : null;
      const empty12After =
        typeof invAfter?.empty12 === "number"
          ? invAfter.empty12
          : typeof ev?.inv12_empty_after === "number"
            ? ev.inv12_empty_after
            : null;
      const empty48Before =
        typeof invBefore?.empty48 === "number"
          ? invBefore.empty48
          : typeof ev?.inv48_empty_before === "number"
            ? ev.inv48_empty_before
            : null;
      const empty48After =
        typeof invAfter?.empty48 === "number"
          ? invAfter.empty48
          : typeof ev?.inv48_empty_after === "number"
            ? ev.inv48_empty_after
            : null;
      const delta12 =
        empty12Before != null && empty12After != null
          ? empty12After - empty12Before
          : typeof ev?.collection_qty_12kg === "number"
            ? ev.collection_qty_12kg
            : typeof ev?.qty_12kg === "number"
              ? ev.qty_12kg
              : 0;
      const delta48 =
        empty48Before != null && empty48After != null
          ? empty48After - empty48Before
          : typeof ev?.collection_qty_48kg === "number"
            ? ev.collection_qty_48kg
            : typeof ev?.qty_48kg === "number"
              ? ev.qty_48kg
              : 0;
      if (delta12 !== 0) addNet(perCustomerCyl12, customerKey, -delta12);
      if (delta48 !== 0) addNet(perCustomerCyl48, customerKey, -delta48);
    }
  });

  let newDebtCash = 0;
  let newDebt12 = 0;
  let newDebt48 = 0;
  let collectedCash = 0;
  let collected12 = 0;
  let collected48 = 0;
  perCustomerMoney.forEach((net) => {
    if (net > 0) newDebtCash += net;
    if (net < 0) collectedCash += Math.abs(net);
  });
  perCustomerCyl12.forEach((net) => {
    if (net > 0) newDebt12 += net;
    if (net < 0) collected12 += Math.abs(net);
  });
  perCustomerCyl48.forEach((net) => {
    if (net > 0) newDebt48 += net;
    if (net < 0) collected48 += Math.abs(net);
  });

  return {
    collectedCash,
    collected12,
    collected48,
    newDebtCash,
    newDebt12,
    newDebt48,
  };
}

type DaySummaryTotals = {
  newDebt: { cash: number; cyl12: number; cyl48: number };
  collections: { cash: number; cyl12: number; cyl48: number };
  business: { cash: number; cyl12: number; cyl48: number };
};

function scanDaySummary(events: any[]): DaySummaryTotals {
  const summary: DaySummaryTotals = {
    newDebt: { cash: 0, cyl12: 0, cyl48: 0 },
    collections: { cash: 0, cyl12: 0, cyl48: 0 },
    business: { cash: 0, cyl12: 0, cyl48: 0 },
  };

  events.forEach((ev) => {
    const eventType = String(ev?.event_type ?? ev?.type ?? ev?.source_type);

    if (eventType === "order") {
      const orderTotal = typeof ev?.order_total === "number" ? ev.order_total : 0;
      const orderPaid = typeof ev?.order_paid === "number" ? ev.order_paid : 0;
      const installed = typeof ev?.order_installed === "number" ? ev.order_installed : 0;
      const received = typeof ev?.order_received === "number" ? ev.order_received : 0;
      const moneyDelta = orderTotal - orderPaid;
      const cylDelta = installed - received;
      if (moneyDelta === 0 && cylDelta === 0) return;
      if (ev?.gas_type === "12kg") summary.newDebt.cyl12 += cylDelta;
      if (ev?.gas_type === "48kg") summary.newDebt.cyl48 += cylDelta;
      summary.newDebt.cash += moneyDelta;
      return;
    }

    if (eventType === "collection_money") {
      const cashBefore = typeof ev?.cash_before === "number" ? ev.cash_before : null;
      const cashAfter = typeof ev?.cash_after === "number" ? ev.cash_after : null;
      const delta =
        cashBefore != null && cashAfter != null
          ? cashAfter - cashBefore
          : typeof ev?.collection_amount === "number"
            ? ev.collection_amount
            : typeof ev?.amount_money === "number"
              ? ev.amount_money
              : 0;
      if (delta !== 0) summary.collections.cash += delta;
      return;
    }

    if (eventType === "collection_empty") {
      let qty12 = typeof ev?.collection_qty_12kg === "number" ? ev.collection_qty_12kg : 0;
      let qty48 = typeof ev?.collection_qty_48kg === "number" ? ev.collection_qty_48kg : 0;
      if (qty12 === 0) qty12 = typeof ev?.qty_12kg === "number" ? ev.qty_12kg : 0;
      if (qty48 === 0) qty48 = typeof ev?.qty_48kg === "number" ? ev.qty_48kg : 0;

      const invBefore = ev?.inventory_before ?? {};
      const invAfter = ev?.inventory_after ?? {};
      if (qty12 === 0 && typeof invBefore?.empty12 === "number" && typeof invAfter?.empty12 === "number") {
        qty12 = invAfter.empty12 - invBefore.empty12;
      }
      if (qty48 === 0 && typeof invBefore?.empty48 === "number" && typeof invAfter?.empty48 === "number") {
        qty48 = invAfter.empty48 - invBefore.empty48;
      }

      if (qty12 !== 0) summary.collections.cyl12 += qty12;
      if (qty48 !== 0) summary.collections.cyl48 += qty48;
      return;
    }

    if (eventType === "refill") {
      const buy12 = typeof ev?.buy12 === "number" ? ev.buy12 : 0;
      const ret12 = typeof ev?.return12 === "number" ? ev.return12 : 0;
      const buy48 = typeof ev?.buy48 === "number" ? ev.buy48 : 0;
      const ret48 = typeof ev?.return48 === "number" ? ev.return48 : 0;
      if (buy12 || ret12) summary.business.cyl12 += buy12 - ret12;
      if (buy48 || ret48) summary.business.cyl48 += buy48 - ret48;
      return;
    }

    if (eventType === "expense") {
      const cashBefore = typeof ev?.cash_before === "number" ? ev.cash_before : null;
      const cashAfter = typeof ev?.cash_after === "number" ? ev.cash_after : null;
      const delta = cashBefore != null && cashAfter != null ? cashAfter - cashBefore : 0;
      if (delta !== 0) summary.business.cash += delta;
      return;
    }

    if (eventType === "init_balance") {
      const companyBefore = typeof ev?.company_before === "number" ? ev.company_before : null;
      const companyAfter = typeof ev?.company_after === "number" ? ev.company_after : null;
      const delta = companyBefore != null && companyAfter != null ? companyAfter - companyBefore : 0;
      if (delta !== 0) summary.business.cash += delta;
      return;
    }

    if (eventType === "init" || eventType === "init_credit" || eventType === "init_return") {
      const gas = ev?.gas_type;
      const invBefore = ev?.inventory_before ?? {};
      const invAfter = ev?.inventory_after ?? {};
      let fullDelta = 0;
      let emptyDelta = 0;
      if (gas === "12kg") {
        const beforeFull = typeof invBefore?.full12 === "number" ? invBefore.full12 : null;
        const afterFull = typeof invAfter?.full12 === "number" ? invAfter.full12 : null;
        const beforeEmpty = typeof invBefore?.empty12 === "number" ? invBefore.empty12 : null;
        const afterEmpty = typeof invAfter?.empty12 === "number" ? invAfter.empty12 : null;
        if (beforeFull != null && afterFull != null) fullDelta = afterFull - beforeFull;
        if (beforeEmpty != null && afterEmpty != null) emptyDelta = afterEmpty - beforeEmpty;
        summary.business.cyl12 += fullDelta + emptyDelta;
      }
      if (gas === "48kg") {
        const beforeFull = typeof invBefore?.full48 === "number" ? invBefore.full48 : null;
        const afterFull = typeof invAfter?.full48 === "number" ? invAfter.full48 : null;
        const beforeEmpty = typeof invBefore?.empty48 === "number" ? invBefore.empty48 : null;
        const afterEmpty = typeof invAfter?.empty48 === "number" ? invAfter.empty48 : null;
        if (beforeFull != null && afterFull != null) fullDelta = afterFull - beforeFull;
        if (beforeEmpty != null && afterEmpty != null) emptyDelta = afterEmpty - beforeEmpty;
        summary.business.cyl48 += fullDelta + emptyDelta;
      }
    }
  });

  return summary;
}

function buildDaySummaryLines(
  summary: DaySummaryTotals,
  formatMoney: (value: number) => string,
  formatCount: (value: number) => string
) {
  const formatSignedCount = (value: number) => {
    if (value === 0) return "";
    const sign = value > 0 ? "+" : "-";
    return `${sign}${formatCount(Math.abs(value))}`;
  };
  const formatSignedMoney = (value: number) => {
    if (value === 0) return "";
    const sign = value > 0 ? "+" : "-";
    return `${sign}${formatMoney(Math.abs(value))}`;
  };
  const parts = (cash: number, cyl12: number, cyl48: number) => {
    const out: string[] = [];
    if (cyl12 !== 0) out.push(`${formatSignedCount(cyl12)}x 12kg`);
    if (cyl48 !== 0) out.push(`${formatSignedCount(cyl48)}x 48kg`);
    if (cash !== 0) out.push(`${formatSignedMoney(cash)}₪`);
    return out.length > 0 ? out.join(" | ") : null;
  };

  const lines: { label: string; color: string }[] = [];
  const debt = parts(summary.newDebt.cash, summary.newDebt.cyl12, summary.newDebt.cyl48);
  if (debt) lines.push({ label: `🔴 New Debt: ${debt}`, color: "#b91c1c" });

  const collections = parts(summary.collections.cash, summary.collections.cyl12, summary.collections.cyl48);
  if (collections) lines.push({ label: `🟢 Collections: ${collections}`, color: "#16a34a" });

  const business = parts(summary.business.cash, summary.business.cyl12, summary.business.cyl48);
  if (business) lines.push({ label: `🔵 Business Flow: ${business}`, color: "#0a7ea4" });

  return lines;
}

function DeltaBox({
  label,
  before,
  after,
  format,
  accent,
  smallDelta,
  compact,
  valueStyle,
  badgeTone,
  singleValue,
}: {
  label: string;
  before: number;
  after: number;
  format: (v: number) => string;
  accent?: string;
  smallDelta?: boolean;
  compact?: boolean;
  valueStyle?: any;
  badgeTone?: "good" | "bad";
  singleValue?: number;
}) {
  const delta = (after ?? 0) - (before ?? 0);
  const badgeStyle =
    badgeTone === "good"
      ? styles.deltaBadgePositive
      : badgeTone === "bad"
        ? styles.deltaBadgeNegative
        : delta >= 0
          ? styles.deltaBadgePositive
          : styles.deltaBadgeNegative;
  const showSingle = typeof singleValue === "number";
  return (
    <View style={[styles.deltaBox, accent ? { borderColor: accent } : null, compact && styles.deltaBoxCompact]}>
      <Text style={styles.deltaBoxLabel}>{label}</Text>
      <View
        style={[
          styles.deltaBadge,
          badgeStyle,
          smallDelta && styles.deltaBadgeSmall,
        ]}
      >
        <Text style={[styles.deltaBadgeText, smallDelta && styles.deltaBadgeTextSmall]}>{formatSigned(delta)}</Text>
      </View>
      <View style={styles.deltaBoxRow}>
        {showSingle ? (
          <Text style={[styles.deltaBoxValue, valueStyle]}>{format(singleValue)}</Text>
        ) : (
          <>
            <Text style={[styles.deltaBoxValue, valueStyle]}>{format(before ?? 0)}</Text>
            <Text style={styles.deltaBoxArrow}>{"->"}</Text>
            <Text style={[styles.deltaBoxValue, valueStyle]}>{format(after ?? 0)}</Text>
          </>
        )}
      </View>
    </View>
  );
}

function ValueBox({
  label,
  value,
  valueStyle,
  compact,
}: {
  label: string;
  value: string;
  valueStyle?: any;
  compact?: boolean;
}) {
  return (
    <View style={[styles.deltaBox, compact && styles.deltaBoxCompact]}>
      <Text style={styles.deltaBoxLabel}>{label}</Text>
      <View style={styles.valueBoxRow}>
        <Text style={[styles.valueBoxValue, valueStyle]}>{value}</Text>
      </View>
    </View>
  );
}

function summarizeRefillEvents(events: any[]) {
  const summary = {
    buy12: 0,
    ret12: 0,
    buy48: 0,
    ret48: 0,
    total: 0,
    paid: 0,
    unpaid: 0,
  };
  events.forEach((ev) => {
    if (String(ev?.event_type ?? ev?.type ?? ev?.source_type) !== "refill") return;
    const totalCost = typeof ev?.total_cost === "number" ? ev.total_cost : 0;
    const paidNow = typeof ev?.paid_now === "number" ? ev.paid_now : 0;
    summary.buy12 += typeof ev?.buy12 === "number" ? ev.buy12 : 0;
    summary.ret12 += typeof ev?.return12 === "number" ? ev.return12 : 0;
    summary.buy48 += typeof ev?.buy48 === "number" ? ev.buy48 : 0;
    summary.ret48 += typeof ev?.return48 === "number" ? ev.return48 : 0;
    summary.total += totalCost;
    summary.paid += paidNow;
  });
  summary.unpaid = summary.total - summary.paid;
  return summary;
}

function SummaryChip({
  label,
  labelLines,
  value,
  bad,
  compact,
}: {
  label?: string;
  labelLines?: string[];
  value: string;
  bad?: boolean;
  compact?: boolean;
}) {
  return (
    <View style={[styles.summaryChip, compact && styles.summaryChipCompact, bad && styles.summaryChipBad]}>
      {labelLines ? (
        <View style={styles.summaryChipLabelStack}>
          {labelLines.map((line, index) => (
            <Text key={`${line}-${index}`} style={styles.summaryChipLabelLine}>
              {line}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={styles.summaryChipLabel}>{label}</Text>
      )}
      <Text
        style={[
          styles.summaryChipValue,
          bad && styles.summaryChipValueBad,
          value === "OK" && styles.summaryChipValueOk,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function SummaryPill({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={[styles.topSummaryPill, accent ? { borderColor: accent } : null]}>
      <Text style={[styles.topSummaryLabel, accent ? { color: accent } : null]}>{label}</Text>
      <Text style={styles.topSummaryValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function summarizeEventTypes(events: any[]) {
  // Minimal: count by type/source_type
  const map = new Map<string, number>();
  events.forEach((ev) => {
    const t = String(ev?.event_type ?? ev?.type ?? ev?.source_type ?? "event");
    map.set(t, (map.get(t) ?? 0) + 1);
  });

  const labels: Record<string, string> = {
    order: "Order",
    refill: "Refill",
    expense: "Expense",
    init: "Init",
    adjust: "Adjust",
  };
  const palette = ["#0a7ea4", "#16a34a", "#f97316", "#8b5cf6", "#e0b93f", "#64748b"];
  const out = Array.from(map.entries()).map(([type, count], i) => ({
    type,
    label: `${labels[type] ?? type[0]?.toUpperCase() ?? type} ${count}`,
    color: palette[i % palette.length],
  }));
  return out.slice(0, 6);
}

function formatSigned(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}`;
}

function getInitInventoryAfter(events: any[]) {
  const out: { full12?: number; empty12?: number; full48?: number; empty48?: number } = {};
  events.forEach((ev) => {
    if (String(ev?.event_type ?? ev?.type ?? ev?.source_type) !== "init") return;
    const after = ev?.inventory_after ?? {};
    if (after.full12 != null) out.full12 = after.full12;
    if (after.empty12 != null) out.empty12 = after.empty12;
    if (after.full48 != null) out.full48 = after.full48;
    if (after.empty48 != null) out.empty48 = after.empty48;
  });
  return Object.keys(out).length ? out : null;
}

/* -----------------------------------------
 * Styles (minimal, consistent)
 * ----------------------------------------- */

const styles = StyleSheet.create({
  container: { flex: 1, padding: 14, backgroundColor: "#f6f7f9" },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 6, color: "#0f172a" },
  meta: { fontSize: 12, color: "#475569" },
  error: { fontSize: 12, color: "#b91c1c", marginTop: 6 },

  tabRow: { flexDirection: "row", gap: 8, marginTop: 10, marginBottom: 10, flexWrap: "wrap" },
  tabChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
  },
  tabChipActive: { backgroundColor: "#0a7ea4" },
  tabChipText: { fontSize: 12, color: "#0f172a", fontWeight: "600" },
  tabChipTextActive: { color: "white" },

  card: { backgroundColor: "white", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#e2e8f0" },
  cardPressed: { opacity: 0.92 },
  cardCollapsed: { backgroundColor: "white", borderColor: "#e2e8f0" },
  cardExpanded: { backgroundColor: "white", borderColor: "#e2e8f0" },

  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  date: { fontSize: 14, fontWeight: "700", color: "#0f172a" },

  statusRow: { flexDirection: "row", alignItems: "center" },
  statusBelow: { marginTop: 6 },
  statusText: { fontSize: 12, fontWeight: "700" },
  paid: { color: "#16a34a" },
  unpaid: { color: "#b91c1c" },

  orderMeta: { fontSize: 12, fontWeight: "600", color: "#0f172a" },

  expanded: { marginTop: 8, padding: 12, borderRadius: 14, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e2e8f0" },
  expandedTitle: { fontSize: 14, fontWeight: "800", color: "#0f172a", marginBottom: 8 },
  expandedPanel: { backgroundColor: "#eef6ff", borderColor: "#bfdbfe" },

  quickSummary: { backgroundColor: "#ffffff" },
  quickDetailsButton: { marginTop: 10, paddingVertical: 10, borderRadius: 10, backgroundColor: "#0a7ea4", alignItems: "center" },
  quickDetailsText: { color: "white", fontWeight: "800" },

  labeledRowGroupCard: { backgroundColor: "#ffffff" },
  labeledSection: { marginBottom: 10 },
  labeledHeader: { paddingLeft: 10, borderLeftWidth: 4, marginBottom: 6 },
  labeledHeaderText: { fontSize: 11, fontWeight: "900", color: "#334155" },
  labeledBody: { paddingLeft: 2 },

  v2Date: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  badgeRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  pendingBadge: { backgroundColor: "#fde68a", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  pendingBadgeText: { fontSize: 11, fontWeight: "800", color: "#78350f" },
  recalcBadge: { backgroundColor: "#dbeafe", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  recalcBadgeText: { fontSize: 11, fontWeight: "800", color: "#1d4ed8" },

  v2CashLabel: { fontSize: 12, fontWeight: "800", color: "#0f172a", marginBottom: 6 },
  v2InvCashRow: { marginTop: 10, flexDirection: "row", gap: 10, alignItems: "stretch" },
  v2InvCompactBox: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    justifyContent: "flex-start",
    minHeight: 120,
  },
  v2InvCompactLabel: { fontSize: 12, fontWeight: "900", marginBottom: 4 },
  v2InvCompactValue: { fontSize: 12, fontWeight: "800", color: "#0f172a", marginBottom: 8 },
  v2DeltaBlock: { marginBottom: 6 },
  v2CashBox: { flex: 1, padding: 10, borderRadius: 12, backgroundColor: "#f8fafc" },
  v2InvLabel: { fontSize: 12, fontWeight: "900", marginBottom: 6 },
  v2MetricLabelSmall: { fontSize: 12, fontWeight: "800" },

  v2EventSummaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  v2EventSummaryChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  v2EventSummaryText: { fontSize: 11, fontWeight: "900", color: "white" },
  collapsedSummaryLine: { color: "#0f172a", fontWeight: "700", marginTop: 6 },
  collapsedHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  collapsedLeft: { flex: 1, minWidth: 0 },
  collapsedSubtext: { fontSize: 11, fontWeight: "800", color: "#64748b", marginTop: 2 },
  collapsedRight: { alignItems: "flex-end", gap: 6, maxWidth: "48%", flexShrink: 1 },
  collapsedList: { marginTop: 2, gap: 4 },
  collapsedListItem: { fontSize: 12, fontWeight: "800", color: "#0f172a", flexWrap: "wrap" },
  missingInlineBox: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    alignItems: "flex-end",
    minWidth: 120,
    maxWidth: "100%",
  },
  missingMiniLabel: { fontSize: 10, fontWeight: "900", color: "#b91c1c", textAlign: "right" },
  missingMiniValue: { marginTop: 2, fontSize: 11, fontWeight: "900", color: "#b91c1c", textAlign: "right" },
  auditValue: { marginTop: 2, fontSize: 11, fontWeight: "600", color: "#1f2937", textAlign: "right" },
  auditAlert: { fontWeight: "900", color: "#b91c1c" },
  collapsedEventRow: { justifyContent: "flex-end", marginTop: 0, flexWrap: "wrap" },
  collapsedEventChip: { paddingHorizontal: 8, paddingVertical: 4 },

  problemLine: { marginTop: 8, fontSize: 12, fontWeight: "700", color: "#b91c1c" },

  v2DetailsRow: { marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  v2DetailsText: { fontSize: 12, fontWeight: "800", color: "#0a7ea4" },
  v2Timeline: { backgroundColor: "#ffffff" },

  topSummaryCard: {
    marginTop: 6,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  balancesCard: {
    backgroundColor: "white",
    borderColor: "#e2e8f0",
  },
  balanceSplitRow: { flexDirection: "row", gap: 12 },
  balanceColumn: { flex: 1, gap: 8 },
  balancePanelTitle: {
    fontSize: 12,
    fontWeight: "900",
    fontFamily: "AvenirNext-DemiBold",
    color: "#0f172a",
    marginBottom: 6,
  },
  balanceSectionLabel: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: "600",
    fontFamily: "AvenirNext-Regular",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  balanceEmpty: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "AvenirNext-Regular",
    color: "#94a3b8",
  },
  topSummaryTitle: { fontSize: 12, fontWeight: "900", color: "#0f172a", marginBottom: 10 },
  topSummaryTitleTight: { marginBottom: 0 },
  topSummaryToggle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  topSummaryRow: { flexDirection: "row", gap: 8 },
  adjustButtonRow: { marginTop: 10, flexDirection: "row", gap: 8 },
  adjustButton: {
    flex: 1,
    marginTop: 0,
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  adjustButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  adjustmentRow: {
    marginTop: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  adjustmentInfo: { flex: 1, paddingRight: 8 },
  adjustmentTitle: { fontSize: 12, fontWeight: "800", color: "#0f172a" },
  adjustmentReason: { marginTop: 2, fontSize: 11, color: "#64748b" },
  adjustmentActions: { flexDirection: "row", gap: 12 },
  relationshipRow: { flexDirection: "row", gap: 16 },
  relationshipColumn: { flex: 1, gap: 6 },
  relationshipLine: {
    color: "#0f172a",
    fontWeight: "600",
    fontFamily: "AvenirNext-Regular",
    fontSize: 12,
  },
  relationshipGood: { color: "#2563eb" },
  relationshipBad: { color: "#b91c1c" },
  topSummaryPill: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  topSummaryLabel: { fontSize: 10, fontWeight: "800", color: "#64748b" },
  topSummaryValue: { marginTop: 4, fontSize: 12, fontWeight: "900", color: "#0f172a" },

  summaryGrid: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  summaryChip: {
    flexGrow: 1,
    minWidth: 120,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  summaryChipCompact: { minWidth: 0, flex: 1 },
  summaryChipBad: { borderColor: "#fecaca", backgroundColor: "#fef2f2" },
  summaryChipLabel: { fontSize: 10, fontWeight: "800", color: "#334155" },
  summaryChipLabelStack: { gap: 2 },
  summaryChipLabelLine: { fontSize: 10, fontWeight: "800", color: "#334155", lineHeight: 12 },
  summaryChipValue: { marginTop: 6, fontSize: 12, fontWeight: "900", color: "#0f172a" },
  summaryChipValueOk: { color: "#16a34a" },
  summaryChipValueBad: { color: "#b91c1c" },
  summaryRow: { width: "100%", flexDirection: "row", gap: 8 },
  summaryToggleCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  summaryToggleHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryToggleTitle: { fontSize: 13, fontWeight: "900", color: "#0f172a" },
  summaryToggleBody: { marginTop: 12 },
  summaryTable: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  summaryRowLine: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  summaryHeaderRow: {
    backgroundColor: "#f1f5f9",
  },
  summaryCell: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#0f172a",
  },
  summaryHeaderCell: {
    fontSize: 10,
    fontWeight: "800",
    color: "#475569",
    textTransform: "uppercase",
  },
  summaryLabelCell: {
    fontWeight: "800",
  },
  summaryMissing: {
    color: "#b91c1c",
  },
  summaryCredit: {
    color: "#2563eb",
  },

  deltaRow: { flexDirection: "row", alignItems: "baseline", gap: 6, flexWrap: "nowrap" },
  deltaEndColumn: { alignItems: "flex-end" },
  deltaValueSm: { fontSize: 14, fontWeight: "900", color: "#0f172a" },
  deltaValueLg: { fontSize: 18, fontWeight: "900", color: "#0f172a" },
  deltaArrow: { fontSize: 14, fontWeight: "900", color: "#0a7ea4" },
  deltaMeta: { fontSize: 12, fontWeight: "800", color: "#475569" },

  metricRow: { marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  metricLabel: { fontSize: 12, fontWeight: "800", color: "#0f172a" },

  invTwin: { gap: 6 },
  invTwinRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  invTwinKey: { width: 50, fontSize: 12, fontWeight: "900", color: "#0f172a" },
  invTwinVal: { flex: 1, fontSize: 12, fontWeight: "800", color: "#334155" },
  invTwinDelta: { fontSize: 12, fontWeight: "900", color: "#0f172a" },

  invBlock: { padding: 10, borderRadius: 12, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0" },
  invBlockGrey: { backgroundColor: "#f1f5f9" },
  invBlockTitle: { fontSize: 12, fontWeight: "900", color: "#0f172a", marginBottom: 4 },
  invBlockLine: { fontSize: 12, fontWeight: "800", color: "#334155" },
  invBlockMeta: { marginTop: 6, fontSize: 11, color: "#64748b", fontWeight: "700" },

  table: { padding: 10, borderRadius: 12, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0" },
  tableExpanded: { backgroundColor: "#eef2ff" },
  tableRow: { fontSize: 12, fontWeight: "800", color: "#0f172a" },
  tableMeta: { marginTop: 6, fontSize: 11, color: "#64748b", fontWeight: "700" },

  subCard: { marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0" },
  subCardTitle: { fontSize: 12, fontWeight: "900", color: "#0f172a", marginBottom: 6 },
  subCardRow: { fontSize: 12, fontWeight: "800", color: "#334155" },

  eventCard: {
    marginTop: 10,
    paddingTop: 4,
    paddingBottom: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  eventHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 0 },
  eventHeaderTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  eventHeaderRight: { alignItems: "flex-end" },
  eventHeaderRightStack: { alignItems: "flex-end", gap: 4 },
  eventHeaderLeft: { flex: 1, rowGap: 4 },
  eventBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" },
  eventBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  eventBadgeOrder: { backgroundColor: "#2563eb" },
  eventBadgeRefill: { backgroundColor: "#f97316" },
  eventBadgeText: { color: "white", fontSize: 11, fontWeight: "900" },
  eventTypeText: { fontSize: 12, fontWeight: "900", color: "#0f172a" },
  eventLabelText: { fontSize: 11, fontWeight: "800", color: "#64748b" },
  eventTimePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  eventTimeText: { fontSize: 11, fontWeight: "800", color: "#475569" },
  eventMetaBlock: { marginTop: 4 },
  eventMetaBlockTight: { marginTop: -2 },
  eventMetaText: { fontSize: 12, fontWeight: "700", color: "#334155" },
  eventTypePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  eventTypePillText: { color: "white", fontSize: 12, fontWeight: "900" },
  eventCustomerName: { fontSize: 16, fontWeight: "900", color: "#0f172a", marginBottom: 0, lineHeight: 18 },
  eventCustomerNameTight: { marginTop: 0, marginBottom: 2 },
  eventMetaSmall: { fontSize: 12, fontWeight: "700", color: "#64748b", marginTop: 0, lineHeight: 14 },
  eventMetaSmallTight: { marginTop: 2 },
  eventSummaryLine: { marginTop: 0, fontSize: 12, fontWeight: "800", color: "#0f172a" },
  eventSummaryLeft: { flex: 1 },
  eventSummaryRight: { textAlign: "right" },
  eventSummaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginTop: 2 },
  eventSummaryRowTight: { marginTop: 0 },
  eventSummaryAlert: { color: "#b91c1c", marginTop: 0 },
  eventCreatedAtText: { marginTop: 6, fontSize: 11, fontWeight: "700", color: "#64748b" },
  eventExpandedRow: { flexDirection: "row", gap: 8, marginTop: 10 },

  eventSection: { marginTop: 10 },
  eventSectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  eventSectionDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: "#0a7ea4" },
  eventSectionTitle: { fontSize: 11, fontWeight: "900", color: "#0f172a" },

  deltaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  inventoryRow: { flexDirection: "row", gap: 8 },
  deltaBox: {
    position: "relative",
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5f5",
    backgroundColor: "#f8fafc",
    minWidth: 140,
    flexGrow: 1,
  },
  deltaBoxCompact: { minWidth: 0, flex: 1 },
  deltaBoxLabel: { fontSize: 11, fontWeight: "800", color: "#0f172a" },
  deltaBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#0f172a",
  },
  deltaBadgePositive: { backgroundColor: "#16a34a" },
  deltaBadgeNegative: { backgroundColor: "#b91c1c" },
  deltaBadgeSmall: { paddingHorizontal: 5, paddingVertical: 1 },
  deltaBadgeText: { fontSize: 11, fontWeight: "900", color: "white" },
  deltaBadgeTextSmall: { fontSize: 10 },
  deltaBoxRow: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  deltaBoxValue: { fontSize: 11, fontWeight: "900", color: "#0f172a" },
  deltaBoxArrow: { fontSize: 11, fontWeight: "900", color: "#0a7ea4" },
  deltaValueGood: { color: "#16a34a" },
  deltaValueBad: { color: "#b91c1c" },
  valueBoxRow: { marginTop: 10, alignItems: "center", justifyContent: "center", minHeight: 18 },
  valueBoxValue: { fontSize: 11, fontWeight: "900", color: "#0f172a" },
  valueBoxValueOk: { color: "#16a34a" },
  valueBoxValueBad: { color: "#b91c1c" },
  orderMoneyRow: { flexDirection: "row", gap: 8 },

  dayActions: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 10 },
  dayIconBtn: { padding: 6, borderRadius: 10, backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.35)", padding: 14, justifyContent: "flex-end" },
  modalCard: { backgroundColor: "white", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#e2e8f0" },
  modalTitle: { fontSize: 16, fontWeight: "900", color: "#0f172a", marginBottom: 10 },
  modalLabel: { marginTop: 10, fontSize: 12, fontWeight: "900", color: "#0f172a" },
  input: { marginTop: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0" },
  half: { width: "48%" },
  primaryBtn: { marginTop: 14, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: "#0a7ea4", flex: 1, alignItems: "center" },
  secondaryBtn: { backgroundColor: "#64748b", marginRight: 10 },
  primaryBtnText: { color: "white", fontWeight: "900" },

  smallBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: "#0a7ea4" },
  smallBtnDanger: { backgroundColor: "#b91c1c" },
  smallBtnActive: { backgroundColor: "#0f172a" },
  smallBtnText: { color: "white", fontWeight: "900", fontSize: 12 },

  expandedDivider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 8,
  },

  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: "#e2e8f0" },
  chipDisabled: { opacity: 0.6 },
  chipActive: { backgroundColor: "#0a7ea4" },
  chipText: { fontSize: 12, fontWeight: "800", color: "#0f172a" },
  chipTextActive: { color: "white" },

  // iOS accessory
  accessory: { backgroundColor: "#f1f5f9", padding: 8, borderTopWidth: 1, borderTopColor: "#e2e8f0", alignItems: "flex-end" },
  accessoryBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: "#0a7ea4" },
  accessoryBtnText: { color: "white", fontWeight: "900" },

  // Sync tooltip
  syncOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.35)", justifyContent: "center", padding: 20 },
  syncTooltip: { backgroundColor: "white", padding: 14, borderRadius: 14, borderWidth: 1, borderColor: "#e2e8f0" },
  syncTitle: { fontSize: 14, fontWeight: "900", color: "#0f172a" },
  syncText: { marginTop: 8, fontSize: 12, fontWeight: "700", color: "#334155" },
  syncClose: { marginTop: 12, alignSelf: "flex-end", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: "#0a7ea4" },
  syncCloseText: { color: "white", fontWeight: "900" },
});
