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
  View,
} from "react-native";

import { gasColor } from "@/constants/gas";
import { useCustomers } from "@/hooks/useCustomers";
import { useCreateExpense } from "@/hooks/useExpenses";
import { useAdjustInventory, useDeleteRefill, useInventoryRefills } from "@/hooks/useInventory";
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
  const balanceSummary = useMemo(() => {
    const customers = Array.isArray(customersQuery.data) ? customersQuery.data : [];
    let debt = 0;
    let credit = 0;
    let cylDebt12 = 0;
    let cylDebt48 = 0;
    let cylCredit12 = 0;
    let cylCredit48 = 0;
    customers.forEach((customer) => {
      const balance = Number(customer.money_balance || 0);
      if (balance > 0) debt += balance;
      if (balance < 0) credit += Math.abs(balance);
      const cyl12 = Number(customer.cylinder_balance_12kg || 0);
      const cyl48 = Number(customer.cylinder_balance_48kg || 0);
      if (cyl12 > 0) cylDebt12 += cyl12;
      if (cyl12 < 0) cylCredit12 += Math.abs(cyl12);
      if (cyl48 > 0) cylDebt48 += cyl48;
      if (cyl48 < 0) cylCredit48 += Math.abs(cyl48);
    });
    return {
      debt,
      credit,
      cylDebt12,
      cylDebt48,
      cylCredit12,
      cylCredit48,
    };
  }, [customersQuery.data]);

  const getLocalDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
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

  const companySummary = useMemo(() => {
    const latestWithPayable = (v2Rows ?? []).find((row) => Number(row?.company_end ?? 0) > 0);
    const payable = Number(latestWithPayable?.company_end ?? 0);
    let cylCredit12 = 0;
    let cylCredit48 = 0;
    let cylDebt12 = 0;
    let cylDebt48 = 0;
    const refills = Array.isArray(refillsQuery.data) ? refillsQuery.data : [];
    refills.forEach((entry: any) => {
      const buy12 = Number(entry?.buy12 ?? 0);
      const ret12 = Number(entry?.return12 ?? entry?.ret12 ?? 0);
      const buy48 = Number(entry?.buy48 ?? 0);
      const ret48 = Number(entry?.return48 ?? entry?.ret48 ?? 0);
      if (ret12 > buy12) cylCredit12 += ret12 - buy12;
      if (ret48 > buy48) cylCredit48 += ret48 - buy48;
      if (buy12 > ret12) cylDebt12 += buy12 - ret12;
      if (buy48 > ret48) cylDebt48 += buy48 - ret48;
    });
    return { payable, cylCredit12, cylCredit48, cylDebt12, cylDebt48 };
  }, [v2Rows, refillsQuery.data]);

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
        <Text style={styles.meta}>Today: {getLocalDateString()}</Text>

        {v2Query.isLoading && <Text style={styles.meta}>Loading...</Text>}
        {v2Query.error && <Text style={styles.error}>Failed to load reports.</Text>}

        <View style={styles.topSummaryCard}>
          <Text style={styles.topSummaryTitle}>Relationship Notes</Text>
          <View style={styles.relationshipRow}>
            <View style={styles.relationshipColumn}>
              {balanceSummary.debt > 0 ? (
                <Text style={styles.relationshipLine}>cstmr pay you {formatMoney(balanceSummary.debt)}₪</Text>
              ) : null}
              {balanceSummary.credit > 0 ? (
                <Text style={styles.relationshipLine}>you pay cstmr {formatMoney(balanceSummary.credit)}₪</Text>
              ) : null}
              {balanceSummary.cylDebt12 > 0 ? (
                <Text style={styles.relationshipLine}>cstmr give you {balanceSummary.cylDebt12}x 12kg</Text>
              ) : null}
              {balanceSummary.cylDebt48 > 0 ? (
                <Text style={styles.relationshipLine}>cstmr give you {balanceSummary.cylDebt48}x 48kg</Text>
              ) : null}
              {balanceSummary.cylCredit12 > 0 ? (
                <Text style={styles.relationshipLine}>you give cstmr {balanceSummary.cylCredit12}x 12kg</Text>
              ) : null}
              {balanceSummary.cylCredit48 > 0 ? (
                <Text style={styles.relationshipLine}>you give cstmr {balanceSummary.cylCredit48}x 48kg</Text>
              ) : null}
            </View>
            <View style={styles.relationshipColumn}>
              {companySummary.payable > 0 ? (
                <Text style={styles.relationshipLine}>you pay cmpy {formatMoney(companySummary.payable)}₪</Text>
              ) : null}
              {companySummary.cylCredit12 > 0 ? (
                <Text style={styles.relationshipLine}>cmpy give you {companySummary.cylCredit12}x 12kg</Text>
              ) : null}
              {companySummary.cylCredit48 > 0 ? (
                <Text style={styles.relationshipLine}>cmpy give you {companySummary.cylCredit48}x 48kg</Text>
              ) : null}
              {companySummary.cylDebt12 > 0 ? (
                <Text style={styles.relationshipLine}>you give cmpy {companySummary.cylDebt12}x 12kg</Text>
              ) : null}
              {companySummary.cylDebt48 > 0 ? (
                <Text style={styles.relationshipLine}>you give cmpy {companySummary.cylDebt48}x 48kg</Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.topSummaryCard}>
          <Text style={styles.topSummaryTitle}>Current Inventory</Text>
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
        </View>

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
                  {isOpen ? (
                    <>
                      <View style={styles.rowBetween}>
                        <Text style={styles.v2Date}>
                          {weekday}, {item.date}
                        </Text>

                        <View style={styles.badgeRow}>
                          {isToday(item.date) ? (
                            <View style={styles.pendingBadge}>
                              <Text style={styles.pendingBadgeText}>Pending</Text>
                            </View>
                          ) : null}

                          {recalculated ? (
                            <Pressable style={styles.recalcBadge} onPress={() => setSyncInfoDate(item.date)}>
                              <Text style={styles.recalcBadgeText}>Sync Update</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>

                      <View style={styles.summaryGrid}>
                        {(() => {
                          const summary = dayInfo ? summarizeOrderEvents(events) : null;
                          const refillSummary = dayInfo ? summarizeRefillEvents(events) : null;
                          const sold12 = summary?.sold12 ?? 0;
                          const unreturned12 = summary?.unreturned12 ?? 0;
                          const sold48 = summary?.sold48 ?? 0;
                          const unreturned48 = summary?.unreturned48 ?? 0;
                          const total = summary?.total ?? 0;
                          const paid = summary?.paid ?? 0;
                          const unpaid = summary?.unpaid ?? 0;
                          const refillTotal = refillSummary?.total ?? 0;
                          const refillPaid = refillSummary?.paid ?? 0;
                          const refillUnpaid = refillSummary?.unpaid ?? 0;
                          return (
                            <>
                              <View style={styles.summaryRow}>
                                <SummaryChip labelLines={["Sold", "12kg"]} value={formatCount(sold12)} compact />
                                <SummaryChip
                                  labelLines={["Missing", "12kg"]}
                                  value={unreturned12 ? formatCount(unreturned12) : "OK"}
                                  bad={unreturned12 > 0}
                                  compact
                                />
                                <SummaryChip labelLines={["Sold", "48kg"]} value={formatCount(sold48)} compact />
                                <SummaryChip
                                  labelLines={["Missing", "48kg"]}
                                  value={unreturned48 ? formatCount(unreturned48) : "OK"}
                                  bad={unreturned48 > 0}
                                  compact
                                />
                              </View>
                              <View style={styles.summaryRow}>
                                <SummaryChip label="Total" value={formatMoney(total)} compact />
                                <SummaryChip label="Paid" value={formatMoney(paid)} compact />
                                <SummaryChip
                                  label="cstmr pay you"
                                  value={unpaid ? formatMoney(unpaid) : "OK"}
                                  bad={unpaid > 0}
                                  compact
                                />
                              </View>
                              <View style={styles.summaryRow}>
                                <SummaryChip label="cmpy total" value={formatMoney(refillTotal)} compact />
                                <SummaryChip label="you paid cmpy" value={formatMoney(refillPaid)} compact />
                                <SummaryChip
                                  label="you pay cmpy"
                                  value={refillUnpaid ? formatMoney(refillUnpaid) : "OK"}
                                  bad={refillUnpaid > 0}
                                  compact
                                />
                              </View>
                            </>
                          );
                        })()}
                      </View>

                      <View style={styles.v2CashBlock}>
                        <Text style={styles.v2CashLabel}>Cash Total</Text>
                        <DeltaArrowRow start={item.cash_start} end={item.cash_end} format={formatMoney} size="lg" />
                      </View>

                      <View style={styles.v2InvRow}>
                        <View style={styles.v2InvBlockHalf}>
                          <Text style={[styles.v2InvLabel, { color: gasColor("12kg") }]}>12kg</Text>
                          <InventoryTwinPanels
                            fullStart={displayInventoryStart.full12}
                            fullEnd={item.inventory_end.full12}
                            emptyStart={displayInventoryStart.empty12}
                            emptyEnd={item.inventory_end.empty12}
                            formatCount={formatCount}
                          />
                        </View>

                        <View style={styles.v2InvBlockHalf}>
                          <Text style={[styles.v2InvLabel, { color: gasColor("48kg") }]}>48kg</Text>
                          <InventoryTwinPanels
                            fullStart={displayInventoryStart.full48}
                            fullEnd={item.inventory_end.full48}
                            emptyStart={displayInventoryStart.empty48}
                            emptyEnd={item.inventory_end.empty48}
                            formatCount={formatCount}
                          />
                        </View>
                      </View>

                      {dayInfo ? (
                        <View style={styles.v2EventSummaryRow}>
                          {summarizeEventTypes(events).map((entry) => (
                            <View key={entry.type} style={[styles.v2EventSummaryChip, { backgroundColor: entry.color }]}>
                              <Text style={styles.v2EventSummaryText}>{entry.label}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}

                      {problemSummary ? <Text style={styles.problemLine}>{problemSummary}</Text> : null}

                      <View style={styles.v2DetailsRow}>
                        <Text style={styles.v2DetailsText}>Hide details</Text>
                        <Ionicons name="chevron-up" size={16} color="#0a7ea4" />
                      </View>
                    </>
                  ) : (
                    <View>
                      {(() => {
                        const summary = dayInfo ? summarizeOrderEvents(events) : null;
                        const unreturned12 = summary?.unreturned12 ?? 0;
                        const unreturned48 = summary?.unreturned48 ?? 0;
                        const unpaid = summary?.unpaid ?? 0;
                        return (
                          <View style={styles.collapsedHeaderRow}>
                            <View>
                              <Text style={styles.v2Date}>
                                {weekday}, {item.date}
                              </Text>
                              <Text style={styles.collapsedSubtext}>Daily Summary</Text>
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
                                  Cash Total: {formatMoney(summary?.paid ?? 0)} NIS
                                </Text>
                              </View>
                            </View>
                            <View style={styles.collapsedRight}>
                              {(unpaid > 0 || unreturned12 > 0 || unreturned48 > 0) ? (
                                <View style={styles.missingInlineBox}>
                                  {unpaid > 0 ? (
                                  <Text style={styles.missingMiniValue}>
                                    Missing cash: {formatMoney(unpaid)} NIS
                                  </Text>
                                ) : null}
                                {unreturned12 > 0 ? (
                                  <Text style={[styles.missingMiniValue, { color: gasColor("12kg") }]}>
                                    Missing 12kg: {formatCount(unreturned12)}
                                  </Text>
                                ) : null}
                                {unreturned48 > 0 ? (
                                  <Text style={[styles.missingMiniValue, { color: gasColor("48kg") }]}>
                                    Missing 48kg: {formatCount(unreturned48)}
                                  </Text>
                                ) : null}
                                </View>
                              ) : null}
                              {dayInfo ? (
                                <View style={[styles.v2EventSummaryRow, styles.collapsedEventRow]}>
                                  {summarizeEventTypes(events).map((entry) => (
                                    <View
                                      key={entry.type}
                                      style={[styles.v2EventSummaryChip, styles.collapsedEventChip, { backgroundColor: entry.color }]}
                                    >
                                      <Text style={styles.v2EventSummaryText}>{entry.label}</Text>
                                    </View>
                                  ))}
                                </View>
                              ) : null}
                            </View>
                          </View>
                        );
                      })()}
                    </View>
                  )}
                </Pressable>

                {isOpen && (
                  <View style={[styles.expanded, styles.v2Timeline, styles.expandedPanel]}>
                    <Text style={styles.expandedTitle}>Timeline</Text>
                    {recalculated ? <Text style={styles.meta}>This day was recalculated.</Text> : null}
                    {!dayInfo && <Text style={styles.meta}>Loading timeline...</Text>}
                    {dayInfo && events.length === 0 && <Text style={styles.meta}>No events.</Text>}
                    {dayInfo ? (
                      <V2Timeline
                        date={item.date}
                        events={events}
                        inventoryStart={dayInfo.inventory_start as any}
                        formatMoney={formatMoney}
                        formatCount={formatCount}
                      />
                    ) : null}
                  </View>
                )}
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
                    Missing cash: {formatMoney(unpaid)} NIS
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
      <Text style={styles.deltaArrow}>→</Text>
      <Text style={valueStyle}>{format(end)}</Text>
      <Text style={styles.deltaMeta}>
        ({sign}
        {delta})
      </Text>
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
          {formatCount(fullStart)} → {formatCount(fullEnd)}
        </Text>
        <Text style={styles.invTwinDelta}>({formatSigned(fullEnd - fullStart)})</Text>
      </View>
      <View style={styles.invTwinRow}>
        <Text style={styles.invTwinKey}>Empty</Text>
        <Text style={styles.invTwinVal}>
          {formatCount(emptyStart)} → {formatCount(emptyEnd)}
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
        12kg: {installed12} → {received12} | €{formatMoney(totals12?.paid ?? 0)}/{formatMoney(totals12?.total ?? 0)}
      </Text>
      <Text style={styles.tableRow}>
        48kg: {installed48} → {received48} | €{formatMoney(totals48?.paid ?? 0)}/{formatMoney(totals48?.total ?? 0)}
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
            {(o as any)?.customer_name ?? (o as any)?.customer ?? "Order"} — €{(o as any)?.paid_amount ?? (o as any)?.paid ?? 0}
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
        12kg buy/ret: {entry.buy12}/{entry.ret12} (buy €{buy12Price})
      </Text>
      <Text style={styles.subCardRow}>
        48kg buy/ret: {entry.buy48}/{entry.ret48} (buy €{buy48Price})
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
                12kg buy/ret: {entry.buy12}/{entry.ret12} (buy €{prices.buy12})
              </Text>
              <Text style={styles.subCardRow}>
                48kg buy/ret: {entry.buy48}/{entry.ret48} (buy €{prices.buy48})
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
        const eventTime = ev?.effective_at ?? ev?.created_at ?? "";
        const gasTypeLabel = ev?.gas_type ?? "";
        const orderTotal = typeof ev?.order_total === "number" ? ev.order_total : 0;
        const orderPaid =
          typeof ev?.order_paid === "number"
            ? ev.order_paid
            : typeof ev?.cash_before === "number" && typeof ev?.cash_after === "number"
              ? ev.cash_after - ev.cash_before
              : 0;
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
        const cashDelta = typeof ev?.cash_before === "number" && typeof ev?.cash_after === "number"
          ? ev.cash_after - ev.cash_before
          : null;
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

        return (
          <View key={`${date}-ev-${idx}`} style={styles.eventCard}>
            <View style={styles.eventHeader}>
              <View style={styles.eventHeaderTitleRow}>
                <Text style={styles.eventTypeText}>{eventTitle}</Text>
                {ev?.label && String(ev.label).toLowerCase() !== eventTitle.toLowerCase() ? (
                  <Text style={styles.eventLabelText}>{ev.label}</Text>
                ) : null}
              </View>
              <View style={styles.eventHeaderRight}>
                <View style={styles.eventBadgeRow}>
                  {eventType === "order" && orderUnpaid > 0 ? (
                    <View style={[styles.eventBadge, styles.eventBadgeOrder]}>
                      <Text style={styles.eventBadgeText}>cstmr pay you {formatMoney(orderUnpaid)}₪</Text>
                    </View>
                  ) : null}
                  {eventType === "order" && orderCredit > 0 ? (
                    <View style={[styles.eventBadge, styles.eventBadgeOrder]}>
                      <Text style={styles.eventBadgeText}>you pay cstmr {formatMoney(orderCredit)}₪</Text>
                    </View>
                  ) : null}
                  {eventType === "order" && orderMissingCyl > 0 ? (
                    <View style={[styles.eventBadge, styles.eventBadgeOrder]}>
                      <Text style={styles.eventBadgeText}>cstmr give you {orderMissingCyl}x {gasTypeLabel}</Text>
                    </View>
                  ) : null}
                  {eventType === "order" && orderCylCredit > 0 ? (
                    <View style={[styles.eventBadge, styles.eventBadgeOrder]}>
                      <Text style={styles.eventBadgeText}>you give cstmr {orderCylCredit}x {gasTypeLabel}</Text>
                    </View>
                  ) : null}
                  {eventType === "refill" && refillUnpaid > 0 ? (
                    <View style={[styles.eventBadge, styles.eventBadgeRefill]}>
                      <Text style={styles.eventBadgeText}>you pay cmpy {formatMoney(refillUnpaid)}₪</Text>
                    </View>
                  ) : null}
                  {eventType === "refill" && refillCredit12 > 0 ? (
                    <View style={[styles.eventBadge, styles.eventBadgeRefill]}>
                      <Text style={styles.eventBadgeText}>cmpy give you {refillCredit12}x 12kg</Text>
                    </View>
                  ) : null}
                  {eventType === "refill" && refillCredit48 > 0 ? (
                    <View style={[styles.eventBadge, styles.eventBadgeRefill]}>
                      <Text style={styles.eventBadgeText}>cmpy give you {refillCredit48}x 48kg</Text>
                    </View>
                  ) : null}
                  {eventType === "refill" && refillMissing12 > 0 ? (
                    <View style={[styles.eventBadge, styles.eventBadgeRefill]}>
                      <Text style={styles.eventBadgeText}>you give cmpy {refillMissing12}x 12kg</Text>
                    </View>
                  ) : null}
                  {eventType === "refill" && refillMissing48 > 0 ? (
                    <View style={[styles.eventBadge, styles.eventBadgeRefill]}>
                      <Text style={styles.eventBadgeText}>you give cmpy {refillMissing48}x 48kg</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.eventTimeText}>{eventTime}</Text>
              </View>
            </View>

            {eventType === "order" ? (
              <View style={styles.eventMetaBlock}>
                <Text style={styles.eventMetaText}>
                  cstmr: {ev?.customer_name ?? "Unknown"}
                  {ev?.customer_description ? ` - ${ev.customer_description}` : " - No description"}
                </Text>
                <Text style={styles.eventMetaText}>
                  System: {ev?.system_name ?? "Unknown"}
                  {ev?.system_type ? ` (${ev.system_type})` : ""}
                </Text>
                <Text style={styles.eventMetaText}>Order: {getOrderQtyLabel(ev) ?? ev?.gas_type ?? "N/A"}</Text>
              </View>
            ) : null}

            {eventType === "refill" ? (
              <View style={styles.eventMetaBlock}>
                <Text style={styles.eventMetaText}>
                  12kg buy/return: {formatCount(ev?.buy12 ?? 0)} / {formatCount(ev?.return12 ?? 0)}
                </Text>
                <Text style={styles.eventMetaText}>
                  48kg buy/return: {formatCount(ev?.buy48 ?? 0)} / {formatCount(ev?.return48 ?? 0)}
                </Text>
              </View>
            ) : null}

            {ev?.reason ? (
              <View style={styles.eventMetaBlock}>
                <Text style={styles.eventMetaText}>Note: {ev.reason}</Text>
              </View>
            ) : null}

            <View style={styles.eventSection}>
              <View style={styles.eventSectionHeader}>
                <View style={styles.eventSectionDot} />
                <Text style={styles.eventSectionTitle}>Money</Text>
              </View>
              {eventType === "order" ? (
                <View style={styles.orderMoneyRow}>
                  <ValueBox label="Total" value={formatMoney(orderTotal ?? 0)} compact />
                  <DeltaBox
                    label="Cash"
                    before={ev?.cash_before ?? 0}
                    after={ev?.cash_after ?? 0}
                    format={formatMoney}
                    smallDelta
                    compact
                    badgeTone={cashBadgeTone}
                  />
                  <ValueBox
                    label="Missing"
                    value={orderUnpaidForCash && orderUnpaidForCash > 0 ? formatMoney(orderUnpaidForCash) : "OK"}
                    valueStyle={
                      orderUnpaidForCash && orderUnpaidForCash > 0
                        ? styles.valueBoxValueBad
                        : styles.valueBoxValueOk
                    }
                    compact
                  />
                </View>
              ) : eventType === "refill" ? (
                <View style={styles.orderMoneyRow}>
                  <ValueBox label="Total" value={formatMoney(ev?.total_cost ?? 0)} compact />
                  <DeltaBox
                    label="Cash"
                    before={ev?.cash_before ?? 0}
                    after={ev?.cash_after ?? 0}
                    format={formatMoney}
                    smallDelta
                    compact
                    badgeTone={refillCashBadgeTone}
                  />
                  <ValueBox
                    label="Missing"
                    value={
                      ev?.total_cost != null && ev?.paid_now != null && ev.total_cost - ev.paid_now > 0
                        ? formatMoney(ev.total_cost - ev.paid_now)
                        : "OK"
                    }
                    valueStyle={
                      ev?.total_cost != null && ev?.paid_now != null && ev.total_cost - ev.paid_now > 0
                        ? styles.valueBoxValueBad
                        : styles.valueBoxValueOk
                    }
                    compact
                  />
                </View>
              ) : (
                <View style={styles.deltaGrid}>
                  <DeltaBox
                    label="Cash"
                    before={ev?.cash_before ?? 0}
                    after={ev?.cash_after ?? 0}
                    format={formatMoney}
                    smallDelta
                  />
                  {ev?.company_before != null && ev?.company_after != null ? (
                    <DeltaBox
                      label="cmpy"
                      before={ev.company_before ?? 0}
                      after={ev.company_after ?? 0}
                      format={formatMoney}
                      smallDelta
                    />
                  ) : null}
                </View>
              )}
            </View>

            {showInv12
              ? renderInventorySection(
                  "Inventory 12kg",
                  gasColor("12kg"),
                  { full: invBefore.full12, empty: invBefore.empty12 },
                  { full: invAfter.full12, empty: invAfter.empty12 },
                  eventType === "order" && ev?.gas_type === "12kg"
                    ? orderMissing
                    : eventType === "refill"
                      ? refillMissing12
                      : null,
                  eventType === "init"
                )
              : null}
            {showInv48
              ? renderInventorySection(
                  "Inventory 48kg",
                  gasColor("48kg"),
                  { full: invBefore.full48, empty: invBefore.empty48 },
                  { full: invAfter.full48, empty: invAfter.empty48 },
                  eventType === "order" && ev?.gas_type === "48kg"
                    ? orderMissing
                    : eventType === "refill"
                      ? refillMissing48
                      : null,
                  eventType === "init"
                )
              : null}
          </View>
        );
      })}
    </View>
  );
}

function formatEventType(type: string) {
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
    unreturned12: 0,
    sold48: 0,
    unreturned48: 0,
    total: 0,
    paid: 0,
    unpaid: 0,
  };
  events.forEach((ev) => {
    if (String(ev?.event_type ?? ev?.type ?? ev?.source_type) !== "order") return;
    const installed = typeof ev?.order_installed === "number" ? ev.order_installed : 0;
    const received = typeof ev?.order_received === "number" ? ev.order_received : 0;
    const missing = Math.max(installed - received, 0);
    if (ev?.gas_type === "12kg") {
      summary.sold12 += installed;
      summary.unreturned12 += missing;
    }
    if (ev?.gas_type === "48kg") {
      summary.sold48 += installed;
      summary.unreturned48 += missing;
    }
    summary.total += typeof ev?.order_total === "number" ? ev.order_total : 0;
    summary.paid += typeof ev?.order_paid === "number" ? ev.order_paid : 0;
  });
  summary.unpaid = Math.max(summary.total - summary.paid, 0);
  return summary;
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
            <Text style={styles.deltaBoxArrow}>{"→"}</Text>
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
    total: 0,
    paid: 0,
    unpaid: 0,
  };
  events.forEach((ev) => {
    if (String(ev?.event_type ?? ev?.type ?? ev?.source_type) !== "refill") return;
    const totalCost = typeof ev?.total_cost === "number" ? ev.total_cost : 0;
    const paidNow = typeof ev?.paid_now === "number" ? ev.paid_now : 0;
    summary.total += totalCost;
    summary.paid += paidNow;
  });
  summary.unpaid = Math.max(summary.total - summary.paid, 0);
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
      <Text style={styles.topSummaryValue}>{value}</Text>
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
  cardCollapsed: { backgroundColor: "#f9fafb", borderColor: "#e5e7eb" },
  cardExpanded: { backgroundColor: "#eef6ff", borderColor: "#bfdbfe" },

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

  v2CashBlock: { marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: "#f1f5f9" },
  v2CashLabel: { fontSize: 12, fontWeight: "800", color: "#0f172a", marginBottom: 6 },
  v2InvBlock: { marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: "#f8fafc" },
  v2InvRow: { marginTop: 10, flexDirection: "row", gap: 10 },
  v2InvBlockHalf: { flex: 1, padding: 10, borderRadius: 12, backgroundColor: "#f8fafc" },
  v2InvLabel: { fontSize: 12, fontWeight: "900", marginBottom: 6 },
  v2MetricLabelSmall: { fontSize: 12, fontWeight: "800" },

  v2EventSummaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  v2EventSummaryChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  v2EventSummaryText: { fontSize: 11, fontWeight: "900", color: "white" },
  collapsedSummaryLine: { color: "#0f172a", fontWeight: "700", marginTop: 6 },
  collapsedHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  collapsedSubtext: { fontSize: 11, fontWeight: "800", color: "#64748b", marginTop: 2 },
  collapsedRight: { alignItems: "flex-end", gap: 6 },
  collapsedList: { marginTop: 2, gap: 4 },
  collapsedListItem: { fontSize: 12, fontWeight: "800", color: "#0f172a" },
  missingInlineBox: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    alignItems: "flex-end",
    minWidth: 120,
  },
  missingMiniLabel: { fontSize: 10, fontWeight: "900", color: "#b91c1c" },
  missingMiniValue: { marginTop: 2, fontSize: 11, fontWeight: "900", color: "#b91c1c" },
  collapsedEventRow: { justifyContent: "flex-end", marginTop: 0 },
  collapsedEventChip: { paddingHorizontal: 8, paddingVertical: 4 },

  problemLine: { marginTop: 8, fontSize: 12, fontWeight: "700", color: "#b91c1c" },

  v2DetailsRow: { marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  v2DetailsText: { fontSize: 12, fontWeight: "800", color: "#0a7ea4" },
  v2Timeline: { backgroundColor: "#ffffff" },

  topSummaryCard: {
    marginTop: 12,
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
  topSummaryTitle: { fontSize: 12, fontWeight: "900", color: "#0f172a", marginBottom: 10 },
  topSummaryRow: { flexDirection: "row", gap: 8 },
  relationshipRow: { flexDirection: "row", gap: 16 },
  relationshipColumn: { flex: 1, gap: 6 },
  relationshipLine: { color: "#0f172a", fontWeight: "700", fontSize: 12 },
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

  deltaRow: { flexDirection: "row", alignItems: "baseline", gap: 6, flexWrap: "wrap" },
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
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  eventHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  eventHeaderTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  eventHeaderRight: { alignItems: "flex-end", gap: 6 },
  eventBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" },
  eventBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  eventBadgeOrder: { backgroundColor: "#2563eb" },
  eventBadgeRefill: { backgroundColor: "#f97316" },
  eventBadgeText: { color: "white", fontSize: 11, fontWeight: "900" },
  eventTypeText: { fontSize: 12, fontWeight: "900", color: "#0f172a" },
  eventLabelText: { fontSize: 11, fontWeight: "800", color: "#64748b" },
  eventTimeText: { fontSize: 11, fontWeight: "700", color: "#64748b" },
  eventMetaBlock: { marginTop: 8 },
  eventMetaText: { fontSize: 12, fontWeight: "700", color: "#334155" },

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

  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: "#e2e8f0" },
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
