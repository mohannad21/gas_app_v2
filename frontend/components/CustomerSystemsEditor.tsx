import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { CalendarModal } from "@/components/AddRefillModal";
import { SystemTypeOption } from "@/types/domain";

export type EditableCustomerSystem = {
  id: string;
  persistedId?: string;
  name: string;
  gas_type: "12kg" | "48kg" | null;
  requires_security_check: boolean | null;
  security_check_exists: boolean | null;
  last_security_check_at?: string;
};

export function createEmptyCustomerSystem(): EditableCustomerSystem {
  return {
    id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    gas_type: null,
    requires_security_check: null,
    security_check_exists: null,
    last_security_check_at: "",
  };
}

export function systemRowHasData(system: EditableCustomerSystem) {
  return Boolean(
    system.persistedId ||
      system.name ||
      system.gas_type ||
      system.requires_security_check !== null ||
      system.security_check_exists !== null ||
      system.last_security_check_at
  );
}

export function systemRowIsComplete(system: EditableCustomerSystem) {
  if (!systemRowHasData(system)) return true;
  if (!system.name || !system.gas_type || system.requires_security_check === null) return false;
  if (system.requires_security_check && system.security_check_exists === null) return false;
  return true;
}

type Props = {
  systems: EditableCustomerSystem[];
  onChange: (systems: EditableCustomerSystem[]) => void;
  typeOptions: SystemTypeOption[];
};

export default function CustomerSystemsEditor({ systems, onChange, typeOptions }: Props) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState<string | null>(null);

  const calendarTargetSystem = systems.find((system) => system.id === calendarTarget);

  const updateSystem = (systemId: string, updater: (system: EditableCustomerSystem) => EditableCustomerSystem) => {
    onChange(systems.map((row) => (row.id === systemId ? updater(row) : row)));
  };

  const renderBinaryChoice = (value: boolean | null, onSelect: (next: boolean) => void) => (
    <View style={styles.binaryRow}>
      {[
        { value: true, label: "Yes" },
        { value: false, label: "No" },
      ].map((option) => (
        <Pressable
          key={option.label}
          onPress={() => onSelect(option.value)}
          style={({ pressed }) => [
            styles.binaryChoice,
            pressed && styles.chipPressed,
            value === option.value && styles.binaryChoiceActive,
          ]}
        >
          <Text style={[styles.binaryChoiceText, value === option.value && styles.binaryChoiceTextActive]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <>
      {systems.map((sys, index) => (
        <View key={sys.id} style={styles.systemCard}>
          <Text style={styles.systemTitle}>System {index + 1}</Text>
          <View style={styles.labelActionRow}>
            <Text style={styles.label}>System type</Text>
            <Pressable
              onPress={() => router.push("/(tabs)/account/configuration/system-types")}
              style={({ pressed }) => [styles.manageTypesButton, pressed && styles.pressed]}
            >
              <Text style={styles.manageTypesText}>Manage system{"\n"}types</Text>
            </Pressable>
          </View>
          <View style={styles.chipRow}>
            {typeOptions.map((opt) => (
              <Pressable
                key={opt.id}
                onPress={() => updateSystem(sys.id, (row) => ({ ...row, name: opt.name }))}
                style={({ pressed }) => [
                  styles.chip,
                  pressed && styles.chipPressed,
                  sys.name === opt.name && styles.chipActive,
                ]}
              >
                <Text style={[styles.chipText, sys.name === opt.name && styles.chipTextActive]}>{opt.name}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Gas type</Text>
          <View style={styles.chipRow}>
            {(["12kg", "48kg"] as const).map((gas) => (
              <Pressable
                key={gas}
                onPress={() => updateSystem(sys.id, (row) => ({ ...row, gas_type: gas }))}
                style={({ pressed }) => [
                  styles.chip,
                  pressed && styles.chipPressed,
                  sys.gas_type === gas && styles.chipActive,
                ]}
              >
                <Text style={[styles.chipText, sys.gas_type === gas && styles.chipTextActive]}>{gas}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Requires security check</Text>
          {renderBinaryChoice(sys.requires_security_check, (next) =>
            updateSystem(sys.id, (row) => ({
              ...row,
              requires_security_check: next,
              security_check_exists: next ? row.security_check_exists : null,
              last_security_check_at: next ? row.last_security_check_at : "",
            }))
          )}

          {sys.requires_security_check ? (
            <>
              <Text style={styles.label}>Security check exists</Text>
              {renderBinaryChoice(sys.security_check_exists, (next) =>
                updateSystem(sys.id, (row) => ({
                  ...row,
                  security_check_exists: next,
                  last_security_check_at: next ? row.last_security_check_at : "",
                }))
              )}
              {sys.security_check_exists ? (
                <>
                  <Text style={styles.label}>Last security check date</Text>
                  <Pressable
                    style={styles.dateField}
                    onPress={() => {
                      setCalendarTarget(sys.id);
                      setCalendarOpen(true);
                    }}
                  >
                    <Text style={styles.dateText}>{sys.last_security_check_at || "Select date"}</Text>
                  </Pressable>
                </>
              ) : null}
            </>
          ) : null}

          {!sys.persistedId && systems.length > 1 ? (
            <Pressable
              onPress={() => onChange(systems.filter((row) => row.id !== sys.id))}
              style={styles.removeBtn}
            >
              <Text style={styles.removeText}>Remove system</Text>
            </Pressable>
          ) : null}
        </View>
      ))}

      <Pressable
        onPress={() => onChange([...systems, createEmptyCustomerSystem()])}
        style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
      >
        <Text style={styles.secondaryText}>+ Add another system</Text>
      </Pressable>

      <CalendarModal
        visible={calendarOpen && !!calendarTargetSystem}
        value={calendarTargetSystem?.last_security_check_at || new Date().toISOString().slice(0, 10)}
        onSelect={(next) => {
          if (!calendarTargetSystem) return;
          updateSystem(calendarTargetSystem.id, (row) => ({ ...row, last_security_check_at: next }));
        }}
        onClose={() => {
          setCalendarOpen(false);
          setCalendarTarget(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  systemCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    marginTop: 8,
  },
  systemTitle: {
    fontWeight: "700",
    fontSize: 14,
  },
  labelActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
  },
  label: {
    fontWeight: "700",
    marginTop: 12,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#e8eef1",
  },
  chipPressed: {
    opacity: 0.8,
  },
  chipActive: {
    backgroundColor: "#0a7ea4",
  },
  chipText: {
    color: "#444",
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#fff",
  },
  binaryRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  binaryChoice: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: "#e8eef1",
    alignItems: "center",
    justifyContent: "center",
  },
  binaryChoiceActive: {
    backgroundColor: "#0a7ea4",
  },
  binaryChoiceText: {
    color: "#0a7ea4",
    fontWeight: "700",
    fontSize: 12,
  },
  binaryChoiceTextActive: {
    color: "#fff",
  },
  manageTypesButton: {
    minHeight: 40,
    minWidth: 92,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: "#c7d2fe",
    alignItems: "center",
    justifyContent: "center",
  },
  manageTypesText: {
    color: "#334155",
    fontWeight: "700",
    fontSize: 11,
    textAlign: "center",
  },
  dateField: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    marginTop: 6,
  },
  dateText: {
    color: "#1f2937",
    fontWeight: "600",
  },
  removeBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#fee2e2",
  },
  removeText: {
    color: "#b00020",
    fontWeight: "700",
  },
  secondary: {
    flex: 1,
    minHeight: 52,
    backgroundColor: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    marginTop: 8,
    justifyContent: "center",
  },
  secondaryText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.9,
  },
});
