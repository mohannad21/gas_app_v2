import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { RefillForm } from "@/components/AddRefillModal";
import BigBox from "@/components/entry/BigBox";
import FooterActions from "@/components/entry/FooterActions";
import { FieldCell, type FieldStepper } from "@/components/entry/FieldPair";
import MinuteTimePickerModal from "@/components/MinuteTimePickerModal";
import StandaloneField from "@/components/entry/StandaloneField";
import InlineWalletFundingPrompt from "@/components/InlineWalletFundingPrompt";
import { getUserFacingApiError, logApiError } from "@/lib/apiErrors";
import { useCreateCashAdjustment, useCashAdjustments, useUpdateCashAdjustment } from "@/hooks/useCash";
import { useCompanyBalances } from "@/hooks/useCompanyBalances";
import { useCreateCompanyPayment } from "@/hooks/useCompanyPayments";
import { formatBalanceTransitions, makeBalanceTransition } from "@/lib/balanceTransitions";
import { parseCountValue, sanitizeCountInput } from "@/lib/countInput";
import { formatDisplayMoney } from "@/lib/money";
import { CUSTOMER_WORDING } from "@/lib/wording";
import {
  useAdjustInventory,
  useInventoryAdjustments,
  useInventoryLatest,
  useInventoryRefillDetails,
  useUpdateInventoryAdjustment,
} from "@/hooks/useInventory";
import { useDailyReportsV2 } from "@/hooks/useReports";
import { CashAdjustment, InventoryAdjustment } from "@/types/domain";
import { formatDateLocale, formatTimeHMS, getCurrentLocalDate, getCurrentLocalTime, toDateKey } from "@/lib/date";

type InventoryTab = "refill" | "return" | "payment" | "buy" | "cash" | "inventory";
type InventorySection = "company" | "ledger";
type CompanyInventoryTab = Extract<InventoryTab, "refill" | "return" | "payment" | "buy">;
type LedgerInventoryTab = Extract<InventoryTab, "cash" | "inventory">;

const COMPANY_TABS: CompanyInventoryTab[] = ["refill", "return", "payment", "buy"];
const LEDGER_TABS: LedgerInventoryTab[] = ["inventory", "cash"];
const CASH_ADJUST_STEPPERS: FieldStepper[] = [
  { delta: -100, label: "-100", position: "extra-top-left" },
  { delta: 100, label: "+100", position: "extra-top-right" },
  { delta: -20, label: "-20", position: "top-left" },
  { delta: 20, label: "+20", position: "top-right" },
  { delta: -5, label: "-5", position: "left" },
  { delta: 5, label: "+5", position: "right" },
];
const MONEY_STEPPERS: FieldStepper[] = [
  { delta: -20, label: "-20", position: "top-left" },
  { delta: 20, label: "+20", position: "top-right" },
  { delta: -5, label: "-5", position: "left" },
  { delta: 5, label: "+5", position: "right" },
];

function getLocalDateString() {
  return getCurrentLocalDate();
}

function getNowTime() {
  return getCurrentLocalTime();
}

function newInventoryAdjustGroupId() {
  return `inventory-adjust-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatCountTransitionComment(before: number | null | undefined, after: number | null | undefined) {
  if (before === null || before === undefined || after === null || after === undefined) return undefined;
  return `${before}->${after}`;
}

function formatMoneyTransitionComment(before: number | null | undefined, after: number | null | undefined) {
  if (before === null || before === undefined || after === null || after === undefined) return undefined;
  return `${formatDisplayMoney(before)}->${formatDisplayMoney(after)}`;
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
  const monthLabel = formatDateLocale(month, { month: "long", year: "numeric" }, "en-US");
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

function InventoryAdjustForm({
  visible,
  entry,
  date,
  accessoryId,
  inventoryBefore,
  isSubmitting,
  onCreate,
  onUpdate,
  onSaved,
}: {
  visible: boolean;
  entry: InventoryAdjustment | null;
  date: string;
  accessoryId?: string;
  inventoryBefore: { full12: number; empty12: number; full48: number; empty48: number } | null;
  isSubmitting?: boolean;
  onCreate: (payload: {
    date: string;
    time?: string;
    gas_type: "12kg" | "48kg";
    delta_full: number;
    delta_empty: number;
    reason?: string;
    group_id?: string;
  }) => Promise<void>;
  onUpdate: (id: string, payload: { delta_full?: number; delta_empty?: number; reason?: string }) => Promise<void>;
  onSaved: () => void;
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
        setAdjustDate(toDateKey(parsed));
        setAdjustTime(formatTimeHMS(parsed, { hour12: false }));
      }
    } else {
      setAdjustDate(date);
      setAdjustTime(getNowTime());
    }
  }, [entry, visible, date]);

  const deltaFull12 = parseCountValue(full12, { allowNegative: true });
  const deltaEmpty12 = parseCountValue(empty12, { allowNegative: true });
  const deltaFull48 = parseCountValue(full48, { allowNegative: true });
  const deltaEmpty48 = parseCountValue(empty48, { allowNegative: true });
  const baseFull12 = inventoryBefore?.full12;
  const baseEmpty12 = inventoryBefore?.empty12;
  const baseFull48 = inventoryBefore?.full48;
  const baseEmpty48 = inventoryBefore?.empty48;
  const full12Comment = formatCountTransitionComment(baseFull12, baseFull12 !== undefined ? baseFull12 + deltaFull12 : undefined);
  const empty12Comment = formatCountTransitionComment(baseEmpty12, baseEmpty12 !== undefined ? baseEmpty12 + deltaEmpty12 : undefined);
  const full48Comment = formatCountTransitionComment(baseFull48, baseFull48 !== undefined ? baseFull48 + deltaFull48 : undefined);
  const empty48Comment = formatCountTransitionComment(baseEmpty48, baseEmpty48 !== undefined ? baseEmpty48 + deltaEmpty48 : undefined);

  const resetForm = () => {
    setGasType(entry?.gas_type ?? "12kg");
    setFull12(String(entry?.gas_type === "12kg" ? entry?.delta_full ?? 0 : 0));
    setEmpty12(String(entry?.gas_type === "12kg" ? entry?.delta_empty ?? 0 : 0));
    setFull48(String(entry?.gas_type === "48kg" ? entry?.delta_full ?? 0 : 0));
    setEmpty48(String(entry?.gas_type === "48kg" ? entry?.delta_empty ?? 0 : 0));
    setReason(entry?.reason ?? "");
    setAdjustDate(date);
    setAdjustTime(getNowTime());
  };

  const save = async (resetAfter = false) => {
    const trimmedReason = reason.trim();
    try {
      if (entry) {
        const delta_full = gasType === "12kg" ? deltaFull12 : deltaFull48;
        const delta_empty = gasType === "12kg" ? deltaEmpty12 : deltaEmpty48;
        await onUpdate(entry.id, { delta_full, delta_empty, reason: trimmedReason || undefined });
      } else {
        const groupId = newInventoryAdjustGroupId();
        if (deltaFull12 || deltaEmpty12) {
          await onCreate({
            date: adjustDate,
            time: adjustTime,
            gas_type: "12kg",
            delta_full: deltaFull12,
            delta_empty: deltaEmpty12,
            reason: trimmedReason || undefined,
            group_id: groupId,
          });
        }
        if (deltaFull48 || deltaEmpty48) {
          await onCreate({
            date: adjustDate,
            time: adjustTime,
            gas_type: "48kg",
            delta_full: deltaFull48,
            delta_empty: deltaEmpty48,
            reason: trimmedReason || undefined,
            group_id: groupId,
          });
        }
      }
      if (resetAfter && !entry) {
        resetForm();
      } else {
        onSaved();
      }
    } catch (err: any) {
      logApiError("[inventory adjustment save] error", err);
      Alert.alert("Adjustment failed", getUserFacingApiError(err, "Failed to save adjustment."));
    }
  };

  const stepValue = (setter: (value: string) => void, value: string, delta: number) => {
    const current = parseCountValue(value, { allowNegative: true });
    setter(String(current + delta));
  };

  return (
    <View style={[styles.hubForm, styles.hubFormScreen]}>
      <ScrollView contentContainerStyle={styles.hubFormContent} keyboardShouldPersistTaps="handled">
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

      <BigBox title="12kg" defaultExpanded>
        <View style={styles.entryFieldPair}>
          <FieldCell
            title="Full"
            comment={full12Comment}
            value={deltaFull12}
            allowNegative
            onIncrement={() => {
              if (entry && gasType !== "12kg") return;
              stepValue(setFull12, full12, 1);
            }}
            onDecrement={() => {
              if (entry && gasType !== "12kg") return;
              stepValue(setFull12, full12, -1);
            }}
            onChangeText={(value) => setFull12(sanitizeCountInput(value, { allowNegative: true }))}
            editable={!entry || gasType === "12kg"}
          />
          <FieldCell
            title="Empty"
            comment={empty12Comment}
            value={deltaEmpty12}
            allowNegative
            onIncrement={() => {
              if (entry && gasType !== "12kg") return;
              stepValue(setEmpty12, empty12, 1);
            }}
            onDecrement={() => {
              if (entry && gasType !== "12kg") return;
              stepValue(setEmpty12, empty12, -1);
            }}
            onChangeText={(value) => setEmpty12(sanitizeCountInput(value, { allowNegative: true }))}
            editable={!entry || gasType === "12kg"}
          />
        </View>
      </BigBox>
      <BigBox title="48kg" defaultExpanded>
        <View style={styles.entryFieldPair}>
          <FieldCell
            title="Full"
            comment={full48Comment}
            value={deltaFull48}
            allowNegative
            onIncrement={() => {
              if (entry && gasType !== "48kg") return;
              stepValue(setFull48, full48, 1);
            }}
            onDecrement={() => {
              if (entry && gasType !== "48kg") return;
              stepValue(setFull48, full48, -1);
            }}
            onChangeText={(value) => setFull48(sanitizeCountInput(value, { allowNegative: true }))}
            editable={!entry || gasType === "48kg"}
          />
          <FieldCell
            title="Empty"
            comment={empty48Comment}
            value={deltaEmpty48}
            allowNegative
            onIncrement={() => {
              if (entry && gasType !== "48kg") return;
              stepValue(setEmpty48, empty48, 1);
            }}
            onDecrement={() => {
              if (entry && gasType !== "48kg") return;
              stepValue(setEmpty48, empty48, -1);
            }}
            onChangeText={(value) => setEmpty48(sanitizeCountInput(value, { allowNegative: true }))}
            editable={!entry || gasType === "48kg"}
          />
        </View>
      </BigBox>

      <Text style={styles.modalLabel}>Reason (optional: count_correction | shrinkage | damage)</Text>
      <TextInput
        style={styles.modalInput}
        placeholder="Optional"
        value={reason}
        onChangeText={setReason}
      />
      <Text style={styles.modalHint}>Adjustments are for corrections only. Use Refill/Buy Iron for purchases.</Text>
      </ScrollView>
      <FooterActions
        onSave={() => save(false)}
        onSaveAndAdd={() => save(!entry)}
        saveDisabled={Boolean(isSubmitting)}
        saving={Boolean(isSubmitting)}
      />
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
  isSubmitting,
  onCreate,
  onUpdate,
  onSaved,
}: {
  visible: boolean;
  entry: CashAdjustment | null;
  date: string;
  accessoryId?: string;
  cashBefore: number | null;
  isSubmitting?: boolean;
  onCreate: (payload: { date: string; time?: string; delta_cash: number; reason?: string }) => Promise<void>;
  onUpdate: (id: string, payload: { delta_cash?: number; reason?: string }) => Promise<void>;
  onSaved: () => void;
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
        setAdjustDate(toDateKey(parsed));
        setAdjustTime(formatTimeHMS(parsed, { hour12: false }));
      }
    } else {
      setAdjustDate(date);
      setAdjustTime(getNowTime());
    }
  }, [entry, visible, date]);

  const deltaValue = Number(deltaCash) || 0;
  const cashComment = formatMoneyTransitionComment(cashBefore, cashBefore !== null ? cashBefore + deltaValue : null);

  const resetForm = () => {
    setDeltaCash(String(entry?.delta_cash ?? 0));
    setReason(entry?.reason ?? "");
    setAdjustDate(date);
    setAdjustTime(getNowTime());
  };

  const save = async (resetAfter = false) => {
    const trimmedReason = reason.trim();
    try {
      if (entry) {
        await onUpdate(entry.id, { delta_cash: deltaValue, reason: trimmedReason || undefined });
      } else {
        await onCreate({ date: adjustDate, time: adjustTime, delta_cash: deltaValue, reason: trimmedReason || undefined });
      }
      if (resetAfter && !entry) {
        resetForm();
      } else {
        onSaved();
      }
    } catch (err: any) {
      logApiError("[cash adjustment save] error", err);
      Alert.alert("Adjustment failed", getUserFacingApiError(err, "Failed to save adjustment."));
    }
  };

  const stepValue = (delta: number) => {
    const current = Number(deltaCash) || 0;
    setDeltaCash(String(current + delta));
  };

  return (
    <View style={[styles.hubForm, styles.hubFormScreen]}>
      <ScrollView contentContainerStyle={styles.hubFormContent} keyboardShouldPersistTaps="handled">
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
      <BigBox title="Amount" defaultExpanded>
        <StandaloneField>
          <FieldCell
            title="Amount"
            comment={cashComment}
            value={deltaValue}
            valueMode="decimal"
            allowNegative
            onIncrement={() => stepValue(5)}
            onDecrement={() => stepValue(-5)}
            onChangeText={setDeltaCash}
            steppers={CASH_ADJUST_STEPPERS}
          />
        </StandaloneField>
      </BigBox>

      <Text style={styles.modalLabel}>Reason (optional)</Text>
      <TextInput style={styles.modalInput} placeholder="Optional" value={reason} onChangeText={setReason} />
      </ScrollView>
      <FooterActions
        onSave={() => save(false)}
        onSaveAndAdd={() => save(!entry)}
        saveDisabled={Boolean(isSubmitting)}
        saving={Boolean(isSubmitting)}
      />
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

function CompanyPaymentForm({
  visible,
  date,
  accessoryId,
  companyBalance,
  walletBalance,
  balanceReady,
  isSubmitting,
  onCreate,
  onSaved,
}: {
  visible: boolean;
  date: string;
  accessoryId?: string;
  companyBalance: number;
  walletBalance: number;
  balanceReady: boolean;
  isSubmitting?: boolean;
  onCreate: (payload: { date: string; time?: string; amount: number; note?: string }) => Promise<void>;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [payDate, setPayDate] = useState(() => date);
  const [payTime, setPayTime] = useState(() => getNowTime());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [paymentDirection, setPaymentDirection] = useState<"pay" | "receive">("pay");

  useEffect(() => {
    if (!visible) return;
    setAmount("");
    setNote("");
    setPayDate(date);
    setPayTime(getNowTime());
  }, [visible, date]);

  useEffect(() => {
    if (!visible) return;
    if (companyBalance > 0) {
      setPaymentDirection("pay");
    } else if (companyBalance < 0) {
      setPaymentDirection("receive");
    }
  }, [companyBalance, visible]);

  const amountValue = Number(amount) || 0;
  const totalDue = Math.abs(companyBalance);
  const normalizedAmount = paymentDirection === "receive" ? -amountValue : amountValue;
  const companyBalanceAfter = companyBalance - normalizedAmount;
  const walletAfter = paymentDirection === "receive"
    ? walletBalance + amountValue
    : Math.max(walletBalance - amountValue, 0);
  const companyPreviewLines = formatBalanceTransitions(
    [makeBalanceTransition("company", "money", companyBalance, companyBalanceAfter)],
    {
      mode: amountValue > 0 ? "transition" : "current",
      collapseAllSettled: true,
      intent: "company_payment",
      formatMoney: (value) => formatDisplayMoney(value),
    }
  );
  const payDisabled = companyBalance <= 0;
  const receiveDisabled = companyBalance >= 0;
  const tableDisabled = !balanceReady || companyBalance === 0;
  const companyPaymentShortfall =
    paymentDirection === "pay" ? Math.max(amountValue - walletBalance, 0) : 0;
  const paymentStatusLine = companyPreviewLines.join("\n");

  const resetForm = () => {
    setAmount("");
    setNote("");
    setPayDate(date);
    setPayTime(getNowTime());
  };

  const save = async (resetAfter = false) => {
    if (amountValue <= 0) {
      Alert.alert("Missing amount", "Enter a payment amount.");
      return;
    }
    try {
      await onCreate({
        date: payDate,
        time: payTime,
        amount: normalizedAmount,
        note: note.trim() || undefined,
      });
      if (resetAfter) {
        resetForm();
      } else {
        onSaved();
      }
    } catch (err: any) {
      logApiError("[company payment save] error", err);
      Alert.alert("Payment failed", getUserFacingApiError(err, "Failed to save payment."));
    }
  };

  const stepValue = (delta: number) => {
    const current = Number(amount) || 0;
    setAmount(String(Math.max(current + delta, 0)));
  };

  return (
    <View style={[styles.hubForm, styles.hubFormScreen]}>
      <ScrollView contentContainerStyle={styles.hubFormContent} keyboardShouldPersistTaps="handled">
      <View style={styles.hubSectionCard}>
        <Text style={[styles.modalLabel, styles.sectionCardLabel]}>Date & time</Text>
        <View style={styles.row}>
          <Pressable style={styles.dateField} onPress={() => setCalendarOpen(true)}>
            <Text style={styles.dateText}>{payDate}</Text>
            <Ionicons name="calendar-outline" size={16} color="#0a7ea4" />
          </Pressable>
          <Pressable style={styles.dateField} onPress={() => setTimeOpen(true)}>
            <Text style={styles.dateText}>{payTime}</Text>
            <Ionicons name="time-outline" size={16} color="#0a7ea4" />
          </Pressable>
          <Pressable
            style={styles.nowButton}
            onPress={() => {
              setPayDate(getLocalDateString());
              setPayTime(getNowTime());
            }}
          >
            <Text style={styles.nowButtonText}>Now</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.hubSectionCard}>
        <Text style={[styles.modalLabel, styles.sectionCardLabel]}>Payment direction</Text>
        <View style={styles.modeRow}>
          <Pressable
            onPress={() => {
              if (receiveDisabled) return;
              setPaymentDirection("receive");
            }}
            disabled={receiveDisabled}
            style={[
              styles.modeButton,
              paymentDirection === "receive" && styles.modeButtonActive,
              receiveDisabled && styles.modeButtonDisabled,
            ]}
          >
            <Text
              style={[
                styles.modeText,
                paymentDirection === "receive" && styles.modeTextActive,
                receiveDisabled && styles.modeTextDisabled,
              ]}
            >
              Receive
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (payDisabled) return;
              setPaymentDirection("pay");
            }}
            disabled={payDisabled}
            style={[
              styles.modeButton,
              paymentDirection === "pay" && styles.modeButtonActive,
              payDisabled && styles.modeButtonDisabled,
            ]}
          >
            <Text
              style={[
                styles.modeText,
                paymentDirection === "pay" && styles.modeTextActive,
                payDisabled && styles.modeTextDisabled,
              ]}
            >
              Pay
            </Text>
          </Pressable>
        </View>
      </View>
      <BigBox
        title={CUSTOMER_WORDING.money}
        statusLine={
          !balanceReady
            ? "Current company balances unavailable. Preview is disabled until balances load."
            : paymentStatusLine
        }
        statusIsAlert={companyBalanceAfter > 0}
        defaultExpanded
      >
        <StandaloneField
          style={tableDisabled ? styles.sectionDisabled : undefined}
          pointerEvents={tableDisabled ? "none" : "auto"}
        >
          <FieldCell
            title={CUSTOMER_WORDING.paid}
            comment={`Wallet ${formatDisplayMoney(walletBalance)} -> ${formatDisplayMoney(walletAfter)}`}
            value={amountValue}
            valueMode="decimal"
            onIncrement={() => stepValue(5)}
            onDecrement={() => stepValue(-5)}
            onChangeText={setAmount}
            steppers={MONEY_STEPPERS}
          />
        </StandaloneField>
        <View style={styles.bigBoxActionRow}>
          <StandaloneField>
            <Pressable
              style={[
                styles.inlineActionButton,
                { width: "100%", alignSelf: "stretch", minWidth: 0 },
                amountValue === 0 ? styles.inlineActionButtonSuccess : null,
              ]}
              onPress={() => {
                if (amountValue === 0) {
                  setAmount(formatDisplayMoney(totalDue));
                } else {
                  setAmount("0");
                }
              }}
            >
              <Text style={styles.inlineActionText}>
                {amountValue === 0
                  ? paymentDirection === "receive"
                    ? "Receive all"
                    : CUSTOMER_WORDING.payAll
                  : CUSTOMER_WORDING.didntPay}
              </Text>
            </Pressable>
          </StandaloneField>
        </View>
        <InlineWalletFundingPrompt
          walletAmount={walletBalance}
          shortfall={companyPaymentShortfall}
          onTransferNow={
            companyPaymentShortfall > 0
              ? () =>
                  router.push({
                    pathname: "/expenses/new",
                    params: {
                      tab: "bank_to_wallet",
                      amount: formatDisplayMoney(companyPaymentShortfall),
                    },
                  })
              : undefined
          }
        />
      </BigBox>
      <View style={styles.hubSectionCard}>
        <Text style={[styles.modalLabel, styles.sectionCardLabel]}>Reason / type</Text>
        <TextInput
          style={styles.modalInput}
          placeholder="Optional note"
          value={note}
          onChangeText={setNote}
          inputAccessoryViewID={accessoryId}
        />
      </View>
      </ScrollView>
      <FooterActions
        onSave={() => save(false)}
        onSaveAndAdd={() => save(true)}
        saveDisabled={tableDisabled || Boolean(isSubmitting)}
        saving={Boolean(isSubmitting)}
      />
      <CalendarModal
        visible={calendarOpen}
        value={payDate}
        onSelect={(next) => {
          setPayDate(next);
          setCalendarOpen(false);
        }}
        onClose={() => setCalendarOpen(false)}
      />
      <TimePickerModal
        visible={timeOpen}
        value={payTime}
        onSelect={(next) => {
          setPayTime(next);
          setTimeOpen(false);
        }}
        onClose={() => setTimeOpen(false)}
      />
    </View>
  );
}

export default function InventoryNewScreen() {
  const params = useLocalSearchParams<{
    section?: string | string[];
    tab?: string | string[];
    refillId?: string | string[];
    adjustId?: string | string[];
    cashId?: string | string[];
  }>();
  const sectionParam = Array.isArray(params.section) ? params.section[0] : params.section;
  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const refillId = Array.isArray(params.refillId) ? params.refillId[0] : params.refillId;
  const adjustId = Array.isArray(params.adjustId) ? params.adjustId[0] : params.adjustId;
  const cashId = Array.isArray(params.cashId) ? params.cashId[0] : params.cashId;

  const section = useMemo<InventorySection>(() => {
    if (sectionParam === "company" || sectionParam === "ledger") {
      return sectionParam;
    }
    if (cashId || adjustId) {
      return "ledger";
    }
    return "company";
  }, [sectionParam, cashId, adjustId]);
  const visibleTabs = section === "company" ? COMPANY_TABS : LEDGER_TABS;

  const resolveTab = useCallback(
    (nextSection: InventorySection): InventoryTab => {
      if (nextSection === "company") {
        if (
          tabParam === "refill" ||
          tabParam === "buy" ||
          tabParam === "return" ||
          tabParam === "payment"
        ) {
          return tabParam;
        }
        if (refillId) return "refill";
        return "refill";
      }
      if (tabParam === "cash" || tabParam === "inventory") {
        return tabParam;
      }
      if (cashId) return "cash";
      if (adjustId) return "inventory";
      return "inventory";
    },
    [tabParam, refillId, cashId, adjustId]
  );

  const [activeTab, setActiveTab] = useState<InventoryTab>(resolveTab(section));
  const businessDate = getLocalDateString();
  const accessoryId = Platform.OS === "ios" ? "inventoryAccessory" : undefined;

  const inventoryLatest = useInventoryLatest();
  const dailyReportQuery = useDailyReportsV2(businessDate, businessDate);
  const companyBalancesQuery = useCompanyBalances();
  const inventoryAdjustmentsQuery = useInventoryAdjustments(businessDate, true);
  const cashAdjustmentsQuery = useCashAdjustments(businessDate, true);
  const refillDetailsQuery = useInventoryRefillDetails(refillId ?? null);

  const editingInventoryAdjust = useMemo(() => {
    if (!adjustId) return null;
    return inventoryAdjustmentsQuery.data?.find((entry) => entry.id === adjustId) ?? null;
  }, [adjustId, inventoryAdjustmentsQuery.data]);

  const editingCashAdjust = useMemo(() => {
    if (!cashId) return null;
    return cashAdjustmentsQuery.data?.find((entry) => entry.id === cashId) ?? null;
  }, [cashId, cashAdjustmentsQuery.data]);

  const editRefill = useMemo(() => {
    const detail = refillDetailsQuery.data;
    if (!detail) return null;
    return {
      refill_id: detail.refill_id,
      date: detail.business_date,
      time_of_day: detail.time_of_day ?? "morning",
      effective_at: detail.effective_at,
      buy12: detail.buy12,
      return12: detail.return12,
      buy48: detail.buy48,
      return48: detail.return48,
    };
  }, [refillDetailsQuery.data]);

  const adjustInventory = useAdjustInventory();
  const updateInventoryAdjust = useUpdateInventoryAdjustment();
  const createCashAdjust = useCreateCashAdjustment();
  const updateCashAdjust = useUpdateCashAdjustment();
  const createCompanyPayment = useCreateCompanyPayment();
  const companyBalances = companyBalancesQuery.data ?? null;
  const companyBalanceReady = companyBalancesQuery.isSuccess;
  const companyBalance = companyBalances?.company_money ?? 0;
  const company12Balance = companyBalances?.company_cyl_12 ?? 0;
  const company48Balance = companyBalances?.company_cyl_48 ?? 0;
  const paymentTabDisabled = !companyBalanceReady || companyBalance === 0;
  const returnTabDisabled = !companyBalanceReady || (company12Balance >= 0 && company48Balance >= 0);
  const closeScreen = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace({ pathname: "/(tabs)/add" });
  }, []);

  useEffect(() => {
    setActiveTab(resolveTab(section));
  }, [section, resolveTab]);

  useEffect(() => {
    if (section === "ledger" && activeTab !== "cash" && activeTab !== "inventory") {
      setActiveTab(resolveTab("ledger"));
      return;
    }
    if (activeTab === "payment" && paymentTabDisabled) {
      setActiveTab("refill");
    }
    if (activeTab === "return" && returnTabDisabled) {
      setActiveTab("refill");
    }
  }, [activeTab, paymentTabDisabled, returnTabDisabled, section, resolveTab]);

  return (
    <SafeAreaView style={styles.hubSafeArea} edges={["bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
        style={styles.hubScreenInner}
      >
        <View style={styles.hubHeaderRow}>
          <Text style={styles.hubTitle}>
            {section === "company" ? "Company Activities" : "Ledger Adjustments"}
          </Text>
          {section === "company" ? (
            <Pressable
              style={styles.hubHeaderButton}
              onPress={() => router.push("/inventory/company-balance-adjust")}
              accessibilityRole="button"
              accessibilityLabel="Adjust company balances"
            >
              <Text style={styles.hubHeaderButtonText}>Adjust balances</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.modeRow}>
          {visibleTabs.map((tab) => {
            const label =
              tab === "refill"
                ? "Refill"
                : tab === "return"
                  ? "Return"
                  : tab === "payment"
                    ? "Payment"
              : tab === "buy"
                  ? "Buy Full"
                : tab === "cash"
                    ? "Adjust Wallet"
                    : "Adjust Inventory";
            const disabled =
              tab === "payment" ? paymentTabDisabled : tab === "return" ? returnTabDisabled : false;
            return (
              <Pressable
                key={tab}
                onPress={() => {
                  if (disabled) return;
                  setActiveTab(tab);
                }}
                disabled={disabled}
                style={[
                  styles.modeButton,
                  activeTab === tab && styles.modeButtonActive,
                  disabled && styles.modeButtonDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.modeText,
                    activeTab === tab && styles.modeTextActive,
                    disabled && styles.modeTextDisabled,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {activeTab === "refill" || activeTab === "buy" || activeTab === "return" ? (
          <RefillForm
            visible
            onClose={closeScreen}
            onSaved={closeScreen}
            accessoryId={accessoryId}
            editEntry={activeTab === "refill" ? editRefill : null}
            showHeader={false}
            useCard={false}
            mode={activeTab === "return" ? "return" : activeTab === "buy" ? "buy" : "refill"}
            containerStyle={styles.hubFormContainer}
            scrollStyle={styles.hubScroll}
            walletBalance={dailyReportQuery.data?.[0]?.cash_end ?? 0}
          />
        ) : (
          activeTab === "payment" ? (
            <CompanyPaymentForm
              visible
              date={businessDate}
              accessoryId={accessoryId}
              companyBalance={companyBalance}
              walletBalance={dailyReportQuery.data?.[0]?.cash_end ?? 0}
              balanceReady={companyBalanceReady}
              isSubmitting={createCompanyPayment.isPending}
              onCreate={async (payload) => {
                await createCompanyPayment.mutateAsync(payload);
              }}
              onSaved={closeScreen}
            />
          ) : activeTab === "cash" ? (
            <CashAdjustForm
              visible
              entry={editingCashAdjust}
              date={businessDate}
              accessoryId={accessoryId}
              cashBefore={dailyReportQuery.data?.[0]?.cash_end ?? null}
              isSubmitting={editingCashAdjust ? updateCashAdjust.isPending : createCashAdjust.isPending}
              onCreate={async (payload) => {
                await createCashAdjust.mutateAsync(payload);
              }}
              onUpdate={async (id, payload) => {
                await updateCashAdjust.mutateAsync({ id, payload });
              }}
              onSaved={closeScreen}
            />
          ) : (
            <InventoryAdjustForm
              visible
              entry={editingInventoryAdjust}
              date={businessDate}
              accessoryId={accessoryId}
              inventoryBefore={inventoryLatest.data ?? null}
              isSubmitting={editingInventoryAdjust ? updateInventoryAdjust.isPending : adjustInventory.isPending}
              onCreate={async (payload) => {
                await adjustInventory.mutateAsync(payload);
              }}
              onUpdate={async (id, payload) => {
                await updateInventoryAdjust.mutateAsync({ id, payload });
              }}
              onSaved={closeScreen}
            />
          )
        )}
      </KeyboardAvoidingView>
      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={accessoryId}>
          <View style={styles.accessoryRow}>
            <Pressable onPress={() => Keyboard.dismiss()} style={styles.accessoryButton}>
              <Text style={styles.accessoryText}>Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  hubHeaderButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#e2e8f0",
  },
  hubHeaderButtonText: {
    fontWeight: "700",
    color: "#0a7ea4",
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
  modeButtonActive: {
    backgroundColor: "#0a7ea4",
  },
  modeButtonDisabled: {
    backgroundColor: "#e2e8f0",
    opacity: 0.5,
  },
  modeText: {
    fontWeight: "700",
    color: "#1f2937",
  },
  modeTextActive: {
    color: "#fff",
  },
  modeTextDisabled: {
    color: "#94a3b8",
  },
  hubContent: {
    gap: 12,
    paddingBottom: 4,
  },
  hubForm: {
    flex: 1,
    gap: 8,
  },
  hubFormScreen: {
    overflow: "hidden",
  },
  hubFormContent: {
    gap: 8,
    paddingBottom: 8,
  },
  entryFieldPair: {
    flexDirection: "row",
    gap: 12,
  },
  entryFieldPairSingle: {
    flexDirection: "row",
  },
  standaloneFieldWrap: {
    width: "100%",
    alignSelf: "stretch",
    justifyContent: "center",
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
    padding: 8,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  modalLabel: {
    marginTop: 10,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: "700",
    color: "#1c1c1c",
  },
  sectionCardLabel: {
    marginTop: 0,
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
  inputReadOnly: {
    backgroundColor: "#eef2f6",
    color: "#8a8a8a",
  },
  resultInputLight: {
    backgroundColor: "#f8f8f8",
  },
  fieldBox: {
    marginTop: 6,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    gap: 4,
  },
  amountsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  totalsRow: {
    marginTop: 12,
  },
  actionRow: {
    marginTop: 2,
  },
  amountCell: {
    flex: 1,
    gap: 6,
    alignItems: "center",
  },
  paymentCell: {
    flex: 1,
  },
  amountCellResult: {
    flex: 0.7,
  },
  fieldName: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    textAlign: "center",
    alignSelf: "center",
    textTransform: "uppercase",
  },
  amountGroup: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  amountInput: {
    width: 75,
    minWidth: 75,
    textAlign: "center",
    paddingHorizontal: 6,
  },
  stepperStack: {
    alignItems: "center",
    gap: 2,
  },
  stepperBtnSmall: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d7dde4",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperTiny: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d7dde4",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: -2,
  },
  inlineActionRow: {
    marginTop: 8,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  paymentActionRow: {
    marginTop: 20,
  },
  bigBoxActionRow: {
    marginTop: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineActionButton: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: "center",
    backgroundColor: "#dc2626",
    minWidth: 110,
    alignSelf: "center",
  },
  inlineActionButtonSuccess: {
    backgroundColor: "#16a34a",
  },
  inlineActionText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
  positiveValue: {
    color: "#15803d",
    fontWeight: "700",
  },
  negativeValue: {
    color: "#b91c1c",
    fontWeight: "700",
  },
  alertBox: {
    backgroundColor: "#fdecea",
    borderColor: "#f5c6cb",
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
    gap: 4,
  },
  alertText: {
    color: "#b00020",
    fontWeight: "700",
    fontSize: 12,
  },
  sectionDisabled: {
    opacity: 0.45,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
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
  modalBtnText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  modalBtnTextPrimary: {
    color: "#fff",
    fontWeight: "700",
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
  accessoryRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 8,
    backgroundColor: "#f8fafc",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  accessoryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#0a7ea4",
  },
  accessoryText: {
    color: "#fff",
    fontWeight: "700",
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
});


