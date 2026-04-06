import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Controller, useForm } from "react-hook-form";
import { router, useLocalSearchParams } from "expo-router";

import { CalendarModal } from "@/components/AddRefillModal";
import { useCreateSystem } from "@/hooks/useSystems";
import { useCustomers } from "@/hooks/useCustomers";
import { useSystemTypes } from "@/hooks/useSystemTypes";

type FormValues = {
  name: string;
  gas_type: "12kg" | "48kg" | "";
  note?: string;
  is_active: boolean;
  requires_security_check: boolean | null;
  security_check_exists: boolean | null;
  last_security_check_at?: string;
};

export default function NewSystemScreen() {
  const { customerId } = useLocalSearchParams<{ customerId?: string }>();
  const customersQuery = useCustomers();
  const typesQuery = useSystemTypes();
  const createSystem = useCreateSystem();
  const [submitting, setSubmitting] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const customer = useMemo(
    () => (customersQuery.data ?? []).find((c) => c.id === customerId),
    [customersQuery.data, customerId]
  );
  const typeOptions = useMemo(
    () => (typesQuery.data ?? []).filter((t) => t.is_active !== false),
    [typesQuery.data]
  );

  const { control, handleSubmit, setValue, watch } = useForm<FormValues>({
    defaultValues: {
      name: "",
      gas_type: "",
      note: "",
      is_active: true,
      requires_security_check: null,
      security_check_exists: null,
      last_security_check_at: "",
    },
  });

  const requiresCheck = watch("requires_security_check");
  const checkExists = watch("security_check_exists");
  const lastCheck = watch("last_security_check_at");
  const selectedType = watch("name");
  const selectedGasType = watch("gas_type");
  const canSubmit =
    !!selectedType &&
    !!selectedGasType &&
    requiresCheck !== null &&
    (!requiresCheck || checkExists !== null);

  const renderBinaryChoice = (value: boolean | null, onChange: (next: boolean) => void) => (
    <View style={styles.binaryRow}>
      {[
        { value: true, label: "Yes" },
        { value: false, label: "No" },
      ].map((option) => (
        <Pressable
          key={option.label}
          onPress={() => onChange(option.value)}
          style={({ pressed }) => [
            styles.binaryChoice,
            pressed && styles.pressed,
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

  const onSubmit = handleSubmit(async (values) => {
    if (!customerId) {
      Alert.alert("Missing customer", "Please open this page from a customer profile.");
      return;
    }
    try {
      setSubmitting(true);
      await createSystem.mutateAsync({
        customer_id: customerId,
        name: values.name.trim(),
        gas_type: values.gas_type as "12kg" | "48kg",
        note: values.note?.trim() ? values.note.trim() : undefined,
        is_active: values.is_active,
        requires_security_check: values.requires_security_check ?? false,
        security_check_exists: values.requires_security_check ? values.security_check_exists ?? false : false,
        last_security_check_at:
          values.requires_security_check && values.security_check_exists && values.last_security_check_at
            ? values.last_security_check_at
            : undefined,
      });
      router.back();
    } catch {
      Alert.alert("Error", "Failed to add system.");
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Add System</Text>
      {customer ? <Text style={styles.meta}>Customer: {customer.name}</Text> : null}

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
            onPress={() => setValue("name", opt.name)}
            style={({ pressed }) => [
              styles.chip,
              pressed && styles.pressed,
              selectedType === opt.name && styles.chipActive,
            ]}
          >
            <Text style={[styles.chipText, selectedType === opt.name && styles.chipTextActive]}>
              {opt.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Gas type</Text>
      <Controller
        control={control}
        name="gas_type"
        render={({ field: { value, onChange } }) => (
          <View style={styles.chipRow}>
            {(["12kg", "48kg"] as const).map((gas) => (
              <Pressable
                key={gas}
                onPress={() => onChange(gas)}
                style={({ pressed }) => [
                  styles.chip,
                  pressed && styles.pressed,
                  value === gas && styles.chipActive,
                ]}
              >
                <Text style={[styles.chipText, value === gas && styles.chipTextActive]}>{gas}</Text>
              </Pressable>
            ))}
          </View>
        )}
      />

      <Text style={styles.label}>Note</Text>
      <Controller
        control={control}
        name="note"
        render={({ field: { onChange, value } }) => (
          <TextInput
            style={[styles.input, { minHeight: 60 }]}
            placeholder="Optional note"
            value={value}
            onChangeText={onChange}
            multiline
          />
        )}
      />

      <View style={styles.switchRow}>
        <Text style={styles.label}>Active</Text>
        <Controller
          control={control}
          name="is_active"
          render={({ field: { onChange, value } }) => (
            <Switch value={!!value} onValueChange={onChange} />
          )}
        />
      </View>

      <Text style={styles.label}>Requires security check</Text>
      <Controller
        control={control}
        name="requires_security_check"
        render={({ field: { onChange, value } }) =>
          renderBinaryChoice(value, (next) => {
            onChange(next);
            if (!next) {
              setValue("security_check_exists", null);
              setValue("last_security_check_at", "");
            }
          })
        }
      />

      {requiresCheck ? (
        <>
          <Text style={styles.label}>Security check exists</Text>
          <Controller
            control={control}
            name="security_check_exists"
            render={({ field: { onChange, value } }) =>
              renderBinaryChoice(value, (next) => {
                onChange(next);
                if (!next) setValue("last_security_check_at", "");
              })
            }
          />
        </>
      ) : null}

      {requiresCheck && checkExists ? (
        <>
          <Text style={styles.label}>Last security check date</Text>
          <Pressable style={styles.dateField} onPress={() => setCalendarOpen(true)}>
            <Text style={styles.dateText}>{lastCheck || "Select date"}</Text>
          </Pressable>
        </>
      ) : null}

      <Pressable
        onPress={onSubmit}
        style={({ pressed }) => [styles.primary, pressed && styles.pressed, (!canSubmit || submitting) && styles.disabledButton]}
        disabled={submitting || !canSubmit}
      >
        <Text style={styles.primaryText}>{submitting ? "Saving..." : "Create System"}</Text>
      </Pressable>

      <CalendarModal
        visible={calendarOpen}
        value={lastCheck || new Date().toISOString().slice(0, 10)}
        onSelect={(next) => setValue("last_security_check_at", next)}
        onClose={() => setCalendarOpen(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "#f7f7f8",
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  meta: {
    color: "#64748b",
    fontSize: 12,
  },
  label: {
    fontWeight: "700",
    marginTop: 12,
  },
  labelActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ccc",
    marginTop: 6,
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
  binaryRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  primary: {
    backgroundColor: "#16a34a",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 16,
  },
  primaryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  disabledButton: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.9,
  },
});

