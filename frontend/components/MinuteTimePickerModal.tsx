import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { getTimeParts } from "@/lib/date";

type MinuteTimePickerModalProps = {
  visible: boolean;
  value: string;
  onSelect: (next: string) => void;
  onClose: () => void;
  title?: string;
};

const HOURS = Array.from({ length: 24 }, (_, index) => index.toString().padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, index) => index.toString().padStart(2, "0"));

function TimeColumn({
  label,
  values,
  selected,
  onSelect,
}: {
  label: string;
  values: string[];
  selected: string;
  onSelect: (next: string) => void;
}) {
  return (
    <View style={styles.column}>
      <Text style={styles.columnLabel}>{label}</Text>
      <ScrollView style={styles.columnList} contentContainerStyle={styles.columnContent}>
        {values.map((value) => {
          const isSelected = value === selected;
          return (
            <Pressable
              key={`${label}-${value}`}
              style={[styles.valueChip, isSelected && styles.valueChipSelected]}
              onPress={() => onSelect(value)}
            >
              <Text style={[styles.valueText, isSelected && styles.valueTextSelected]}>{value}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function MinuteTimePickerModal({
  visible,
  value,
  onSelect,
  onClose,
  title = "Select time",
}: MinuteTimePickerModalProps) {
  const [draftHour, setDraftHour] = useState("00");
  const [draftMinute, setDraftMinute] = useState("00");
  const [draftSecond, setDraftSecond] = useState("00");

  useEffect(() => {
    if (!visible) return;
    const parts = getTimeParts(value);
    setDraftHour(parts.hour);
    setDraftMinute(parts.minute);
    setDraftSecond(parts.second);
  }, [value, visible]);

  const preview = useMemo(
    () => `${draftHour}:${draftMinute}:${draftSecond}`,
    [draftHour, draftMinute, draftSecond],
  );

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.preview}>{preview}</Text>
          <View style={styles.columnsRow}>
            <TimeColumn label="Hour" values={HOURS} selected={draftHour} onSelect={setDraftHour} />
            <TimeColumn label="Minute" values={MINUTES} selected={draftMinute} onSelect={setDraftMinute} />
            <View style={styles.column}>
              <Text style={styles.columnLabel}>Second</Text>
              <View style={styles.readOnlyCard}>
                <Ionicons name="lock-closed-outline" size={14} color="#64748b" />
                <Text style={styles.readOnlyValue}>{draftSecond}</Text>
              </View>
            </View>
          </View>
          <View style={styles.actions}>
            <Pressable style={[styles.actionButton, styles.cancelButton]} onPress={onClose}>
              <Text style={[styles.actionText, styles.cancelText]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.applyButton]}
              onPress={() => {
                onSelect(preview);
                onClose();
              }}
            >
              <Text style={[styles.actionText, styles.applyText]}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    justifyContent: "center",
    padding: 18,
  },
  card: {
    borderRadius: 18,
    backgroundColor: "#fff",
    padding: 18,
    gap: 14,
    maxHeight: "82%",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  preview: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0a7ea4",
    textAlign: "center",
  },
  columnsRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  column: {
    flex: 1,
    gap: 8,
  },
  columnLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  columnList: {
    maxHeight: 320,
  },
  columnContent: {
    gap: 8,
    paddingBottom: 4,
  },
  valueChip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dbe4ea",
    backgroundColor: "#f8fafc",
    paddingVertical: 10,
    alignItems: "center",
  },
  valueChipSelected: {
    borderColor: "#0a7ea4",
    backgroundColor: "#e0f2fe",
  },
  valueText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#334155",
  },
  valueTextSelected: {
    color: "#0a7ea4",
  },
  readOnlyCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dbe4ea",
    backgroundColor: "#f8fafc",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  readOnlyValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#334155",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  actionButton: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelButton: {
    backgroundColor: "#e2e8f0",
  },
  applyButton: {
    backgroundColor: "#0a7ea4",
  },
  actionText: {
    fontSize: 15,
    fontWeight: "800",
  },
  cancelText: {
    color: "#334155",
  },
  applyText: {
    color: "#fff",
  },
});
