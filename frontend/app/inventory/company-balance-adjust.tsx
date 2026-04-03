import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
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
import { useCompanyBalances, useCreateCompanyBalanceAdjustment } from "@/hooks/useCompanyBalances";
import { getUserFacingApiError, logApiError } from "@/lib/apiErrors";
import { getCurrentLocalDate, getCurrentLocalTime } from "@/lib/date";

const MONEY_STEPPERS: FieldStepper[] = [
  { delta: 20, label: "+20", position: "top" },
  { delta: -5, label: "-5", position: "left" },
  { delta: 5, label: "+5", position: "right" },
  { delta: -20, label: "-20", position: "bottom" },
];

const QTY_STEPPERS: FieldStepper[] = [
  { delta: -1, label: "-", position: "left" },
  { delta: 1, label: "+", position: "right" },
];

function getTodayDate() {
  return getCurrentLocalDate();
}

function getNowTime() {
  return getCurrentLocalTime({ includeSeconds: true });
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
                  style={[styles.calendarCell, formatDate(new Date(month.getFullYear(), month.getMonth(), day)) === value && styles.selectedCell]}
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

export default function CompanyBalanceAdjustScreen() {
  const balancesQuery = useCompanyBalances();
  const createAdjustment = useCreateCompanyBalanceAdjustment();
  const accessoryId = Platform.OS === "ios" ? "companyBalanceAdjustAccessory" : undefined;

  const [date, setDate] = useState(getTodayDate());
  const [time, setTime] = useState(getNowTime());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [money, setMoney] = useState("0");
  const [cyl12, setCyl12] = useState("0");
  const [cyl48, setCyl48] = useState("0");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!balancesQuery.data) return;
    setMoney(String(balancesQuery.data.company_money ?? 0));
    setCyl12(String(balancesQuery.data.company_cyl_12 ?? 0));
    setCyl48(String(balancesQuery.data.company_cyl_48 ?? 0));
  }, [balancesQuery.data]);

  const currentMoney = balancesQuery.data?.company_money ?? 0;
  const current12 = balancesQuery.data?.company_cyl_12 ?? 0;
  const current48 = balancesQuery.data?.company_cyl_48 ?? 0;
  const nextMoney = Number(money) || 0;
  const next12 = Number(cyl12) || 0;
  const next48 = Number(cyl48) || 0;
  const saveDisabled =
    createAdjustment.isPending ||
    !balancesQuery.isSuccess ||
    (nextMoney === currentMoney && next12 === current12 && next48 === current48);

  const save = async () => {
    try {
      await createAdjustment.mutateAsync({
        date,
        time,
        money_balance: nextMoney,
        cylinder_balance_12: next12,
        cylinder_balance_48: next48,
        note: note.trim() || undefined,
      });
      Keyboard.dismiss();
      router.back();
    } catch (err: any) {
      logApiError("[company balance adjustment save] error", err);
      Alert.alert("Adjustment failed", getUserFacingApiError(err, "Failed to save company balance adjustment."));
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <KeyboardAvoidingView style={styles.screenInner} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Adjust Company Balances</Text>
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
            statusLine={`Current ${currentMoney.toFixed(0)} -> ${nextMoney.toFixed(0)}`}
            defaultExpanded
          >
            <StandaloneField>
              <FieldCell
                title="Money"
                value={nextMoney}
                onIncrement={() => setMoney(String(nextMoney + 5))}
                onDecrement={() => setMoney(String(nextMoney - 5))}
                onChangeText={setMoney}
                steppers={MONEY_STEPPERS}
              />
            </StandaloneField>
          </BigBox>

          <BigBox
            title="Cylinder balances"
            statusLine={`12kg ${current12} -> ${next12}\n48kg ${current48} -> ${next48}`}
            defaultExpanded
          >
            <View style={styles.fieldPair}>
              <FieldCell
                title="12kg"
                comment={`Current ${current12} -> ${next12}`}
                value={next12}
                onIncrement={() => setCyl12(String(next12 + 1))}
                onDecrement={() => setCyl12(String(next12 - 1))}
                onChangeText={setCyl12}
                steppers={QTY_STEPPERS}
              />
              <FieldCell
                title="48kg"
                comment={`Current ${current48} -> ${next48}`}
                value={next48}
                onIncrement={() => setCyl48(String(next48 + 1))}
                onDecrement={() => setCyl48(String(next48 - 1))}
                onChangeText={setCyl48}
                steppers={QTY_STEPPERS}
              />
            </View>
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
        <FooterActions onSave={save} saveDisabled={saveDisabled} saving={createAdjustment.isPending} />
        <CalendarModal
          visible={calendarOpen}
          value={date}
          onSelect={setDate}
          onClose={() => setCalendarOpen(false)}
        />
        <TimePickerModal
          visible={timeOpen}
          value={time}
          onSelect={setTime}
          onClose={() => setTimeOpen(false)}
        />
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
    fontSize: 26,
    fontWeight: "800",
    color: "#0f172a",
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
  standaloneFieldWrap: {
    width: "100%",
    alignSelf: "stretch",
  },
  fieldPair: {
    flexDirection: "row",
    gap: 12,
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
  timeList: {
    maxHeight: 280,
  },
  timeListContent: {
    gap: 4,
  },
  timeItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  timeText: {
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
});
