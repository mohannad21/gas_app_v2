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
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { RefillForm } from "@/components/AddRefillModal";
import { useCreateCashAdjustment, useCashAdjustments, useUpdateCashAdjustment } from "@/hooks/useCash";
import { useCreateCompanyPayment } from "@/hooks/useCompanyPayments";
import {
  useAdjustInventory,
  useInventoryAdjustments,
  useInventoryLatest,
  useInventoryRefillDetails,
  useUpdateInventoryAdjustment,
} from "@/hooks/useInventory";
import { useDailyReportsV2 } from "@/hooks/useReports";
import { CashAdjustment, InventoryAdjustment } from "@/types/domain";
import { formatDateLocale, formatTimeHM, toDateKey } from "@/lib/date";

type InventoryTab = "refill" | "return" | "payment" | "buy" | "cash" | "inventory";

function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNowTime() {
  const now = new Date();
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
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
        setAdjustDate(toDateKey(parsed));
        setAdjustTime(formatTimeHM(parsed, { hour12: false }));
      }
    } else {
      setAdjustDate(date);
      setAdjustTime(getNowTime());
    }
  }, [entry, visible, date]);

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
      <TextInput style={styles.modalInput} placeholder="Required" value={reason} onChangeText={setReason} />

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
        setAdjustDate(toDateKey(parsed));
        setAdjustTime(formatTimeHM(parsed, { hour12: false }));
      }
    } else {
      setAdjustDate(date);
      setAdjustTime(getNowTime());
    }
  }, [entry, visible, date]);

  const deltaValue = Number(deltaCash) || 0;

  const save = async () => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      Alert.alert("Reason required", "Please add a reason for the adjustment.");
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
      <TextInput style={styles.modalInput} placeholder="Required" value={reason} onChangeText={setReason} />

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

function CompanyPaymentForm({
  visible,
  date,
  accessoryId,
  companyBalance,
  onCreate,
  onSaved,
  onCancel,
}: {
  visible: boolean;
  date: string;
  accessoryId?: string;
  companyBalance: number;
  onCreate: (payload: { date: string; time?: string; amount: number; note?: string }) => Promise<void>;
  onSaved: () => void;
  onCancel: () => void;
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
  const remainingDue = Math.max(totalDue - amountValue, 0);
  const resultValue = totalDue - amountValue;
  const payDisabled = companyBalance <= 0;
  const receiveDisabled = companyBalance >= 0;
  const tableDisabled = companyBalance === 0;
  const normalizedAmount = paymentDirection === "receive" ? -amountValue : amountValue;

  const save = async () => {
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
      onSaved();
    } catch (err: any) {
      Alert.alert("Payment failed", err?.response?.data?.detail ?? "Failed to save payment.");
    }
  };

  const stepValue = (delta: number) => {
    const current = Number(amount) || 0;
    setAmount(String(Math.max(current + delta, 0)));
  };

  return (
    <View style={[styles.hubForm, styles.hubSectionCard]}>
      <Text style={styles.modalLabel}>Date & time</Text>
      <View style={styles.row}>
        <Pressable style={styles.dateField} onPress={() => setCalendarOpen(true)}>
          <Text style={styles.dateText}>{payDate}</Text>
          <Ionicons name="calendar-outline" size={16} color="#0a7ea4" />
        </Pressable>
        <Pressable style={styles.dateField} onPress={() => setTimeOpen(true)}>
          <Text style={styles.dateText}>{payTime}</Text>
          <Ionicons name="time-outline" size={16} color="#0a7ea4" />
        </Pressable>
      </View>
      {totalDue > 0 ? (
        <View style={styles.alertBox}>
          <Text style={styles.alertText}>
            {companyBalance > 0
              ? `You pay company ${remainingDue.toFixed(0)}`
              : `Company pays you ${remainingDue.toFixed(0)}`}
          </Text>
        </View>
      ) : null}
      <Text style={styles.modalLabel}>Payment direction</Text>
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
      <View style={[styles.fieldBox, tableDisabled && styles.sectionDisabled]} pointerEvents={tableDisabled ? "none" : "auto"}>
        <View style={styles.amountsRow}>
          <View style={[styles.amountCell, styles.paymentCell]}>
            <Text style={styles.fieldName}>Total</Text>
            <TextInput
              style={[styles.modalInput, styles.amountInput, styles.inputReadOnly]}
              value="0"
              editable={false}
              placeholder="0"
            />
          </View>
          <View style={[styles.amountCell, styles.paymentCell]}>
            <Text style={styles.fieldName}>Paid</Text>
            <View style={styles.stepperStack}>
              <Pressable style={styles.stepperTiny} onPress={() => stepValue(50)}>
                <Ionicons name="add" size={10} color="#0a7ea4" />
              </Pressable>
              <View style={styles.amountGroup}>
                <Pressable style={styles.stepperBtnSmall} onPress={() => stepValue(-1)}>
                  <Ionicons name="remove" size={10} color="#0a7ea4" />
                </Pressable>
                <TextInput
                  style={[styles.modalInput, styles.amountInput]}
                  placeholder="0"
                  keyboardType="number-pad"
                  value={amount}
                  onChangeText={setAmount}
                  inputAccessoryViewID={accessoryId}
                />
                <Pressable style={styles.stepperBtnSmall} onPress={() => stepValue(1)}>
                  <Ionicons name="add" size={10} color="#0a7ea4" />
                </Pressable>
              </View>
              <Pressable style={styles.stepperTiny} onPress={() => stepValue(-50)}>
                <Ionicons name="remove" size={10} color="#0a7ea4" />
              </Pressable>
            </View>
            <View style={[styles.inlineActionRow, styles.paymentActionRow]}>
              <Pressable
                style={[
                  styles.inlineActionButton,
                  amountValue === 0 ? styles.inlineActionButtonSuccess : null,
                ]}
                onPress={() => {
                  if (amountValue === 0) {
                    setAmount(totalDue.toFixed(0));
                  } else {
                    setAmount("0");
                  }
                }}
              >
                <Text style={styles.inlineActionText}>
                  {paymentDirection === "receive" ? "Receive all" : "Pay all"}
                </Text>
              </Pressable>
            </View>
          </View>
          <View style={[styles.amountCell, styles.paymentCell]}>
            <Text style={styles.fieldName}>Result</Text>
            <TextInput
              style={[
                styles.modalInput,
                styles.amountInput,
                styles.inputReadOnly,
                styles.resultInputLight,
                resultValue > 0 ? styles.negativeValue : resultValue < 0 ? styles.positiveValue : null,
              ]}
              value={resultValue.toFixed(0)}
              editable={false}
              placeholder="0"
            />
          </View>
        </View>
      </View>
      <Text style={styles.modalLabel}>Note</Text>
      <TextInput
        style={styles.modalInput}
        placeholder="Optional note"
        value={note}
        onChangeText={setNote}
        inputAccessoryViewID={accessoryId}
      />

      <View style={styles.modalActions}>
        <Pressable style={styles.modalBtn} onPress={onCancel}>
          <Text style={styles.modalBtnText}>Cancel</Text>
        </Pressable>
        <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={save} disabled={tableDisabled}>
          <Text style={styles.modalBtnTextPrimary}>
            {paymentDirection === "receive" ? "Receive" : "Pay"}
          </Text>
        </Pressable>
      </View>
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
    tab?: string | string[];
    refillId?: string | string[];
    adjustId?: string | string[];
    cashId?: string | string[];
  }>();
  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const refillId = Array.isArray(params.refillId) ? params.refillId[0] : params.refillId;
  const adjustId = Array.isArray(params.adjustId) ? params.adjustId[0] : params.adjustId;
  const cashId = Array.isArray(params.cashId) ? params.cashId[0] : params.cashId;

  const resolveTab = (): InventoryTab => {
    if (
      tabParam === "cash" ||
      tabParam === "inventory" ||
      tabParam === "refill" ||
      tabParam === "buy" ||
      tabParam === "return" ||
      tabParam === "payment"
    )
      return tabParam;
    if (cashId) return "cash";
    if (adjustId) return "inventory";
    return "refill";
  };

  const [activeTab, setActiveTab] = useState<InventoryTab>(resolveTab());
  const businessDate = getLocalDateString();
  const accessoryId = Platform.OS === "ios" ? "inventoryAccessory" : undefined;

  const inventoryLatest = useInventoryLatest();
  const dailyReportQuery = useDailyReportsV2(businessDate, businessDate);
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
  const reportRow = dailyReportQuery.data?.[0] ?? null;
  const companyBalance = reportRow?.company_end ?? 0;
  const company12Balance = reportRow?.company_12kg_end ?? 0;
  const company48Balance = reportRow?.company_48kg_end ?? 0;
  const paymentTabDisabled = reportRow ? companyBalance === 0 : false;
  const returnTabDisabled = reportRow ? company12Balance >= 0 && company48Balance >= 0 : false;

  useEffect(() => {
    setActiveTab(resolveTab());
  }, [tabParam, refillId, adjustId, cashId]);

  useEffect(() => {
    if (activeTab === "payment" && paymentTabDisabled) {
      setActiveTab("refill");
    }
    if (activeTab === "return" && returnTabDisabled) {
      setActiveTab("refill");
    }
  }, [activeTab, paymentTabDisabled, returnTabDisabled]);

  return (
    <SafeAreaView style={styles.hubSafeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
        style={styles.hubScreenInner}
      >
        <View style={styles.hubHeaderRow}>
          <Text style={styles.hubTitle}>Inventory</Text>
        </View>
        <View style={styles.modeRow}>
          {(["refill", "return", "payment", "buy", "cash", "inventory"] as const).map((tab) => {
            const label =
              tab === "refill"
                ? "Refill"
                : tab === "return"
                  ? "Return"
                  : tab === "payment"
                    ? "Payment"
                : tab === "buy"
                  ? "Buy"
                  : tab === "cash"
                    ? "Adjust Cash"
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
            onClose={() => router.back()}
            onSaved={() => router.back()}
            accessoryId={accessoryId}
            editEntry={activeTab === "refill" ? editRefill : null}
            showHeader={false}
            useCard={false}
            mode={activeTab === "return" ? "return" : activeTab === "buy" ? "buy" : "refill"}
            containerStyle={styles.hubFormContainer}
            scrollStyle={styles.hubScroll}
          />
        ) : (
          <ScrollView
            contentContainerStyle={styles.hubContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {activeTab === "payment" ? (
              <CompanyPaymentForm
                visible
                date={businessDate}
                accessoryId={accessoryId}
                companyBalance={companyBalance}
                onCreate={async (payload) => {
                  await createCompanyPayment.mutateAsync(payload);
                }}
                onSaved={() => router.back()}
                onCancel={() => router.back()}
              />
            ) : activeTab === "cash" ? (
              <CashAdjustForm
                visible
                entry={editingCashAdjust}
                date={businessDate}
                accessoryId={accessoryId}
                cashBefore={dailyReportQuery.data?.[0]?.cash_end ?? null}
                onCreate={async (payload) => {
                  await createCashAdjust.mutateAsync(payload);
                }}
                onUpdate={async (id, payload) => {
                  await updateCashAdjust.mutateAsync({ id, payload });
                }}
                onSaved={() => router.back()}
                onCancel={() => router.back()}
              />
            ) : (
              <InventoryAdjustForm
                visible
                entry={editingInventoryAdjust}
                date={businessDate}
                accessoryId={accessoryId}
                inventoryBefore={inventoryLatest.data ?? null}
                onCreate={async (payload) => {
                  await adjustInventory.mutateAsync(payload);
                }}
                onUpdate={async (id, payload) => {
                  await updateInventoryAdjust.mutateAsync({ id, payload });
                }}
                onSaved={() => router.back()}
                onCancel={() => router.back()}
              />
            )}
          </ScrollView>
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
  modalInput: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#f7f7f8",
    borderWidth: 1,
    borderColor: "#e2e8f0",
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
});
