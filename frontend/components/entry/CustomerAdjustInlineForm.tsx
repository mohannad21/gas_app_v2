import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  InputAccessoryView,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import BigBox from "@/components/entry/BigBox";
import FooterActions from "@/components/entry/FooterActions";
import { FieldCell, type FieldStepper } from "@/components/entry/FieldPair";
import MinuteTimePickerModal from "@/components/MinuteTimePickerModal";
import StandaloneField from "@/components/entry/StandaloneField";
import { useCreateCustomerAdjustment } from "@/hooks/useCustomers";
import { getUserFacingApiError, logApiError } from "@/lib/apiErrors";
import { parseCountValue } from "@/lib/countInput";
import { buildActivityHappenedAt, getCurrentLocalDate, getCurrentLocalTime } from "@/lib/date";
import { formatDisplayMoney } from "@/lib/money";
import { showSuccessPulse } from "@/lib/successPulse";

type BalanceState = "customer_owes" | "balanced" | "credit_for_customer";

export type CustomerAdjustInlineFormProps = {
  customerId: string;
  customerSection?: ReactNode;
  date: string;
  accessoryId?: string;
  currentMoneyBalance: number;
  current12Balance: number;
  current48Balance: number;
  balanceReady: boolean;
  onRefreshPreview?: () => Promise<unknown>;
  onSaveSuccess: (details: { effectiveAt: string; highlightId: string }) => void;
  onSaveAndAddSuccess?: () => void;
};

const MONEY_STEPPERS: FieldStepper[] = [
  { delta: -100, label: "-100", position: "extra-top-left" },
  { delta: 100, label: "+100", position: "extra-top-right" },
  { delta: -20, label: "-20", position: "top-left" },
  { delta: 20, label: "+20", position: "top-right" },
  { delta: -5, label: "-5", position: "left" },
  { delta: 5, label: "+5", position: "right" },
];

const COUNT_STEPPERS: FieldStepper[] = [
  { delta: -5, label: "-5", position: "top-left" },
  { delta: 5, label: "+5", position: "top-right" },
  { delta: -1, label: "-1", position: "left" },
  { delta: 1, label: "+1", position: "right" },
];

const BALANCE_OPTIONS: Array<{ id: BalanceState; label: string }> = [
  { id: "customer_owes", label: "Debts on customer" },
  { id: "balanced", label: "Balanced" },
  { id: "credit_for_customer", label: "Credit for customer" },
];

function DateField({
  value,
  icon,
  onPress,
}: {
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.dateField} onPress={onPress}>
      <Text style={styles.dateText}>{value}</Text>
      <Ionicons name={icon} size={16} color="#0a7ea4" />
    </Pressable>
  );
}

function DateModal({
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

const deriveBalance = (value: number) => {
  if (value > 0) return { state: "customer_owes" as BalanceState, amount: Math.abs(value) };
  if (value < 0) return { state: "credit_for_customer" as BalanceState, amount: Math.abs(value) };
  return { state: "balanced" as BalanceState, amount: 0 };
};

const resolveSignedBalance = (state: BalanceState, amount: number) => {
  const normalized = Number.isFinite(amount) ? Math.abs(amount) : 0;
  if (state === "customer_owes") return normalized;
  if (state === "credit_for_customer") return -normalized;
  return 0;
};

const describeState = (state: BalanceState) => {
  if (state === "customer_owes") return "Debts on customer";
  if (state === "credit_for_customer") return "Credit for customer";
  return "Balanced";
};

const describeMoneyValue = (value: number) => {
  const derived = deriveBalance(value);
  if (derived.state === "balanced") return "Balanced";
  return `${describeState(derived.state)} ${formatDisplayMoney(derived.amount)}`;
};

const describeCylinderValue = (value: number, label: string) => {
  const derived = deriveBalance(value);
  if (derived.state === "balanced") return "Balanced";
  return `${describeState(derived.state)} ${derived.amount} ${label}`;
};

export default function CustomerAdjustInlineForm({
  customerId,
  customerSection,
  date,
  accessoryId,
  currentMoneyBalance,
  current12Balance,
  current48Balance,
  balanceReady,
  onRefreshPreview,
  onSaveSuccess,
  onSaveAndAddSuccess,
}: CustomerAdjustInlineFormProps) {
  const createAdjustment = useCreateCustomerAdjustment({ showToast: false });
  const [moneyState, setMoneyState] = useState<BalanceState>("balanced");
  const [moneyAmount, setMoneyAmount] = useState(0);
  const [cyl12State, setCyl12State] = useState<BalanceState>("balanced");
  const [cyl12Amount, setCyl12Amount] = useState(0);
  const [cyl48State, setCyl48State] = useState<BalanceState>("balanced");
  const [cyl48Amount, setCyl48Amount] = useState(0);
  const [reason, setReason] = useState("");
  const [adjustDate, setAdjustDate] = useState(date || getCurrentLocalDate());
  const [adjustTime, setAdjustTime] = useState(getCurrentLocalTime());
  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [pendingSaveAction, setPendingSaveAction] = useState<"save" | "saveAndAdd" | null>(null);
  const [seedKey, setSeedKey] = useState<string | null>(null);

  const desiredMoney = resolveSignedBalance(moneyState, moneyAmount);
  const desired12 = resolveSignedBalance(cyl12State, cyl12Amount);
  const desired48 = resolveSignedBalance(cyl48State, cyl48Amount);
  const saveBusy = createAdjustment.isPending && pendingSaveAction !== null;

  useEffect(() => {
    setAdjustDate(date || getCurrentLocalDate());
  }, [date]);

  useEffect(() => {
    if (!balanceReady || seedKey === "create") return;
    const money = deriveBalance(currentMoneyBalance);
    const cyl12 = deriveBalance(current12Balance);
    const cyl48 = deriveBalance(current48Balance);
    setMoneyState(money.state);
    setMoneyAmount(money.amount);
    setCyl12State(cyl12.state);
    setCyl12Amount(cyl12.amount);
    setCyl48State(cyl48.state);
    setCyl48Amount(cyl48.amount);
    setReason("");
    setAdjustDate(date || getCurrentLocalDate());
    setAdjustTime(getCurrentLocalTime());
    setSeedKey("create");
  }, [balanceReady, current12Balance, current48Balance, currentMoneyBalance, date, seedKey]);

  const saveDisabled = useMemo(
    () =>
      !balanceReady ||
      saveBusy ||
      (desiredMoney === currentMoneyBalance &&
        desired12 === current12Balance &&
        desired48 === current48Balance),
    [
      balanceReady,
      current12Balance,
      current48Balance,
      currentMoneyBalance,
      desired12,
      desired48,
      desiredMoney,
      saveBusy,
    ]
  );

  const reseedFromLatestBalances = async () => {
    await onRefreshPreview?.();
    setSeedKey(null);
  };

  const save = async (resetAfter = false) => {
    setPendingSaveAction(resetAfter ? "saveAndAdd" : "save");
    try {
      const effectiveAt =
        buildActivityHappenedAt({ date: adjustDate, time: adjustTime }) ??
        new Date(`${adjustDate}T${adjustTime}:00`).toISOString();
      const created = await createAdjustment.mutateAsync({
        customer_id: customerId,
        money_balance: desiredMoney,
        cylinder_balance_12kg: desired12,
        cylinder_balance_48kg: desired48,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        happened_at: effectiveAt,
      });
      Keyboard.dismiss();
      showSuccessPulse();
      if (resetAfter) {
        await reseedFromLatestBalances();
        onSaveAndAddSuccess?.();
        return;
      }
      onSaveSuccess({ effectiveAt, highlightId: created.id });
    } catch (err) {
      logApiError("[customer balance adjustment save] error", err);
      Alert.alert("Adjustment failed", getUserFacingApiError(err, "Failed to save customer balance adjustment."));
    } finally {
      setPendingSaveAction(null);
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

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {customerSection}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Date & time</Text>
          <View style={styles.row}>
            <DateField value={adjustDate} icon="calendar-outline" onPress={() => setDateOpen(true)} />
            <DateField value={adjustTime} icon="time-outline" onPress={() => setTimeOpen(true)} />
            <Pressable
              style={styles.nowButton}
              onPress={() => {
                setAdjustDate(getCurrentLocalDate());
                setAdjustTime(getCurrentLocalTime());
              }}
            >
              <Text style={styles.nowButtonText}>Now</Text>
            </Pressable>
          </View>
        </View>

        <BigBox
          title="Money balance"
          statusLine={`Current ${describeMoneyValue(currentMoneyBalance)} -> ${describeMoneyValue(desiredMoney)}`}
          defaultExpanded
        >
          {renderChoices(moneyState, setMoneyState, () => setMoneyAmount(0))}
          {moneyState !== "balanced" ? renderAmountField(moneyAmount, setMoneyAmount, MONEY_STEPPERS, "decimal") : null}
        </BigBox>

        <BigBox
          title="12kg balance"
          statusLine={`Current ${describeCylinderValue(current12Balance, "12kg")} -> ${describeCylinderValue(desired12, "12kg")}`}
          defaultExpanded
        >
          {renderChoices(cyl12State, setCyl12State, () => setCyl12Amount(0))}
          {cyl12State !== "balanced" ? renderAmountField(cyl12Amount, setCyl12Amount, COUNT_STEPPERS) : null}
        </BigBox>

        <BigBox
          title="48kg balance"
          statusLine={`Current ${describeCylinderValue(current48Balance, "48kg")} -> ${describeCylinderValue(desired48, "48kg")}`}
          defaultExpanded
        >
          {renderChoices(cyl48State, setCyl48State, () => setCyl48Amount(0))}
          {cyl48State !== "balanced" ? renderAmountField(cyl48Amount, setCyl48Amount, COUNT_STEPPERS) : null}
        </BigBox>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Reason</Text>
          <TextInput
            style={styles.input}
            placeholder="Optional reason"
            value={reason}
            onChangeText={setReason}
            inputAccessoryViewID={accessoryId}
          />
        </View>
      </ScrollView>

      <FooterActions
        onSave={() => {
          void save(false);
        }}
        onSaveAndAdd={() => {
          void save(true);
        }}
        saveDisabled={saveDisabled}
        saving={saveBusy}
        saveLoading={saveBusy && pendingSaveAction === "save"}
        saveAndAddLoading={saveBusy && pendingSaveAction === "saveAndAdd"}
      />

      <MinuteTimePickerModal
        visible={timeOpen}
        value={adjustTime}
        onSelect={setAdjustTime}
        onClose={() => setTimeOpen(false)}
      />
      <DateModal visible={dateOpen} value={adjustDate} onSelect={setAdjustDate} onClose={() => setDateOpen(false)} />

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
  root: {
    flex: 1,
  },
  content: {
    gap: 12,
    paddingBottom: 100,
  },
  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    gap: 8,
  },
  sectionTitle: {
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
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d7dde4",
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
});
