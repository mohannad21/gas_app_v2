import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import BigBox from "@/components/entry/BigBox";
import FooterActions from "@/components/entry/FooterActions";
import { FieldCell, type FieldStepper } from "@/components/entry/FieldPair";
import MinuteTimePickerModal from "@/components/MinuteTimePickerModal";
import StandaloneField from "@/components/entry/StandaloneField";
import {
  useCompanyBalanceAdjustments,
  useCompanyBalances,
  useCreateCompanyBalanceAdjustment,
  useUpdateCompanyBalanceAdjustment,
} from "@/hooks/useCompanyBalances";
import { getUserFacingApiError, logApiError } from "@/lib/apiErrors";
import { parseCountValue } from "@/lib/countInput";
import { getCurrentLocalDate, getCurrentLocalTime, getTimeHMSFromIso, toDateKey } from "@/lib/date";
import { formatDisplayMoney } from "@/lib/money";

type BalanceState = "debts_on_distributor" | "balanced" | "credit_for_distributor";

const MONEY_STEPPERS: FieldStepper[] = [
  { delta: -20, label: "-20", position: "top-left" },
  { delta: 20, label: "+20", position: "top-right" },
  { delta: -5, label: "-5", position: "left" },
  { delta: 5, label: "+5", position: "right" },
];

const QTY_STEPPERS: FieldStepper[] = [
  { delta: -1, label: "-1", position: "left" },
  { delta: 1, label: "+1", position: "right" },
];

const BALANCE_OPTIONS: Array<{ id: BalanceState; label: string }> = [
  { id: "debts_on_distributor", label: "Debts on distributor" },
  { id: "balanced", label: "Balanced" },
  { id: "credit_for_distributor", label: "Credit for distributor" },
];

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
    if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return new Date();
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
  const cells = Array.from({ length: 42 }, (_, index) => {
    const dayNumber = index - startDay + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) return null;
    return dayNumber;
  });

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.pickerCard}>
          <View style={styles.calendarHeader}>
            <Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
              <Ionicons name="chevron-back" size={18} color="#0a7ea4" />
            </Pressable>
            <Text style={styles.pickerTitle}>
              {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </Text>
            <Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
              <Ionicons name="chevron-forward" size={18} color="#0a7ea4" />
            </Pressable>
          </View>
          <View style={styles.weekRow}>
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <Text key={day} style={styles.weekDay}>
                {day}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map((day, index) =>
              day ? (
                <Pressable
                  key={`${month.getMonth()}-${day}`}
                  style={[
                    styles.calendarCell,
                    formatDate(new Date(month.getFullYear(), month.getMonth(), day)) === value && styles.selectedCell,
                  ]}
                  onPress={() => {
                    onSelect(formatDate(new Date(month.getFullYear(), month.getMonth(), day)));
                    onClose();
                  }}
                >
                  <Text style={styles.calendarCellText}>{day}</Text>
                </Pressable>
              ) : (
                <View key={`empty-${index}`} style={styles.calendarCell} />
              )
            )}
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
  return <MinuteTimePickerModal visible={visible} value={value} onSelect={onSelect} onClose={onClose} />;
}

const getTodayDate = () => getCurrentLocalDate();
const getNowTime = () => getCurrentLocalTime();

const toPositiveNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
};

const toPositiveCount = (value: string) => {
  const parsed = parseCountValue(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(Math.abs(parsed))) : 0;
};

const deriveMoneyBalance = (value: number) => {
  if (value > 0) return { state: "debts_on_distributor" as BalanceState, amount: Math.abs(value) };
  if (value < 0) return { state: "credit_for_distributor" as BalanceState, amount: Math.abs(value) };
  return { state: "balanced" as BalanceState, amount: 0 };
};

const deriveCylinderBalance = (value: number) => {
  if (value < 0) return { state: "debts_on_distributor" as BalanceState, amount: Math.abs(value) };
  if (value > 0) return { state: "credit_for_distributor" as BalanceState, amount: Math.abs(value) };
  return { state: "balanced" as BalanceState, amount: 0 };
};

const resolveMoneyBalance = (state: BalanceState, amount: number) => {
  const normalized = Number.isFinite(amount) ? Math.abs(amount) : 0;
  if (state === "debts_on_distributor") return normalized;
  if (state === "credit_for_distributor") return -normalized;
  return 0;
};

const resolveCylinderBalance = (state: BalanceState, amount: number) => {
  const normalized = Number.isFinite(amount) ? Math.trunc(Math.abs(amount)) : 0;
  if (state === "debts_on_distributor") return -normalized;
  if (state === "credit_for_distributor") return normalized;
  return 0;
};

const describeState = (state: BalanceState) => {
  if (state === "debts_on_distributor") return "Debts on distributor";
  if (state === "credit_for_distributor") return "Credit for distributor";
  return "Balanced";
};

const describeMoneyValue = (value: number) => {
  const derived = deriveMoneyBalance(value);
  if (derived.state === "balanced") return "Balanced";
  return `${describeState(derived.state)} ${formatDisplayMoney(derived.amount)}`;
};

const describeCylinderValue = (value: number) => {
  const derived = deriveCylinderBalance(value);
  if (derived.state === "balanced") return "Balanced";
  return `${describeState(derived.state)} ${derived.amount}`;
};

export default function CompanyBalanceAdjustScreen() {
  const params = useLocalSearchParams<{ adjustmentId?: string | string[] }>();
  const adjustmentId = Array.isArray(params.adjustmentId) ? params.adjustmentId[0] : params.adjustmentId;
  const isEditing = !!adjustmentId;

  const balancesQuery = useCompanyBalances();
  const adjustmentsQuery = useCompanyBalanceAdjustments({ enabled: isEditing });
  const createAdjustment = useCreateCompanyBalanceAdjustment();
  const updateAdjustment = useUpdateCompanyBalanceAdjustment();
  const accessoryId = Platform.OS === "ios" ? "companyBalanceAdjustAccessory" : undefined;

  const editingAdjustment = useMemo(
    () => (adjustmentsQuery.data ?? []).find((entry) => entry.id === adjustmentId) ?? null,
    [adjustmentsQuery.data, adjustmentId]
  );

  const [date, setDate] = useState(getTodayDate());
  const [time, setTime] = useState(getNowTime());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [moneyState, setMoneyState] = useState<BalanceState>("balanced");
  const [moneyAmount, setMoneyAmount] = useState(0);
  const [cyl12State, setCyl12State] = useState<BalanceState>("balanced");
  const [cyl12Amount, setCyl12Amount] = useState(0);
  const [cyl48State, setCyl48State] = useState<BalanceState>("balanced");
  const [cyl48Amount, setCyl48Amount] = useState(0);
  const [note, setNote] = useState("");
  const [seedKey, setSeedKey] = useState<string | null>(null);

  useEffect(() => {
    if (isEditing) {
      if (!editingAdjustment || seedKey === `edit:${editingAdjustment.id}`) return;
      const moneyBalance = deriveMoneyBalance(editingAdjustment.money_balance ?? 0);
      const cyl12Balance = deriveCylinderBalance(editingAdjustment.cylinder_balance_12 ?? 0);
      const cyl48Balance = deriveCylinderBalance(editingAdjustment.cylinder_balance_48 ?? 0);
      setDate(toDateKey(editingAdjustment.happened_at) || getTodayDate());
      setTime(getTimeHMSFromIso(editingAdjustment.happened_at).slice(0, 5));
      setMoneyState(moneyBalance.state);
      setMoneyAmount(moneyBalance.amount);
      setCyl12State(cyl12Balance.state);
      setCyl12Amount(cyl12Balance.amount);
      setCyl48State(cyl48Balance.state);
      setCyl48Amount(cyl48Balance.amount);
      setNote(editingAdjustment.note ?? "");
      setSeedKey(`edit:${editingAdjustment.id}`);
      return;
    }
    if (!balancesQuery.data || seedKey === "create") return;
    const moneyBalance = deriveMoneyBalance(balancesQuery.data.company_money ?? 0);
    const cyl12Balance = deriveCylinderBalance(balancesQuery.data.company_cyl_12 ?? 0);
    const cyl48Balance = deriveCylinderBalance(balancesQuery.data.company_cyl_48 ?? 0);
    setDate(getTodayDate());
    setTime(getNowTime());
    setMoneyState(moneyBalance.state);
    setMoneyAmount(moneyBalance.amount);
    setCyl12State(cyl12Balance.state);
    setCyl12Amount(cyl12Balance.amount);
    setCyl48State(cyl48Balance.state);
    setCyl48Amount(cyl48Balance.amount);
    setNote("");
    setSeedKey("create");
  }, [balancesQuery.data, editingAdjustment, isEditing, seedKey]);

  const currentMoney = balancesQuery.data?.company_money ?? 0;
  const current12 = balancesQuery.data?.company_cyl_12 ?? 0;
  const current48 = balancesQuery.data?.company_cyl_48 ?? 0;
  const nextMoney = resolveMoneyBalance(moneyState, moneyAmount);
  const next12 = resolveCylinderBalance(cyl12State, cyl12Amount);
  const next48 = resolveCylinderBalance(cyl48State, cyl48Amount);
  const baselineDate = isEditing && editingAdjustment ? toDateKey(editingAdjustment.happened_at) : getTodayDate();
  const baselineTime = isEditing && editingAdjustment ? getTimeHMSFromIso(editingAdjustment.happened_at).slice(0, 5) : getNowTime();
  const baselineMoney = isEditing && editingAdjustment ? editingAdjustment.money_balance : currentMoney;
  const baseline12 = isEditing && editingAdjustment ? editingAdjustment.cylinder_balance_12 : current12;
  const baseline48 = isEditing && editingAdjustment ? editingAdjustment.cylinder_balance_48 : current48;
  const baselineNote = isEditing && editingAdjustment ? editingAdjustment.note ?? "" : "";
  const isSubmitting = createAdjustment.isPending || updateAdjustment.isPending;
  const loadingEditTarget = isEditing && adjustmentsQuery.isLoading;
  const missingEditTarget = isEditing && !adjustmentsQuery.isLoading && !editingAdjustment;
  const saveDisabled =
    isSubmitting ||
    !balancesQuery.isSuccess ||
    loadingEditTarget ||
    missingEditTarget ||
    (nextMoney === baselineMoney &&
      next12 === baseline12 &&
      next48 === baseline48 &&
      note.trim() === baselineNote.trim() &&
      date === baselineDate &&
      time === baselineTime);

  const save = async () => {
    try {
      const payload = {
        date,
        time,
        money_balance: nextMoney,
        cylinder_balance_12: next12,
        cylinder_balance_48: next48,
        note: note.trim() || undefined,
      };
      if (adjustmentId) {
        await updateAdjustment.mutateAsync({ id: adjustmentId, payload });
      } else {
        await createAdjustment.mutateAsync(payload);
      }
      Keyboard.dismiss();
      router.back();
    } catch (err: any) {
      logApiError("[company balance adjustment save] error", err);
      Alert.alert(
        isEditing ? "Update failed" : "Adjustment failed",
        getUserFacingApiError(err, isEditing ? "Failed to update company balance adjustment." : "Failed to save company balance adjustment.")
      );
    }
  };

  const renderChoices = (
    selected: BalanceState,
    onChange: (next: BalanceState) => void,
    onBalanced: () => void
  ) => (
    <View style={styles.balanceChoiceRow}>
      {BALANCE_OPTIONS.map((option) => (
        <Pressable
          key={option.id}
          onPress={() => {
            onChange(option.id);
            if (option.id === "balanced") onBalanced();
          }}
          style={({ pressed }) => [
            styles.balanceChoiceButton,
            pressed && styles.chipPressed,
            selected === option.id && styles.chipActive,
          ]}
        >
          <Text style={[styles.balanceChoiceText, selected === option.id && styles.chipTextActive]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const renderAmountField = (
    amount: number,
    setAmount: (next: number) => void,
    steppers: FieldStepper[],
    valueMode: "integer" | "decimal" = "integer"
  ) => (
    <StandaloneField>
      <FieldCell
        title="Amount"
        value={amount}
        valueMode={valueMode}
        onIncrement={() => setAmount(amount + 1)}
        onDecrement={() => setAmount(Math.max(0, amount - 1))}
        onChangeText={(text) => setAmount(valueMode === "decimal" ? toPositiveNumber(text) : toPositiveCount(text))}
        steppers={steppers}
      />
    </StandaloneField>
  );

  if (missingEditTarget) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <View style={styles.center}>
          <Text style={styles.missingTitle}>Adjustment not found.</Text>
          <Pressable style={styles.closeBtn} onPress={() => router.back()}>
            <Text style={styles.closeBtnText}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <KeyboardAvoidingView style={styles.screenInner} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{isEditing ? "Edit Company Balance Adjustment" : "Adjust Company Balances"}</Text>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="close" size={20} color="#0f172a" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.sectionCard}>
            <Text style={[styles.label, styles.sectionLabel]}>Date & time</Text>
            <View style={styles.row}>
              <Pressable style={styles.dateField} onPress={() => setCalendarOpen(true)}>
                <Text style={styles.dateText}>{date}</Text>
                <Ionicons name="calendar-outline" size={16} color="#0a7ea4" />
              </Pressable>
              <Pressable style={styles.dateField} onPress={() => setTimeOpen(true)}>
                <Text style={styles.dateText}>{time}</Text>
                <Ionicons name="time-outline" size={16} color="#0a7ea4" />
              </Pressable>
              <Pressable
                style={styles.nowButton}
                onPress={() => {
                  setDate(getTodayDate());
                  setTime(getNowTime());
                }}
              >
                <Text style={styles.nowButtonText}>Now</Text>
              </Pressable>
            </View>
          </View>

          <BigBox
            title="Money balance"
            statusLine={`Current ${describeMoneyValue(currentMoney)} -> ${describeMoneyValue(nextMoney)}`}
            defaultExpanded
          >
            {renderChoices(moneyState, setMoneyState, () => setMoneyAmount(0))}
            {moneyState !== "balanced" ? renderAmountField(moneyAmount, setMoneyAmount, MONEY_STEPPERS, "decimal") : null}
          </BigBox>

          <BigBox
            title="12kg balance"
            statusLine={`Current ${describeCylinderValue(current12)} -> ${describeCylinderValue(next12)}`}
            defaultExpanded
          >
            {renderChoices(cyl12State, setCyl12State, () => setCyl12Amount(0))}
            {cyl12State !== "balanced" ? renderAmountField(cyl12Amount, setCyl12Amount, QTY_STEPPERS) : null}
          </BigBox>

          <BigBox
            title="48kg balance"
            statusLine={`Current ${describeCylinderValue(current48)} -> ${describeCylinderValue(next48)}`}
            defaultExpanded
          >
            {renderChoices(cyl48State, setCyl48State, () => setCyl48Amount(0))}
            {cyl48State !== "balanced" ? renderAmountField(cyl48Amount, setCyl48Amount, QTY_STEPPERS) : null}
          </BigBox>

          <View style={styles.sectionCard}>
            <Text style={[styles.label, styles.sectionLabel]}>Reason / note</Text>
            <TextInput
              style={styles.input}
              placeholder="Optional note"
              value={note}
              onChangeText={setNote}
              inputAccessoryViewID={accessoryId}
            />
          </View>
        </ScrollView>
        <FooterActions
          onSave={save}
          saveDisabled={saveDisabled}
          saving={isSubmitting}
          saveLabel={isEditing ? "Update" : "Save"}
        />
        <CalendarModal visible={calendarOpen} value={date} onSelect={setDate} onClose={() => setCalendarOpen(false)} />
        <TimePickerModal visible={timeOpen} value={time} onSelect={setTime} onClose={() => setTimeOpen(false)} />
      </KeyboardAvoidingView>
      {Platform.OS === "ios" && accessoryId ? (
        <InputAccessoryView nativeID={accessoryId}>
          <View style={styles.accessoryRow}>
            <Pressable onPress={() => Keyboard.dismiss()} style={styles.accessoryButton}>
              <Text style={styles.accessoryText}>Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f3f5f7",
  },
  screenInner: {
    flex: 1,
    backgroundColor: "#f3f5f7",
    padding: 14,
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    flex: 1,
    fontSize: 26,
    fontWeight: "800",
    color: "#0f172a",
    paddingRight: 12,
  },
  content: {
    gap: 12,
    paddingBottom: 8,
  },
  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    gap: 8,
  },
  sectionLabel: {
    marginTop: 0,
  },
  label: {
    marginTop: 10,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: "700",
    color: "#1c1c1c",
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  dateField: {
    flex: 1,
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
  balanceChoiceRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  balanceChoiceButton: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#e8eef1",
    alignItems: "center",
    justifyContent: "center",
  },
  balanceChoiceText: {
    color: "#444",
    fontWeight: "600",
    fontSize: 12,
    textAlign: "center",
  },
  chipPressed: {
    opacity: 0.8,
  },
  chipActive: {
    backgroundColor: "#0a7ea4",
  },
  chipTextActive: {
    color: "#fff",
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d7dde4",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  pickerCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  pickerTitle: {
    fontWeight: "700",
    fontSize: 16,
    color: "#1f2937",
    textAlign: "center",
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  weekDay: {
    width: 36,
    textAlign: "center",
    color: "#64748b",
    fontWeight: "600",
    fontSize: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    justifyContent: "space-between",
  },
  calendarCell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedCell: {
    backgroundColor: "#d7eef8",
  },
  calendarCellText: {
    color: "#1f2937",
    fontWeight: "600",
  },
  closeBtn: {
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#0a7ea4",
  },
  closeBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
  accessoryRow: {
    padding: 8,
    alignItems: "flex-end",
    backgroundColor: "#f8fafc",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#d7dde4",
  },
  accessoryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  accessoryText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 20,
  },
  missingTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
  },
});
