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
import { FontFamilies, FontSizes } from "@/constants/typography";
import { Spacing } from "@/constants/spacing";
import BalancesCard from "@/components/reports/BalancesCard";
import ReportHeader from "@/components/reports/ReportHeader";
import { useCreateExpense } from "@/hooks/useExpenses";
import { useDailyReportScreen } from "@/hooks/useDailyReportScreen";
import {
  formatEventType,
  formatSigned,
  getInitInventoryAfter,
  summarizeEventTypes,
  summarizeDayNet,
  summarizeOrderEvents,
  summarizeRefillEvents,
} from "@/lib/reports/utils";
import { formatDateTimeYMDHM, formatWeekdayShort, toDateKey } from "@/lib/date";

const getEventColor = (eventType: string) => {
  const palette: Record<string, string> = {
    order: "#0a7ea4",
    refill: "#f97316",
    expense: "#16a34a",
    init: "#8b5cf6",
    adjust: "#64748b",
    cash_adjust: "#64748b",
    collection_money: "#22c55e",
    collection_empty: "#14b8a6",
    company_payment: "#2563eb",
    bank_deposit: "#0ea5e9",
  };
  return palette[eventType] ?? "#0a7ea4";
};

const getExpenseIcon = (type?: string | null) => {
  const key = String(type ?? "").toLowerCase();
  if (key === "fuel") return "car-outline";
  if (key === "food") return "fast-food-outline";
  if (key === "car test") return "analytics-outline";
  if (key === "car repair") return "construct-outline";
  if (key === "car insurance") return "shield-checkmark-outline";
  return "receipt-outline";
};

/**
 * NOTE:
 * - Your original file was truncated/garbled, with unbalanced JSX and some state setters using wrong types.
 * - This version fixes syntax issues (balanced JSX) and includes minimal local UI helpers so bundling succeeds.
 * - Replace these helper components with your real ones if they exist elsewhere in the codebase.
 */

export default function ReportsScreen() {
  // Expense modal state
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseDate, setExpenseDate] = useState<string | null>(null);
  const [expenseType, setExpenseType] = useState("fuel");
  const [customExpenseType, setCustomExpenseType] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [useCustomType, setUseCustomType] = useState(false);
  const [balancesOpen, setBalancesOpen] = useState(true);

  // Sync tooltip
  const [syncInfoDate, setSyncInfoDate] = useState<string | null>(null);

  // Route handling
  const params = useLocalSearchParams<{ mode?: string; addExpense?: string; expand?: string; date?: string }>();
  const [routeHandled, setRouteHandled] = useState(false);
  const [allowExpenseInput, setAllowExpenseInput] = useState(false);

  // V2
  const [v2SummaryOpen, setV2SummaryOpen] = useState<string | null>(null);

  // Hooks
  const createExpense = useCreateExpense();
  const {
    v2Query,
    v2Rows,
    v2Expanded,
    setV2Expanded,
    v2DayByDate,
    setV2DayByDate,
    balanceSummary,
    companySummary,
    refetchV2,
    refetchCustomers,
  } = useDailyReportScreen();

  // Formatters
  const formatMoney = (value: number) => Number(value || 0).toFixed(0);
  const formatCount = (value: number) => Number(value || 0).toFixed(0);
  const formatCustomerCount = (count: number) => `${count} cstmr${count === 1 ? "" : "s"}`;

  const buildBalanceAlertLines = (row: any, prevRow?: any | null, events?: any[]) => {
    const lines: { label: string; color: string }[] = [];
    const delta = (end?: number | null, start?: number | null) => Number(end ?? 0) - Number(start ?? 0);
    const pushLine = (
      label: string,
      value: number | null | undefined,
      formatter: (n: number) => string,
      color: string
    ) => {
      const numeric = Number(value ?? 0);
      if (!numeric) return;
      lines.push({ label: `${label} ${formatter(Math.abs(numeric))}`, color });
    };

    if (Array.isArray(events) && events.length > 0) {
      const customerNet = summarizeDayNet(events);
      const companyTotals = events.reduce(
        (acc, ev) => {
          const cashBefore = typeof ev?.company_before === "number" ? ev.company_before : null;
          const cashAfter = typeof ev?.company_after === "number" ? ev.company_after : null;
          if (cashBefore != null && cashAfter != null) acc.cash += cashAfter - cashBefore;

          const before12 = typeof ev?.company_12kg_before === "number" ? ev.company_12kg_before : null;
          const after12 = typeof ev?.company_12kg_after === "number" ? ev.company_12kg_after : null;
          if (before12 != null && after12 != null) acc.cyl12 += after12 - before12;

          const before48 = typeof ev?.company_48kg_before === "number" ? ev.company_48kg_before : null;
          const after48 = typeof ev?.company_48kg_after === "number" ? ev.company_48kg_after : null;
          if (before48 != null && after48 != null) acc.cyl48 += after48 - before48;

          return acc;
        },
        { cash: 0, cyl12: 0, cyl48: 0 }
      );

      const companyCashDebt = Math.max(companyTotals.cash, 0);
      const companyCashCredit = Math.max(-companyTotals.cash, 0);
      const company12Credit = Math.max(companyTotals.cyl12, 0);
      const company12Debt = Math.max(-companyTotals.cyl12, 0);
      const company48Credit = Math.max(companyTotals.cyl48, 0);
      const company48Debt = Math.max(-companyTotals.cyl48, 0);

      if (companyCashDebt > 0) pushLine("cash company: debts", companyCashDebt, formatMoney, "#b91c1c");
      if (companyCashCredit > 0) pushLine("cash company: credits", companyCashCredit, formatMoney, "#16a34a");
      if (company12Debt > 0) pushLine("12kg company: debts", company12Debt, formatCount, "#b91c1c");
      if (company12Credit > 0) pushLine("12kg company: credit", company12Credit, formatCount, "#16a34a");
      if (company48Debt > 0) pushLine("48kg company: debts", company48Debt, formatCount, "#b91c1c");
      if (company48Credit > 0) pushLine("48kg company: credit", company48Credit, formatCount, "#16a34a");

      if (customerNet.newDebtCash > 0)
        pushLine("cash customer: debts", customerNet.newDebtCash, formatMoney, "#b91c1c");
      if (customerNet.collectedCash > 0)
        pushLine("cash customer: credits", customerNet.collectedCash, formatMoney, "#16a34a");
      if (customerNet.newDebt12 > 0)
        pushLine("12kg customer: debts", customerNet.newDebt12, formatCount, "#b91c1c");
      if (customerNet.collected12 > 0)
        pushLine("12kg customer: credit", customerNet.collected12, formatCount, "#16a34a");
      if (customerNet.newDebt48 > 0)
        pushLine("48kg customer: debts", customerNet.newDebt48, formatCount, "#b91c1c");
      if (customerNet.collected48 > 0)
        pushLine("48kg customer: credit", customerNet.collected48, formatCount, "#16a34a");

      return lines;
    }

    const companyCashDebtDelta = delta(row.company_give_end, row.company_give_start ?? prevRow?.company_give_end ?? 0);
    const companyCashCreditDelta = delta(
      row.company_receive_end,
      row.company_receive_start ?? prevRow?.company_receive_end ?? 0
    );
    const company12DebtDelta = delta(
      row.company_12kg_give_end,
      row.company_12kg_give_start ?? prevRow?.company_12kg_give_end ?? 0
    );
    const company12CreditDelta = delta(
      row.company_12kg_receive_end,
      row.company_12kg_receive_start ?? prevRow?.company_12kg_receive_end ?? 0
    );
    const company48DebtDelta = delta(
      row.company_48kg_give_end,
      row.company_48kg_give_start ?? prevRow?.company_48kg_give_end ?? 0
    );
    const company48CreditDelta = delta(
      row.company_48kg_receive_end,
      row.company_48kg_receive_start ?? prevRow?.company_48kg_receive_end ?? 0
    );

    // Company balances (daily delta)
    if (companyCashDebtDelta > 0) pushLine("cash company: debts", companyCashDebtDelta, formatMoney, "#b91c1c");
    if (companyCashCreditDelta > 0) pushLine("cash company: credits", companyCashCreditDelta, formatMoney, "#16a34a");
    if (company12DebtDelta > 0) pushLine("12kg company: debts", company12DebtDelta, formatCount, "#b91c1c");
    if (company12CreditDelta > 0) pushLine("12kg company: credit", company12CreditDelta, formatCount, "#16a34a");
    if (company48DebtDelta > 0) pushLine("48kg company: debts", company48DebtDelta, formatCount, "#b91c1c");
    if (company48CreditDelta > 0) pushLine("48kg company: credit", company48CreditDelta, formatCount, "#16a34a");

    // Customer balances (daily delta; derived from previous day)
    const customerCashDebtDelta = prevRow
      ? delta(row.customer_money_payable, prevRow?.customer_money_payable ?? 0)
      : 0;
    const customerCashCreditDelta = prevRow
      ? delta(row.customer_money_receivable, prevRow?.customer_money_receivable ?? 0)
      : 0;
    const customer12DebtDelta = prevRow
      ? delta(row.customer_12kg_payable, prevRow?.customer_12kg_payable ?? 0)
      : 0;
    const customer12CreditDelta = prevRow
      ? delta(row.customer_12kg_receivable, prevRow?.customer_12kg_receivable ?? 0)
      : 0;
    const customer48DebtDelta = prevRow
      ? delta(row.customer_48kg_payable, prevRow?.customer_48kg_payable ?? 0)
      : 0;
    const customer48CreditDelta = prevRow
      ? delta(row.customer_48kg_receivable, prevRow?.customer_48kg_receivable ?? 0)
      : 0;

    if (customerCashDebtDelta > 0) pushLine("cash customer: debts", customerCashDebtDelta, formatMoney, "#b91c1c");
    if (customerCashCreditDelta > 0)
      pushLine("cash customer: credits", customerCashCreditDelta, formatMoney, "#16a34a");
    if (customer12DebtDelta > 0) pushLine("12kg customer: debts", customer12DebtDelta, formatCount, "#b91c1c");
    if (customer12CreditDelta > 0)
      pushLine("12kg customer: credit", customer12CreditDelta, formatCount, "#16a34a");
    if (customer48DebtDelta > 0) pushLine("48kg customer: debts", customer48DebtDelta, formatCount, "#b91c1c");
    if (customer48CreditDelta > 0)
      pushLine("48kg customer: credit", customer48CreditDelta, formatCount, "#16a34a");

    return lines;
  };

  const expenseTypes = ["fuel", "food", "car test", "car repair", "car insurance", "others"];
  const accessoryId = Platform.OS === "ios" ? "expenseAccessory" : undefined;

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

    const todayStr = toDateKey(new Date());
    const date = dateParam || todayStr;

    if (addExpense === "1") {
      setAllowExpenseInput(true);
      setV2Expanded([date]);
      openExpenseModal(date);
      setRouteHandled(true);
      return;
    }

    if (expand === "1") {
      setV2Expanded([date]);
      setRouteHandled(true);
    }
  }, [params, routeHandled, openExpenseModal]);

  useFocusEffect(
    useCallback(() => {
      refetchV2();
      refetchCustomers();
    }, [refetchV2, refetchCustomers])
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

  // -------------------------
  // VIEW MODE: NEW (V2)
  // -------------------------
  return (
    <View style={styles.container}>
      <View style={styles.stickyHeader}>
        {(() => {
          const latest = v2Rows[0];
          const inventory = latest?.inventory_end;
          return (
            <ReportHeader
              inventory={{
                full12: formatCount(inventory?.full12 ?? 0),
                empty12: formatCount(inventory?.empty12 ?? 0),
                full48: formatCount(inventory?.full48 ?? 0),
                empty48: formatCount(inventory?.empty48 ?? 0),
              }}
              cashEnd={formatMoney(latest?.cash_end ?? 0)}
              onAdjustInventory={() => {
                router.push("/(tabs)/add?open=adjust-inventory");
              }}
              onAdjustCash={() => {
                router.push("/(tabs)/add?open=adjust-cash");
              }}
            />
          );
        })()}
      </View>
        {v2Query.isLoading && <Text style={styles.meta}>Loading...</Text>}
        {v2Query.error && <Text style={styles.error}>Failed to load reports.</Text>}

        <BalancesCard
          balanceSummary={balanceSummary}
          companySummary={companySummary}
          formatCustomerCount={formatCustomerCount}
          formatMoney={formatMoney}
          formatCount={formatCount}
          collapsed={!balancesOpen}
          onToggle={() => setBalancesOpen((prev) => !prev)}
        />


        <FlatList
          data={v2Rows}
          keyExtractor={(item) => item.date}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={!v2Query.isLoading ? <Text style={styles.meta}>No reports yet.</Text> : null}
          renderItem={({ item, index }) => {
            const isOpen = v2Expanded.includes(item.date);
            const weekday = formatWeekdayShort(item.date);
            const prevRow = v2Rows[index + 1] ?? null;

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
                      const alertLines = buildBalanceAlertLines(item, prevRow, events);
                      const cashEnd = dayInfo?.cash_end ?? item.cash_end ?? 0;
                      return (
                        <View>
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
                            </View>
                          </View>
                          {dayInfo ? (
                            (() => {
                              const resolveSummaryType = (type: string, label: string) => {
                                if (type.startsWith("order:")) return "order";
                                if (type.startsWith("label:")) {
                                  const name = label.replace(/\s+\d+$/, "");
                                  if (["Replace", "SellFull", "BuyEmpty"].includes(name)) return "order";
                                  if (["Refill", "BuyIron"].includes(name)) return "refill";
                                  if (name === "Expense") return "expense";
                                  if (name === "CashAdjust") return "cash_adjust";
                                  if (name === "InvAdjust") return "adjust";
                                  if (name === "LatePay") return "collection_money";
                                  if (name === "ReturnEmp") return "collection_empty";
                                  if (name === "PayCompany") return "company_payment";
                                  if (name === "Deposit") return "bank_deposit";
                                }
                                return type;
                              };
                              const entries = summarizeEventTypes(events).map((entry) => ({
                                ...entry,
                                color: getEventColor(resolveSummaryType(entry.type, entry.label)),
                              }));
                              return (
                                <View style={styles.collapsedChipsRow}>
                                  {entries.map((entry) => (
                                    <View
                                      key={entry.type}
                                      style={[
                                        styles.v2EventSummaryChip,
                                        styles.collapsedEventChip,
                                        { backgroundColor: entry.color },
                                      ]}
                                    >
                                      <Text style={[styles.v2EventSummaryText, styles.collapsedEventText]}>
                                        {entry.label}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                              );
                            })()
                          ) : null}
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
      <Text style={styles.deltaArrow}>{'->'}</Text>
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

function V2Timeline({
  date,
  events,
  formatMoney,
  formatCount,
}: {
  date: string;
  events: any[];
  formatMoney: (v: number) => string;
  formatCount: (v: number) => string;
}) {
  const [openEvents, setOpenEvents] = useState<string[]>([]);

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
      {sortedEvents.map((ev, idx) => {
        const eventType = String(ev?.event_type ?? ev?.type ?? ev?.source_type ?? "event");
        const eventTitle = ev?.label_short ?? formatEventType(eventType, ev?.order_mode ?? null);
        const eventKey = `${date}-ev-${idx}-${ev?.source_id ?? ev?.id ?? ""}`;
        const isOpenEvent = openEvents.includes(eventKey);
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
        const eventTime = formatDateTimeYMDHM(eventTimeRaw);
        const createdAtTime = formatDateTimeYMDHM(ev?.created_at ?? "");
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
        const refillCreditCash = Math.max(refillPaid - refillTotal, 0);
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
        const adj12Full =
          typeof invBefore?.full12 === "number" && typeof invAfter?.full12 === "number"
            ? invAfter.full12 - invBefore.full12
            : 0;
        const adj12Empty =
          typeof invBefore?.empty12 === "number" && typeof invAfter?.empty12 === "number"
            ? invAfter.empty12 - invBefore.empty12
            : 0;
        const adj48Full =
          typeof invBefore?.full48 === "number" && typeof invAfter?.full48 === "number"
            ? invAfter.full48 - invBefore.full48
            : 0;
        const adj48Empty =
          typeof invBefore?.empty48 === "number" && typeof invAfter?.empty48 === "number"
            ? invAfter.empty48 - invBefore.empty48
            : 0;
        const orderMissing = orderMissingCyl > 0 ? orderMissingCyl : null;
        const cashBeforeNum = Number(ev?.cash_before);
        const cashAfterNum = Number(ev?.cash_after);
        const cashDelta =
          Number.isFinite(cashBeforeNum) && Number.isFinite(cashAfterNum)
            ? cashAfterNum - cashBeforeNum
            : null;
        const paymentAmount =
          typeof cashDelta === "number"
            ? Math.abs(cashDelta)
            : typeof ev?.collection_amount === "number"
              ? Math.abs(ev.collection_amount)
              : typeof ev?.amount_money === "number"
                ? Math.abs(ev.amount_money)
                : 0;
        const expenseAmount =
          typeof ev?.amount === "number"
            ? ev.amount
            : typeof ev?.amount_money === "number"
              ? ev.amount_money
              : typeof ev?.collection_amount === "number"
                ? ev.collection_amount
                : typeof cashDelta === "number"
                  ? Math.abs(cashDelta)
                  : 0;
        const expenseCashBadgeTone =
          typeof cashDelta === "number" ? (cashDelta <= 0 ? "bad" : "good") : undefined;
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
          eventType === "order" ||
          eventType === "collection_money" ||
          eventType === "collection_empty" ||
          eventType === "refill" ||
          eventType === "expense" ||
          eventType === "adjust";

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
                  <View style={[styles.eventHeaderLeft, eventType === "adjust" && styles.adjustHeaderLeft]}>
                    {eventType !== "refill" && eventType !== "expense" && eventType !== "adjust" ? (
                      <>
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
                            {(ev?.system_name ?? "System")} | {getOrderQtyLabel(ev) ?? ev?.gas_type ?? "N/A"}
                          </Text>
                        ) : null}
                      </>
                    ) : null}
                    {eventType === "refill" ? (
                      <Text style={[styles.eventCustomerName, styles.eventCustomerNameTight, styles.refillTitle]}>
                        Company
                      </Text>
                    ) : null}
                    {eventType === "adjust" ? (
                      <Text
                        style={[
                          styles.eventCustomerName,
                          styles.eventCustomerNameTight,
                          styles.refillTitle,
                          styles.adjustTitleTight,
                        ]}
                      >
                        Company
                      </Text>
                    ) : null}
                    {eventType === "adjust" ? (
                      <>
                        <Text style={[styles.eventSummaryLine, styles.eventSummaryLineTight]}>
                          <Text style={{ color: gasColor("12kg") }}>12kg</Text>
                          {`: empty ${formatSigned(adj12Empty)} | full ${formatSigned(adj12Full)}`}
                        </Text>
                        <Text style={[styles.eventSummaryLine, styles.eventSummaryLineTight]}>
                          <Text style={{ color: gasColor("48kg") }}>48kg</Text>
                          {`: empty ${formatSigned(adj48Empty)} | full ${formatSigned(adj48Full)}`}
                        </Text>
                      </>
                    ) : null}
                    {eventType === "expense" ? (
                      <>
                        <Text style={[styles.eventCustomerName, styles.eventCustomerNameTight, styles.expenseTitle]}>
                          {String(ev?.expense_type ?? "expense")}
                        </Text>
                        <Text style={[styles.eventSummaryLine, styles.eventSummaryLineTight]}>
                          {formatMoney(expenseAmount)}
                        </Text>
                      </>
                    ) : null}
                  </View>
                  <View style={styles.eventHeaderRightStack}>
                    <View style={styles.eventTimePill}>
                      <Text style={styles.eventTimeText}>{eventTime}</Text>
                    </View>
                    {eventType === "expense" ? null : null}
                    <View style={[styles.eventTypePill, { backgroundColor: getEventColor(eventType) }]}>
                      <Text style={styles.eventTypePillText}>{eventTitle}</Text>
                    </View>
                  </View>
                </>
              ) : (
                <>
                  {eventType !== "expense" ? (
                    <View style={[styles.eventTypePill, { backgroundColor: getEventColor(eventType) }]}>
                      <Text style={styles.eventTypePillText}>{eventTitle}</Text>
                    </View>
                  ) : (
                    <View />
                  )}
                  <View style={styles.eventHeaderRight}>
                    <View style={styles.eventTimePill}>
                      <Text style={styles.eventTimeText}>{eventTime}</Text>
                    </View>
                    {eventType === "expense" ? (
                      <View style={[styles.eventTypePill, { backgroundColor: getEventColor(eventType) }]}>
                        <Text style={styles.eventTypePillText}>{eventTitle}</Text>
                      </View>
                    ) : null}
                    {eventType === "expense" ? null : null}
                  </View>
                </>
              )}
            </View>

            {eventType === "expense" || eventType === "adjust" ? null : ev?.reason && (eventType !== "order" || String(ev.reason).toLowerCase() !== "order") ? (
              <View style={styles.eventMetaBlock}>
                <Text style={styles.eventMetaSmall}>{ev.reason}</Text>
              </View>
            ) : null}

            {eventType === "order" ? (
              <>
                <View style={styles.eventSummaryRow}>
                  <Text style={[styles.eventSummaryLine, styles.eventSummaryLeft]}>
                    <Text style={{ color: gasColor(ev?.gas_type ?? "12kg") }}>
                      {ev?.gas_type ?? "12kg"}
                    </Text>
                    {` installed ${formatCount(installed)} | received ${formatCount(received)}`}
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
                  customer paid {formatMoney(paymentAmount)}
                </Text>
              </View>
            ) : null}

            {eventType === "collection_empty" ? (
              <View style={styles.eventSummaryRow}>
                  <Text style={[styles.eventSummaryLine, styles.eventSummaryLeft]}>
                    received {formatCount(collectionEmpty12Display)} x{" "}
                    <Text style={{ color: gasColor("12kg") }}>12kg</Text>
                    {" | "}received {formatCount(collectionEmpty48Display)} x{" "}
                    <Text style={{ color: gasColor("48kg") }}>48kg</Text>
                  </Text>
                </View>
              ) : null}

            {eventType === "company_payment" ? (
              <View style={styles.eventSummaryRow}>
                <Text style={[styles.eventSummaryLine, styles.eventSummaryLeft]}>
                  you paid {formatMoney(paymentAmount)}
                </Text>
              </View>
            ) : null}

            {eventType === "refill" ? (
              <>
                <View style={styles.eventSummaryRow}>
                  <Text style={[styles.eventSummaryLine, styles.eventSummaryLeft]}>
                    <Text style={{ color: gasColor("12kg") }}>12kg</Text>
                    {` bought ${formatCount(ev?.buy12 ?? 0)} | returned ${formatCount(ev?.return12 ?? 0)}`}
                  </Text>
                  {(refillMissing12 > 0 || refillCredit12 > 0) ? (
                    <Text style={[styles.eventSummaryLine, styles.eventSummaryAlert, styles.eventSummaryRight]}>
                      {refillMissing12 > 0 ? `missing ${formatCount(refillMissing12)}` : null}
                      {refillMissing12 > 0 && refillCredit12 > 0 ? " | " : null}
                      {refillCredit12 > 0 ? `credit ${formatCount(refillCredit12)}` : null}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.eventSummaryRow}>
                  <Text style={[styles.eventSummaryLine, styles.eventSummaryLeft]}>
                    <Text style={{ color: gasColor("48kg") }}>48kg</Text>
                    {` bought ${formatCount(ev?.buy48 ?? 0)} | returned ${formatCount(ev?.return48 ?? 0)}`}
                  </Text>
                  {(refillMissing48 > 0 || refillCredit48 > 0) ? (
                    <Text style={[styles.eventSummaryLine, styles.eventSummaryAlert, styles.eventSummaryRight]}>
                      {refillMissing48 > 0 ? `missing ${formatCount(refillMissing48)}` : null}
                      {refillMissing48 > 0 && refillCredit48 > 0 ? " | " : null}
                      {refillCredit48 > 0 ? `credit ${formatCount(refillCredit48)}` : null}
                    </Text>
                  ) : null}
                </View>
                <View style={[styles.eventSummaryRow, styles.eventSummaryRowTight]}>
                  <Text style={[styles.eventSummaryLine, styles.eventSummaryLeft]}>
                    total {formatMoney(refillTotal)} | paid {formatMoney(refillPaid)}
                  </Text>
                  {(refillUnpaid > 0 || refillCreditCash > 0) ? (
                    <Text style={[styles.eventSummaryLine, styles.eventSummaryAlert, styles.eventSummaryRight]}>
                      {refillUnpaid > 0 ? `unpaid ${formatMoney(refillUnpaid)}` : null}
                      {refillUnpaid > 0 && refillCreditCash > 0 ? " | " : null}
                      {refillCreditCash > 0 ? `credit ${formatMoney(refillCreditCash)}` : null}
                    </Text>
                  ) : null}
                </View>
              </>
            ) : null}

            {eventType === "adjust" ? null : null}

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

                {eventType === "adjust" ? (
                  <>
                    {eventType === "adjust" ? (
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
                    ) : null}
                    {eventType === "adjust" ? (
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
                    ) : null}
                  </>
                ) : null}

                {eventType === "expense" ? (
                  <View style={styles.eventExpandedRow}>
                    <DeltaBox
                      label="Cash"
                      before={ev?.cash_before ?? 0}
                      after={ev?.cash_after ?? 0}
                      format={formatMoney}
                      smallDelta
                      compact
                      badgeTone={expenseCashBadgeTone}
                    />
                  </View>
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

/* -----------------------------------------
 * Styles (minimal, consistent)
 * ----------------------------------------- */

const HEADER_HEIGHT = 160;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: HEADER_HEIGHT + 14,
    backgroundColor: "#f6f7f9",
  },
  meta: { fontSize: 12, color: "#475569", fontFamily: FontFamilies.regular },
  error: { fontSize: 12, color: "#b91c1c", marginTop: 6, fontFamily: FontFamilies.semibold },

  stickyHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: HEADER_HEIGHT,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: "#f6f7f9",
    zIndex: 10,
  },

  tabRow: { flexDirection: "row", gap: 8, marginTop: 10, marginBottom: 10, flexWrap: "wrap" },
  tabChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
  },
  tabChipActive: { backgroundColor: "#0a7ea4" },
  tabChipText: { fontSize: 12, color: "#0f172a", fontWeight: "600", fontFamily: FontFamilies.semibold },
  tabChipTextActive: { color: "white" },

  card: { backgroundColor: "white", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#e2e8f0" },
  cardPressed: { opacity: 0.92 },
  cardCollapsed: { backgroundColor: "white", borderColor: "#e2e8f0" },
  cardExpanded: { backgroundColor: "white", borderColor: "#e2e8f0" },

  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  date: { fontSize: 14, fontWeight: "700", color: "#0f172a", fontFamily: FontFamilies.semibold },

  statusRow: { flexDirection: "row", alignItems: "center" },
  statusBelow: { marginTop: 6 },
  statusText: { fontSize: 12, fontWeight: "700", fontFamily: FontFamilies.semibold },
  paid: { color: "#16a34a" },
  unpaid: { color: "#b91c1c" },

  orderMeta: { fontSize: 12, fontWeight: "600", color: "#0f172a", fontFamily: FontFamilies.semibold },

  expanded: { marginTop: 8, padding: 12, borderRadius: 14, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e2e8f0" },
  expandedTitle: { fontSize: 14, fontWeight: "800", color: "#0f172a", marginBottom: 8, fontFamily: FontFamilies.extrabold },
  expandedPanel: { backgroundColor: "#eef6ff", borderColor: "#bfdbfe" },

  quickSummary: { backgroundColor: "#ffffff" },
  quickDetailsButton: { marginTop: 10, paddingVertical: 10, borderRadius: 10, backgroundColor: "#0a7ea4", alignItems: "center" },
  quickDetailsText: { color: "white", fontWeight: "800", fontFamily: FontFamilies.bold },

  labeledRowGroupCard: { backgroundColor: "#ffffff" },

  v2Date: { fontSize: FontSizes.lg, fontWeight: "800", color: "#0f172a", fontFamily: FontFamilies.extrabold },
  badgeRow: { flexDirection: "row", gap: Spacing.md, alignItems: "center" },
  pendingBadge: { backgroundColor: "#fde68a", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  pendingBadgeText: { fontSize: 11, fontWeight: "800", color: "#78350f", fontFamily: FontFamilies.bold },
  recalcBadge: { backgroundColor: "#dbeafe", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  recalcBadgeText: { fontSize: 11, fontWeight: "800", color: "#1d4ed8", fontFamily: FontFamilies.bold },

  v2CashLabel: { fontSize: 12, fontWeight: "800", color: "#0f172a", marginBottom: 6, fontFamily: FontFamilies.bold },
  v2InvCashRow: { marginTop: 10, flexDirection: "row", gap: 10, alignItems: "stretch" },
  v2InvCompactBox: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    justifyContent: "flex-start",
    minHeight: 120,
  },
  v2InvCompactLabel: { fontSize: 12, fontWeight: "900", marginBottom: 4, fontFamily: FontFamilies.extrabold },
  v2InvCompactValue: { fontSize: 12, fontWeight: "800", color: "#0f172a", marginBottom: 8, fontFamily: FontFamilies.bold },
  v2DeltaBlock: { marginBottom: 6 },
  v2CashBox: { flex: 1, padding: 10, borderRadius: 12, backgroundColor: "#f8fafc" },
  v2InvLabel: { fontSize: 12, fontWeight: "900", marginBottom: 6, fontFamily: FontFamilies.extrabold },
  v2MetricLabelSmall: { fontSize: 12, fontWeight: "800", fontFamily: FontFamilies.bold },

  v2EventSummaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  v2EventSummaryChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  v2EventSummaryText: { fontSize: 11, fontWeight: "900", color: "white", fontFamily: FontFamilies.extrabold },
  collapsedSummaryLine: { color: "#0f172a", fontWeight: "700", marginTop: 6, fontFamily: FontFamilies.semibold },
  collapsedHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: Spacing.lg,
  },
  collapsedLeft: { flex: 1, minWidth: 0 },
  collapsedSubtext: { fontSize: 11, fontWeight: "800", color: "#64748b", marginTop: 2, fontFamily: FontFamilies.bold },
  collapsedRight: { alignItems: "flex-end", gap: 6, maxWidth: "48%", flexShrink: 1 },
  collapsedList: { marginTop: 2, gap: 4 },
  collapsedListItem: { fontSize: FontSizes.sm, fontWeight: "800", color: "#0f172a", flexWrap: "wrap", fontFamily: FontFamilies.bold },
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
  missingMiniLabel: { fontSize: 10, fontWeight: "900", color: "#b91c1c", textAlign: "right", fontFamily: FontFamilies.extrabold },
  missingMiniValue: { marginTop: 2, fontSize: 11, fontWeight: "900", color: "#b91c1c", textAlign: "right", fontFamily: FontFamilies.extrabold },
  auditValue: { marginTop: 2, fontSize: 11, fontWeight: "600", color: "#1f2937", textAlign: "right", fontFamily: FontFamilies.semibold },
  auditAlert: { fontWeight: "900", color: "#b91c1c", fontFamily: FontFamilies.extrabold },
  collapsedEventRow: { justifyContent: "flex-end", marginTop: 0, flexWrap: "wrap" },
  collapsedEventChip: { paddingHorizontal: 6, paddingVertical: 3 },
  collapsedEventText: { fontSize: 10 },
  collapsedChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },

  problemLine: { marginTop: 8, fontSize: 12, fontWeight: "700", color: "#b91c1c", fontFamily: FontFamilies.semibold },

  v2DetailsRow: { marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  v2DetailsText: { fontSize: 12, fontWeight: "800", color: "#0a7ea4", fontFamily: FontFamilies.bold },
  v2Timeline: { backgroundColor: "#ffffff" },

  // balances + header styles live in components/reports
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
  adjustmentTitle: { fontSize: 12, fontWeight: "800", color: "#0f172a", fontFamily: FontFamilies.bold },
  adjustmentReason: { marginTop: 2, fontSize: 11, color: "#64748b", fontFamily: FontFamilies.regular },
  adjustmentActions: { flexDirection: "row", gap: 12 },
  relationshipGood: { color: "#2563eb" },
  relationshipBad: { color: "#b91c1c" },
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
  summaryChipLabel: { fontSize: 10, fontWeight: "800", color: "#334155", fontFamily: FontFamilies.bold },
  summaryChipLabelStack: { gap: 2 },
  summaryChipLabelLine: { fontSize: 10, fontWeight: "800", color: "#334155", lineHeight: 12, fontFamily: FontFamilies.bold },
  summaryChipValue: { marginTop: 6, fontSize: 12, fontWeight: "900", color: "#0f172a", fontFamily: FontFamilies.extrabold },
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
  summaryToggleTitle: { fontSize: 13, fontWeight: "900", color: "#0f172a", fontFamily: FontFamilies.extrabold },
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
    fontFamily: FontFamilies.semibold,
  },
  summaryHeaderCell: {
    fontSize: 10,
    fontWeight: "800",
    color: "#475569",
    textTransform: "uppercase",
    fontFamily: FontFamilies.bold,
  },
  summaryLabelCell: {
    fontWeight: "800",
    fontFamily: FontFamilies.bold,
  },
  summaryMissing: {
    color: "#b91c1c",
  },
  summaryCredit: {
    color: "#2563eb",
  },

  deltaRow: { flexDirection: "row", alignItems: "baseline", gap: 6, flexWrap: "nowrap" },
  deltaEndColumn: { alignItems: "flex-end" },
  deltaValueSm: { fontSize: 14, fontWeight: "900", color: "#0f172a", fontFamily: FontFamilies.extrabold },
  deltaValueLg: { fontSize: 18, fontWeight: "900", color: "#0f172a", fontFamily: FontFamilies.extrabold },
  deltaArrow: { fontSize: 14, fontWeight: "900", color: "#0a7ea4", fontFamily: FontFamilies.extrabold },
  deltaMeta: { fontSize: 12, fontWeight: "800", color: "#475569", fontFamily: FontFamilies.bold },

  metricRow: { marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  metricLabel: { fontSize: 12, fontWeight: "800", color: "#0f172a", fontFamily: FontFamilies.bold },

  table: { padding: 10, borderRadius: 12, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0" },
  tableExpanded: { backgroundColor: "#eef2ff" },
  tableRow: { fontSize: 12, fontWeight: "800", color: "#0f172a", fontFamily: FontFamilies.bold },
  tableMeta: { marginTop: 6, fontSize: 11, color: "#64748b", fontWeight: "700", fontFamily: FontFamilies.semibold },

  subCard: { marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0" },
  subCardTitle: { fontSize: 12, fontWeight: "900", color: "#0f172a", marginBottom: 6, fontFamily: FontFamilies.extrabold },
  subCardRow: { fontSize: 12, fontWeight: "800", color: "#334155", fontFamily: FontFamilies.bold },

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
  eventHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: Spacing.lg, marginBottom: 0 },
  eventHeaderTitleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md, flexWrap: "wrap" },
  eventHeaderRight: { alignItems: "flex-end" },
  eventHeaderRightStack: { alignItems: "flex-end", gap: Spacing.xs },
  eventHeaderLeft: { flex: 1, rowGap: 4 },
  eventBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm, justifyContent: "flex-end" },
  eventBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  eventBadgeOrder: { backgroundColor: "#2563eb" },
  eventBadgeRefill: { backgroundColor: "#f97316" },
  eventBadgeText: { color: "white", fontSize: FontSizes.sm, fontWeight: "900", fontFamily: FontFamilies.extrabold },
  eventTypeText: { fontSize: FontSizes.md, fontWeight: "900", color: "#0f172a", fontFamily: FontFamilies.extrabold },
  eventLabelText: { fontSize: 11, fontWeight: "800", color: "#64748b", fontFamily: FontFamilies.bold },
  eventTimePill: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  eventTimeText: { fontSize: FontSizes.xs, fontWeight: "800", color: "#475569", fontFamily: FontFamilies.semibold },
  eventMetaBlock: { marginTop: 4 },
  eventMetaBlockTight: { marginTop: -2 },
  eventMetaText: { fontSize: 12, fontWeight: "700", color: "#334155", fontFamily: FontFamilies.semibold },
  eventTypePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  eventTypePillText: { color: "white", fontSize: FontSizes.md, fontWeight: "900", fontFamily: FontFamilies.extrabold },
  eventCustomerName: { fontSize: 16, fontWeight: "900", color: "#0f172a", marginBottom: 0, lineHeight: 18, fontFamily: FontFamilies.extrabold },
  eventCustomerNameTight: { marginTop: 0, marginBottom: 2 },
  eventMetaSmall: { fontSize: 12, fontWeight: "700", color: "#64748b", marginTop: 0, lineHeight: 14, fontFamily: FontFamilies.semibold },
  eventMetaSmallTight: { marginTop: 2 },
  eventMetaRight: { textAlign: "right" },
  eventSummaryLine: { marginTop: 0, fontSize: 12, fontWeight: "800", color: "#0f172a", fontFamily: FontFamilies.bold },
  eventSummaryLineTight: { marginTop: 2 },
  eventSummaryLeft: { flex: 1 },
  eventSummaryRight: { textAlign: "right" },
  eventSummaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginTop: 2 },
  eventSummaryRowTight: { marginTop: 0 },
  eventSummaryAlert: { color: "#b91c1c", marginTop: 0, fontFamily: FontFamilies.semibold },
  expenseTitle: { color: "#166534" },
  refillTitle: { color: "#0a7ea4" },
  adjustTitleTight: { marginBottom: 0 },
  adjustHeaderLeft: { rowGap: 0 },
  adjustSummaryRow: { marginTop: 0 },
  eventCreatedAtText: { marginTop: 6, fontSize: 11, fontWeight: "700", color: "#64748b", fontFamily: FontFamilies.semibold },
  eventExpandedRow: { flexDirection: "row", gap: 8, marginTop: 10 },

  eventSection: { marginTop: 10 },
  eventSectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  eventSectionDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: "#0a7ea4" },
  eventSectionTitle: { fontSize: 11, fontWeight: "900", color: "#0f172a", fontFamily: FontFamilies.extrabold },

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
  deltaBoxLabel: { fontSize: 11, fontWeight: "800", color: "#0f172a", fontFamily: FontFamilies.bold },
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
  deltaBadgeText: { fontSize: 11, fontWeight: "900", color: "white", fontFamily: FontFamilies.extrabold },
  deltaBadgeTextSmall: { fontSize: 10 },
  deltaBoxRow: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  deltaBoxValue: { fontSize: 11, fontWeight: "900", color: "#0f172a", fontFamily: FontFamilies.extrabold },
  deltaBoxArrow: { fontSize: 11, fontWeight: "900", color: "#0a7ea4", fontFamily: FontFamilies.extrabold },
  deltaValueGood: { color: "#16a34a" },
  deltaValueBad: { color: "#b91c1c" },
  valueBoxRow: { marginTop: 10, alignItems: "center", justifyContent: "center", minHeight: 18 },
  valueBoxValue: { fontSize: 11, fontWeight: "900", color: "#0f172a", fontFamily: FontFamilies.extrabold },
  valueBoxValueOk: { color: "#16a34a" },
  valueBoxValueBad: { color: "#b91c1c" },
  orderMoneyRow: { flexDirection: "row", gap: 8 },

  dayActions: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 10 },
  dayIconBtn: { padding: 6, borderRadius: 10, backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.35)", padding: 14, justifyContent: "flex-end" },
  modalCard: { backgroundColor: "white", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#e2e8f0" },
  modalTitle: { fontSize: 16, fontWeight: "900", color: "#0f172a", marginBottom: 10, fontFamily: FontFamilies.extrabold },
  modalLabel: { marginTop: 10, fontSize: 12, fontWeight: "900", color: "#0f172a", fontFamily: FontFamilies.extrabold },
  input: { marginTop: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0" },
  half: { width: "48%" },
  primaryBtn: { marginTop: 14, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: "#0a7ea4", flex: 1, alignItems: "center" },
  secondaryBtn: { backgroundColor: "#64748b", marginRight: 10 },
  primaryBtnText: { color: "white", fontWeight: "900", fontFamily: FontFamilies.extrabold },

  smallBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: "#0a7ea4" },
  smallBtnDanger: { backgroundColor: "#b91c1c" },
  smallBtnActive: { backgroundColor: "#0f172a" },
  smallBtnText: { color: "white", fontWeight: "900", fontSize: 12, fontFamily: FontFamilies.extrabold },

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
  chipText: { fontSize: 12, fontWeight: "800", color: "#0f172a", fontFamily: FontFamilies.bold },
  chipTextActive: { color: "white" },

  // iOS accessory
  accessory: { backgroundColor: "#f1f5f9", padding: 8, borderTopWidth: 1, borderTopColor: "#e2e8f0", alignItems: "flex-end" },
  accessoryBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: "#0a7ea4" },
  accessoryBtnText: { color: "white", fontWeight: "900", fontFamily: FontFamilies.extrabold },

  // Sync tooltip
  syncOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.35)", justifyContent: "center", padding: 20 },
  syncTooltip: { backgroundColor: "white", padding: 14, borderRadius: 14, borderWidth: 1, borderColor: "#e2e8f0" },
  syncTitle: { fontSize: 14, fontWeight: "900", color: "#0f172a", fontFamily: FontFamilies.extrabold },
  syncText: { marginTop: 8, fontSize: 12, fontWeight: "700", color: "#334155", fontFamily: FontFamilies.semibold },
  syncClose: { marginTop: 12, alignSelf: "flex-end", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: "#0a7ea4" },
  syncCloseText: { color: "white", fontWeight: "900", fontFamily: FontFamilies.extrabold },
});

