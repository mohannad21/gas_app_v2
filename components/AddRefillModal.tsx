import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { AxiosError } from "axios";

import {
  useCreateRefill,
  useInitInventory,
  useInventoryRefillDetails,
  useInventorySnapshot,
  useUpdateRefill,
} from "@/hooks/useInventory";
import { usePriceSettings } from "@/hooks/usePrices";
import { gasColor } from "@/constants/gas";

type SavedRefillEntry = {
  id: string;
  date: string;
  time: string;
  buy12: number;
  return12: number;
  buy48: number;
  return48: number;
  total_cost: number;
  paid_now: number;
};

type EditRefillEntry = {
  refill_id: string;
  date: string;
  time_of_day?: "morning" | "evening";
  effective_at?: string;
  buy12: number;
  return12: number;
  buy48: number;
  return48: number;
};

type AddRefillModalProps = {
  visible: boolean;
  onClose: () => void;
  onSaved: (entry: SavedRefillEntry) => void;
  accessoryId?: string;
  editEntry?: EditRefillEntry | null;
};

type InventoryNotInitializedDetail = {
  code?: string;
};

type InventoryNegativeDetail = {
  code?: string;
  gas_type?: string;
  field?: string;
  available?: number;
  attempt?: number;
};

function getNowDate() {
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

function normalizeIso(value: string) {
  const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value);
  return hasZone ? value : `${value}Z`;
}

function subtractSeconds(isoValue: string, seconds: number) {
  const parsed = new Date(normalizeIso(isoValue));
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setSeconds(parsed.getSeconds() - seconds);
  return parsed.toISOString();
}

function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined) return "--";
  return value.toString();
}

export function RefillForm({
  visible,
  onClose,
  onSaved,
  accessoryId,
  editEntry,
  showHeader = true,
  useCard = true,
  containerStyle,
  scrollStyle,
}: AddRefillModalProps & { showHeader?: boolean; useCard?: boolean; containerStyle?: any; scrollStyle?: any }) {
  const createRefill = useCreateRefill();
  const updateRefill = useUpdateRefill();
  const initInventory = useInitInventory();
  const refillDetailsQuery = useInventoryRefillDetails(editEntry?.refill_id);
  const refillDetails = refillDetailsQuery.data;
  const pricesQuery = usePriceSettings();
  const [date, setDate] = useState(getNowDate());
  const [time, setTime] = useState(getNowTime());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [buy12, setBuy12] = useState("");
  const [ret12, setRet12] = useState("");
  const [buy48, setBuy48] = useState("");
  const [ret48, setRet48] = useState("");
  const [ret12Touched, setRet12Touched] = useState(false);
  const [ret48Touched, setRet48Touched] = useState(false);
  const [paidNow, setPaidNow] = useState("");
  const [paidTouched, setPaidTouched] = useState(false);
  const [initOpen, setInitOpen] = useState(false);
  const [initCounts, setInitCounts] = useState({ full12: "", empty12: "", full48: "", empty48: "" });

  const prevVisible = useRef(visible);
  useEffect(() => {
    if (!prevVisible.current && visible) {
      if (editEntry) {
        setDate(editEntry.date);
        if (editEntry.effective_at) {
          const parsed = new Date(editEntry.effective_at);
          if (!Number.isNaN(parsed.getTime())) {
            setTime(parsed.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }));
          }
        } else if (editEntry.time_of_day) {
          setTime(editEntry.time_of_day === "morning" ? "09:00" : "18:00");
        }
        setBuy12(String(editEntry.buy12));
        setRet12(String(editEntry.return12));
        setBuy48(String(editEntry.buy48));
        setRet48(String(editEntry.return48));
        setRet12Touched(true);
        setRet48Touched(true);
        setPaidTouched(false);
      } else {
        setDate(getNowDate());
        setTime(getNowTime());
        setBuy12("");
        setRet12("");
        setBuy48("");
        setRet48("");
        setRet12Touched(false);
        setRet48Touched(false);
        setPaidNow("");
        setPaidTouched(false);
      }
    }
    prevVisible.current = visible;
  }, [visible, editEntry]);

  useEffect(() => {
    if (!visible || !editEntry?.effective_at) return;
    const parsed = new Date(editEntry.effective_at);
    if (Number.isNaN(parsed.getTime())) return;
    setTime(parsed.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }));
  }, [visible, editEntry?.effective_at]);

  const snapshotAt = useMemo(() => {
    if (!editEntry?.effective_at) return null;
    return subtractSeconds(editEntry.effective_at, 1);
  }, [editEntry?.effective_at]);
  const snapshotQuery = useInventorySnapshot(
    visible ? (snapshotAt ? { at: snapshotAt } : { date, time }) : undefined
  );
  const base = useMemo(() => {
    if (editEntry?.refill_id) {
      if (!refillDetails) return null;
      return {
        as_of: refillDetails.effective_at,
        full12: refillDetails.before_full_12,
        empty12: refillDetails.before_empty_12,
        total12: refillDetails.before_full_12 + refillDetails.before_empty_12,
        full48: refillDetails.before_full_48,
        empty48: refillDetails.before_empty_48,
        total48: refillDetails.before_full_48 + refillDetails.before_empty_48,
        reason: null,
      };
    }
    return snapshotQuery.data ?? null;
  }, [editEntry?.refill_id, refillDetails, snapshotQuery.data]);
  const errorDetail = (snapshotQuery.error as AxiosError<{ detail?: InventoryNotInitializedDetail }>)?.response?.data
    ?.detail;
  const inventoryNotInitialized = !base && errorDetail?.code === "inventory_not_initialized";

  const resolveBuyingPrice = (gas: "12kg" | "48kg", target: Date) => {
    const prices = pricesQuery.data ?? [];
    const matches = prices.filter((entry) => {
      if (entry.gas_type !== gas) return false;
      if (entry.buying_price === null || entry.buying_price === undefined) return false;
      return new Date(entry.effective_from) <= target;
    });
    const privateMatches = matches.filter((entry) => entry.customer_type === "private");
    const anyMatches = matches.filter((entry) => entry.customer_type === "any");
    const candidates = privateMatches.length > 0 ? privateMatches : anyMatches;
    candidates.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
    return candidates[0]?.buying_price ?? 0;
  };

  const priceTarget = useMemo(() => {
    if (editEntry?.effective_at) {
      const parsed = new Date(normalizeIso(editEntry.effective_at));
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    const fallback = new Date(`${date}T${time}:00`);
    if (!Number.isNaN(fallback.getTime())) return fallback;
    return new Date(date);
  }, [editEntry?.effective_at, date, time]);

  const buy12Price = resolveBuyingPrice("12kg", priceTarget);
  const buy48Price = resolveBuyingPrice("48kg", priceTarget);

  const buy12Value = Number(buy12) || 0;
  const buy48Value = Number(buy48) || 0;
  const ret12Value = Number(ret12) || 0;
  const ret48Value = Number(ret48) || 0;

  const totalCost = buy12Value * buy12Price + buy48Value * buy48Price;
  useEffect(() => {
    if (paidTouched) return;
    setPaidNow(totalCost ? totalCost.toString() : "");
  }, [totalCost, paidTouched]);

  const paidNowValue = Number(paidNow) || 0;
  const owed = Math.max(0, totalCost - paidNowValue);

  const availableEmpty12 = base?.empty12 ?? 0;
  const availableEmpty48 = base?.empty48 ?? 0;
  const return12Invalid = ret12Value > availableEmpty12;
  const return48Invalid = ret48Value > availableEmpty48;

  const afterFull12 = base ? base.full12 + buy12Value : null;
  const afterEmpty12 = base ? base.empty12 - ret12Value : null;
  const afterFull48 = base ? base.full48 + buy48Value : null;
  const afterEmpty48 = base ? base.empty48 - ret48Value : null;
  const formatArrow = (before: number | null | undefined, after: number | null | undefined) => {
    if (before === null || before === undefined || after === null || after === undefined) return "--";
    return `${before} -> ${after}`;
  };
  const gasLabelStyle = (gas: "12kg" | "48kg") => ({
    color: gasColor(gas),
    fontWeight: "700" as const,
  });

  const disableSave =
    inventoryNotInitialized ||
    !base ||
    return12Invalid ||
    return48Invalid ||
    createRefill.isPending ||
    updateRefill.isPending ||
    initInventory.isPending;

  const handleSave = async () => {
    if (!base || inventoryNotInitialized) {
      Alert.alert("Inventory not initialized", "Set starting inventory before adding a refill.");
      return;
    }
    if (return12Invalid) {
      Alert.alert(
        "Invalid return",
        `You only have ${availableEmpty12} empty 12kg cylinders. You entered return=${ret12Value}.`
      );
      return;
    }
    if (return48Invalid) {
      Alert.alert(
        "Invalid return",
        `You only have ${availableEmpty48} empty 48kg cylinders. You entered return=${ret48Value}.`
      );
      return;
    }

    try {
      if (editEntry?.refill_id) {
        await updateRefill.mutateAsync({
          refillId: editEntry.refill_id,
          buy12: buy12Value,
          return12: ret12Value,
          buy48: buy48Value,
          return48: ret48Value,
        });
      } else {
        await createRefill.mutateAsync({
          date,
          time,
          buy12: buy12Value,
          return12: ret12Value,
          buy48: buy48Value,
          return48: ret48Value,
          paid_now: paidNowValue,
        });
      }
      Keyboard.dismiss();
      onSaved({
        id: editEntry?.refill_id ?? `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        date,
        time,
        buy12: buy12Value,
        return12: ret12Value,
        buy48: buy48Value,
        return48: ret48Value,
        total_cost: totalCost,
        paid_now: paidNowValue,
      });
      onClose();
    } catch (err) {
      const detail = (err as AxiosError<{ detail?: InventoryNegativeDetail }>).response?.data?.detail;
      if (detail?.code === "inventory_negative" && detail.gas_type && detail.available !== undefined) {
        Alert.alert(
          "Invalid return",
          `You only have ${detail.available} empty ${detail.gas_type} cylinders. You entered return=${detail.attempt}.`
        );
        return;
      }
      Alert.alert("Save failed", "Please try again.");
    }
  };
  const handleBuy12Change = (value: string) => {
    setBuy12(value);
    if (!ret12Touched) {
      setRet12(value);
    }
  };
  const handleBuy48Change = (value: string) => {
    setBuy48(value);
    if (!ret48Touched) {
      setRet48(value);
    }
  };

  return (
    <>
      <View style={[useCard ? styles.modalCard : styles.modalInner, containerStyle]}>
        {showHeader ? (
          <View style={styles.headerRow}>
            <Text style={styles.title}>{editEntry ? "Update Inventory" : "Add Inventory"}</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={20} color="#0f172a" />
            </Pressable>
          </View>
        ) : null}
        <ScrollView
          style={scrollStyle}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
              <View style={styles.section}>
                <Text style={styles.label}>Date & time</Text>
                <View style={styles.row}>
                  <Pressable
                    style={[styles.dateField, editEntry && styles.dateFieldDisabled]}
                    onPress={editEntry ? undefined : () => setCalendarOpen(true)}
                  >
                    <Text style={styles.dateText}>{date}</Text>
                    <Ionicons name="calendar-outline" size={16} color="#0a7ea4" />
                  </Pressable>
                  <Pressable
                    style={[styles.dateField, editEntry && styles.dateFieldDisabled]}
                    onPress={editEntry ? undefined : () => setTimeOpen(true)}
                  >
                    <Text style={styles.dateText}>{time}</Text>
                    <Ionicons name="time-outline" size={16} color="#0a7ea4" />
                  </Pressable>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.label}>Before</Text>
                {inventoryNotInitialized ? (
                  <View style={styles.notice}>
                    <Text style={styles.noticeText}>
                      Inventory not initialized. Set starting inventory first.
                    </Text>
                    <Pressable style={styles.noticeButton} onPress={() => setInitOpen(true)}>
                      <Text style={styles.noticeButtonText}>Initialize inventory</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.table}>
                    <View style={[styles.tableRow, styles.tableHeader]}>
                      <Text style={[styles.tableCell, styles.tableHeadText]}>Gas</Text>
                      <Text style={[styles.tableCell, styles.tableHeadText]}>Full</Text>
                      <Text style={[styles.tableCell, styles.tableHeadText]}>Empty</Text>
                    </View>
                    <View style={styles.tableRow}>
                      <Text style={[styles.tableCell, gasLabelStyle("12kg")]}>12kg</Text>
                      <Text style={styles.tableCell}>{formatCount(base?.full12)}</Text>
                      <Text style={styles.tableCell}>{formatCount(base?.empty12)}</Text>
                    </View>
                    <View style={styles.tableRow}>
                      <Text style={[styles.tableCell, gasLabelStyle("48kg")]}>48kg</Text>
                      <Text style={styles.tableCell}>{formatCount(base?.full48)}</Text>
                      <Text style={styles.tableCell}>{formatCount(base?.empty48)}</Text>
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.section}>
                <Text style={styles.label}>Refill input</Text>
                <View style={styles.inputBlock}>
                  <Text style={[styles.inputTitle, gasLabelStyle("12kg")]}>12kg</Text>
                  <View style={styles.row}>
                    <View style={styles.half}>
                      <Text style={styles.fieldLabel}>Buy</Text>
                      <Text style={styles.helperText}>You have {availableEmpty12} empties</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="0"
                        keyboardType="numeric"
                        value={buy12}
                        onChangeText={handleBuy12Change}
                        inputAccessoryViewID={accessoryId}
                      />
                    </View>
                    <View style={styles.half}>
                      <Text style={styles.fieldLabel}>Return</Text>
                      <TextInput
                        style={[styles.input, return12Invalid && styles.inputError]}
                        placeholder="0"
                        keyboardType="numeric"
                        value={ret12}
                        onChangeText={(value) => {
                          setRet12Touched(true);
                          setRet12(value);
                        }}
                        inputAccessoryViewID={accessoryId}
                      />
                      {return12Invalid ? (
                        <Text style={styles.errorText}>
                          You only have {availableEmpty12} empty 12kg cylinders. You entered return={ret12Value}.
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
                <View style={styles.inputBlock}>
                  <Text style={[styles.inputTitle, gasLabelStyle("48kg")]}>48kg</Text>
                  <View style={styles.row}>
                    <View style={styles.half}>
                      <Text style={styles.fieldLabel}>Buy</Text>
                      <Text style={styles.helperText}>You have {availableEmpty48} empties</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="0"
                        keyboardType="numeric"
                        value={buy48}
                        onChangeText={handleBuy48Change}
                        inputAccessoryViewID={accessoryId}
                      />
                    </View>
                    <View style={styles.half}>
                      <Text style={styles.fieldLabel}>Return</Text>
                      <TextInput
                        style={[styles.input, return48Invalid && styles.inputError]}
                        placeholder="0"
                        keyboardType="numeric"
                        value={ret48}
                        onChangeText={(value) => {
                          setRet48Touched(true);
                          setRet48(value);
                        }}
                        inputAccessoryViewID={accessoryId}
                      />
                      {return48Invalid ? (
                        <Text style={styles.errorText}>
                          You only have {availableEmpty48} empty 48kg cylinders. You entered return={ret48Value}.
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.label}>Money</Text>
                <Text style={styles.meta}>
                  Buy price{" "}
                  <Text style={[styles.meta, gasLabelStyle("12kg")]}>12kg</Text>: {buy12Price}
                </Text>
                <Text style={styles.meta}>
                  Buy price{" "}
                  <Text style={[styles.meta, gasLabelStyle("48kg")]}>48kg</Text>: {buy48Price}
                </Text>
                <View style={styles.row}>
                  <View style={styles.third}>
                    <Text style={styles.fieldLabel}>Total</Text>
                    <TextInput
                      style={[styles.input, styles.inputReadOnly]}
                      value={totalCost.toString()}
                      editable={false}
                      placeholder="0"
                    />
                  </View>
                  <View style={styles.third}>
                    <Text style={styles.fieldLabel}>Paid</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0"
                      keyboardType="numeric"
                      value={paidNow}
                      onChangeText={(value) => {
                        setPaidTouched(true);
                        setPaidNow(value);
                      }}
                      inputAccessoryViewID={accessoryId}
                    />
                  </View>
                  <View style={styles.third}>
                    <Text style={styles.fieldLabel}>Remaining</Text>
                    <TextInput
                      style={[styles.input, styles.inputReadOnly]}
                      value={owed.toString()}
                      editable={false}
                      placeholder="0"
                    />
                  </View>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.label}>After</Text>
                <View style={styles.table}>
                  <View style={[styles.tableRow, styles.tableHeader]}>
                    <Text style={[styles.tableCell, styles.tableHeadText]}>Gas</Text>
                    <Text style={[styles.tableCell, styles.tableHeadText]}>Full</Text>
                    <Text style={[styles.tableCell, styles.tableHeadText]}>Empty</Text>
                  </View>
                  <View style={styles.tableRow}>
                    <Text style={[styles.tableCell, gasLabelStyle("12kg")]}>12kg</Text>
                    <Text style={styles.tableCell}>{formatArrow(base?.full12, afterFull12)}</Text>
                    <Text style={styles.tableCell}>{formatArrow(base?.empty12, afterEmpty12)}</Text>
                  </View>
                  <View style={styles.tableRow}>
                    <Text style={[styles.tableCell, gasLabelStyle("48kg")]}>48kg</Text>
                    <Text style={styles.tableCell}>{formatArrow(base?.full48, afterFull48)}</Text>
                    <Text style={styles.tableCell}>{formatArrow(base?.empty48, afterEmpty48)}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.actions}>
                <Pressable style={styles.secondaryBtn} onPress={onClose}>
                  <Text style={styles.secondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryBtn, disableSave && styles.disabledBtn]}
                  onPress={handleSave}
                  disabled={disableSave}
                >
                  <Text style={styles.primaryText}>{createRefill.isPending ? "Saving..." : "Save"}</Text>
                </Pressable>
              </View>
        </ScrollView>
      </View>

      <CalendarModal
        visible={calendarOpen}
        value={date}
        onSelect={(next) => {
          setDate(next);
          setCalendarOpen(false);
        }}
        onClose={() => setCalendarOpen(false)}
      />
      <TimePickerModal
        visible={timeOpen}
        value={time}
        onSelect={(next) => {
          setTime(next);
          setTimeOpen(false);
        }}
        onClose={() => setTimeOpen(false)}
      />
      <InitInventoryModal
        visible={initOpen}
        date={date}
        counts={initCounts}
        onChangeCounts={setInitCounts}
        onClose={() => setInitOpen(false)}
        onSave={async () => {
          await initInventory.mutateAsync({
            date,
            full12: Number(initCounts.full12) || 0,
            empty12: Number(initCounts.empty12) || 0,
            full48: Number(initCounts.full48) || 0,
            empty48: Number(initCounts.empty48) || 0,
            reason: "initial",
          });
          Keyboard.dismiss();
          setInitOpen(false);
        }}
        accessoryId={accessoryId}
      />
    </>
  );
}

export default function AddRefillModal({
  visible,
  onClose,
  onSaved,
  accessoryId,
  editEntry,
}: AddRefillModalProps) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
        >
          <RefillForm
            visible={visible}
            onClose={onClose}
            onSaved={onSaved}
            accessoryId={accessoryId}
            editEntry={editEntry}
            showHeader
          />
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
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

  const today = new Date();
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const startDay = start.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const monthLabel = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });
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

function InitInventoryModal({
  visible,
  date,
  counts,
  onChangeCounts,
  onClose,
  onSave,
  accessoryId,
}: {
  visible: boolean;
  date: string;
  counts: { full12: string; empty12: string; full48: string; empty48: string };
  onChangeCounts: (next: { full12: string; empty12: string; full48: string; empty48: string }) => void;
  onClose: () => void;
  onSave: () => void;
  accessoryId?: string;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={styles.modalCard}>
              <Text style={styles.title}>Initialize inventory</Text>
              <Text style={styles.meta}>Date: {date}</Text>
              <View style={styles.row}>
                <View style={styles.half}>
                  <Text style={styles.fieldLabel}>12kg Full</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    keyboardType="numeric"
                    value={counts.full12}
                    onChangeText={(value) => onChangeCounts({ ...counts, full12: value })}
                    inputAccessoryViewID={accessoryId}
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.fieldLabel}>12kg Empty</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    keyboardType="numeric"
                    value={counts.empty12}
                    onChangeText={(value) => onChangeCounts({ ...counts, empty12: value })}
                    inputAccessoryViewID={accessoryId}
                  />
                </View>
              </View>
              <View style={styles.row}>
                <View style={styles.half}>
                  <Text style={styles.fieldLabel}>48kg Full</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    keyboardType="numeric"
                    value={counts.full48}
                    onChangeText={(value) => onChangeCounts({ ...counts, full48: value })}
                    inputAccessoryViewID={accessoryId}
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.fieldLabel}>48kg Empty</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    keyboardType="numeric"
                    value={counts.empty48}
                    onChangeText={(value) => onChangeCounts({ ...counts, empty48: value })}
                    inputAccessoryViewID={accessoryId}
                  />
                </View>
              </View>
              <View style={styles.actions}>
                <Pressable style={styles.secondaryBtn} onPress={onClose}>
                  <Text style={styles.secondaryText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.primaryBtn} onPress={onSave}>
                  <Text style={styles.primaryText}>Save inventory</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  modalInner: {
    gap: 12,
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1c1c1c",
  },
  content: {
    gap: 12,
  },
  section: {
    gap: 6,
  },
  label: {
    fontWeight: "700",
    color: "#333",
    fontSize: 12,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  half: {
    flex: 1,
  },
  third: {
    flex: 1,
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
  dateFieldDisabled: {
    opacity: 0.6,
  },
  dateText: {
    color: "#1f2937",
    fontWeight: "600",
  },
  inputBlock: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  inputTitle: {
    fontWeight: "700",
    color: "#0f172a",
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  inputReadOnly: {
    backgroundColor: "#eef2f6",
    color: "#6b7280",
  },
  inputError: {
    borderColor: "#b00020",
  },
  errorText: {
    color: "#b00020",
    fontSize: 11,
    marginTop: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 4,
  },
  helperText: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 4,
  },
  meta: {
    color: "#444",
    fontSize: 13,
  },
  notice: {
    backgroundColor: "#fff7e6",
    borderColor: "#f0c36d",
    borderWidth: 1,
    padding: 8,
    borderRadius: 10,
    gap: 6,
  },
  noticeText: {
    color: "#8a5b00",
    fontSize: 12,
  },
  noticeButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#0a7ea4",
    borderRadius: 8,
  },
  noticeButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
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
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#e8eef1",
    alignItems: "center",
  },
  secondaryText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#0a7ea4",
    alignItems: "center",
  },
  primaryText: {
    color: "#fff",
    fontWeight: "700",
  },
  disabledBtn: {
    opacity: 0.6,
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
});
