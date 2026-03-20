import { useEffect, useState } from "react";
import {
  InputAccessoryView,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import CashExpensesView from "@/components/CashExpensesView";
import { useCreateExpense } from "@/hooks/useExpenses";
import { useCreateBankDeposit } from "@/hooks/useBankDeposits";
import { useDailyReportsV2 } from "@/hooks/useReports";
import { formatDateLocale } from "@/lib/date";

function getTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNowTime(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function CalendarModal({
  visible,
  value,
  maxDate,
  onSelect,
  onClose,
}: {
  visible: boolean;
  value: string;
  maxDate: Date;
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

  const today = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const startDay = start.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const monthLabel = formatDateLocale(month, { month: "long", year: "numeric" }, "en-US");
  const selected = value;
  const cells = Array.from({ length: 42 }, (_, index) => {
    const dayNumber = index - startDay + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) return null;
    return dayNumber;
  });

  return (
    <View style={[styles.calendarOverlay, !visible && styles.hidden]}>
      <View style={styles.calendarCard}>
        <View style={styles.calendarHeader}>
          <Pressable
            style={styles.calendarNav}
            onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          >
            <Text style={styles.calendarNavText}>{"<"}</Text>
          </Pressable>
          <Text style={styles.calendarTitle}>{monthLabel}</Text>
          <Pressable
            style={styles.calendarNav}
            onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          >
            <Text style={styles.calendarNavText}>{">"}</Text>
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
            const isFuture = dayDate > today;
            return (
              <Pressable
                key={dayValue}
                disabled={isFuture}
                style={[
                  styles.calendarCell,
                  isSelected && styles.calendarCellSelected,
                  isFuture && styles.calendarCellDisabled,
                ]}
                onPress={() => {
                  onSelect(dayValue);
                  onClose();
                }}
              >
                <Text
                  style={[
                    styles.calendarDayText,
                    isSelected && styles.calendarDayTextSelected,
                    isFuture && styles.calendarDayTextDisabled,
                  ]}
                >
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
  );
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
  const times = Array.from({ length: 96 }, (_, index) => {
    const hour = Math.floor(index / 4);
    const minute = (index % 4) * 15;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  });

  return (
    <View style={[styles.calendarOverlay, !visible && styles.hidden]}>
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
  );
}

export default function NewExpenseScreen() {
  const params = useLocalSearchParams<{ tab?: string | string[]; amount?: string | string[] }>();
  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const amountParam = Array.isArray(params.amount) ? params.amount[0] : params.amount;
  const [expenseMode, setExpenseMode] = useState<"expense" | "wallet_to_bank" | "bank_to_wallet">(
    tabParam === "wallet_to_bank" || tabParam === "bank_to_wallet" ? tabParam : "expense"
  );
  const [expenseType, setExpenseType] = useState("fuel");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [transferAmount, setTransferAmount] = useState(amountParam ?? "");
  const [transferNote, setTransferNote] = useState("");
  const [expenseDate, setExpenseDate] = useState(getTodayDate());
  const [expenseTime, setExpenseTime] = useState(getNowTime());
  const [expenseTimeOpen, setExpenseTimeOpen] = useState(false);
  const [expenseCalendarOpen, setExpenseCalendarOpen] = useState(false);
  const accessoryId = Platform.OS === "ios" ? "expenseAccessory" : undefined;

  const createExpense = useCreateExpense();
  const createBankDeposit = useCreateBankDeposit();
  const todayDate = getTodayDate();
  const dailyReportQuery = useDailyReportsV2(todayDate, todayDate);
  const expenseTypes = ["fuel", "food", "insurance", "car", "other"];

  useEffect(() => {
    if (tabParam === "expense" || tabParam === "wallet_to_bank" || tabParam === "bank_to_wallet") {
      setExpenseMode(tabParam);
    }
  }, [tabParam]);

  useEffect(() => {
    if (amountParam) {
      setTransferAmount(amountParam);
    }
  }, [amountParam]);

  return (
    <View style={styles.screen}>
      <CashExpensesView
        cashBalance={dailyReportQuery.data?.[0]?.cash_end ?? null}
        onRefreshCash={() => dailyReportQuery.refetch()}
        onClose={() => router.back()}
        onTransferNow={(shortfall) => {
          setExpenseMode("bank_to_wallet");
          setTransferAmount(shortfall.toFixed(0));
        }}
        expenseDate={expenseDate}
        setExpenseDate={setExpenseDate}
        expenseTime={expenseTime}
        setExpenseTime={setExpenseTime}
        expenseTimeOpen={expenseTimeOpen}
        setExpenseTimeOpen={setExpenseTimeOpen}
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
        transferAmount={transferAmount}
        setTransferAmount={setTransferAmount}
        transferNote={transferNote}
        setTransferNote={setTransferNote}
        accessoryId={accessoryId}
        createExpense={createExpense}
        createBankDeposit={createBankDeposit}
        CalendarModal={(props) => (
          <CalendarModal {...props} maxDate={new Date()} />
        )}
        TimePickerModal={TimePickerModal}
        styles={styles}
      />
      {Platform.OS === "ios" && accessoryId ? (
        <InputAccessoryView nativeID={accessoryId}>
          <View style={styles.accessoryRow}>
            <Pressable onPress={() => Keyboard.dismiss()} style={styles.accessoryButton}>
              <Text style={styles.accessoryText}>Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f3f5f7",
  },
  expenseScreen: {
    flex: 1,
    backgroundColor: "#f3f5f7",
  },
  expensePageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  expenseTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0f172a",
  },
  modeRow: { flexDirection: "row", gap: 8, marginTop: 6, marginBottom: 2, paddingHorizontal: 14 },
  modeButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
  },
  modeButtonActive: { backgroundColor: "#0a7ea4" },
  modeText: { fontWeight: "700", color: "#1f2937" },
  modeTextActive: { color: "#fff" },
  expenseContent: {
    paddingHorizontal: 14,
    paddingBottom: 140,
    gap: 12,
  },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    gap: 10,
  },
  label: {
    fontWeight: "700",
    color: "#0f172a",
    fontSize: 12,
  },
  entryFieldPairSingle: {
    flexDirection: "row",
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  half: {
    flex: 1,
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d7dde4",
  },
  dateText: {
    color: "#111827",
    fontWeight: "600",
  },
  nowButton: {
    alignSelf: "stretch",
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#0a7ea4",
    alignItems: "center",
    justifyContent: "center",
  },
  nowButtonText: { color: "#fff", fontWeight: "700" },
  walletSentence: {
    fontSize: 14,
    fontWeight: "700",
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
  fieldBlock: {
    gap: 10,
  },
  transferAmountRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },
  transferAmountButton: {
    alignItems: "center",
    backgroundColor: "#e0f2fe",
    borderColor: "#bae6fd",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  transferAmountInput: {
    minWidth: 120,
    textAlign: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  transferHelperText: {
    color: "#b00020",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
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
  expenseFooterPage: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 8,
    backgroundColor: "transparent",
  },
  expenseFooterRow: {
    flexDirection: "row",
    gap: 8,
  },
  expenseFooterCancel: {
    flex: 1,
    backgroundColor: "#dc2626",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  expenseFooterPrimary: {
    flex: 1,
    backgroundColor: "#16a34a",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  expenseFooterSecondary: {
    flex: 1,
    borderColor: "#0a7ea4",
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#0a7ea4",
  },
  expenseFooterCancelText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
    textAlign: "center",
  },
  expenseFooterPrimaryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
    textAlign: "center",
  },
  expenseFooterSecondaryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
    textAlign: "center",
  },
  expenseFooterDisabled: {
    opacity: 0.6,
  },
  calendarOverlay: {
    position: "absolute",
    inset: 0,
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
  calendarNavText: {
    fontWeight: "700",
    color: "#0a7ea4",
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
  calendarCellDisabled: {
    backgroundColor: "#f1f5f9",
  },
  calendarDayText: {
    color: "#1f2937",
    fontWeight: "600",
  },
  calendarDayTextSelected: {
    color: "#fff",
  },
  calendarDayTextDisabled: {
    color: "#9ca3af",
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
  hidden: {
    display: "none",
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

