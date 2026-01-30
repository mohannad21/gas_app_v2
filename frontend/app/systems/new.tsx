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
  gas_type: "12kg" | "48kg";
  note?: string;
  is_active: boolean;
  requires_security_check: boolean;
  security_check_exists: boolean;
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
      gas_type: "12kg",
      note: "",
      is_active: true,
      requires_security_check: false,
      security_check_exists: false,
      last_security_check_at: "",
    },
  });

  const requiresCheck = watch("requires_security_check");
  const checkExists = watch("security_check_exists");
  const lastCheck = watch("last_security_check_at");

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
        gas_type: values.gas_type,
        note: values.note?.trim() ? values.note.trim() : undefined,
        is_active: values.is_active,
        requires_security_check: values.requires_security_check,
        security_check_exists: values.security_check_exists,
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

      <Text style={styles.label}>System type</Text>
      <View style={styles.chipRow}>
        {typeOptions.map((opt) => (
          <Pressable
            key={opt.id}
            onPress={() => setValue("name", opt.name)}
            style={({ pressed }) => [
              styles.chip,
              pressed && styles.pressed,
              watch("name") === opt.name && styles.chipActive,
            ]}
          >
            <Text style={[styles.chipText, watch("name") === opt.name && styles.chipTextActive]}>
              {opt.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Controller
        control={control}
        name="name"
        rules={{ required: true }}
        render={({ field: { onChange, value } }) => (
          <TextInput style={styles.input} placeholder="Custom system type" value={value} onChangeText={onChange} />
        )}
      />
      <Pressable onPress={() => router.push("/system-types")} style={styles.linkBtn}>
        <Text style={styles.linkText}>Manage system types</Text>
      </Pressable>

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

      <View style={styles.switchRow}>
        <Text style={styles.label}>Requires security check</Text>
        <Controller
          control={control}
          name="requires_security_check"
          render={({ field: { onChange, value } }) => (
            <Switch
              value={!!value}
              onValueChange={(next) => {
                onChange(next);
                if (!next) {
                  setValue("security_check_exists", false);
                  setValue("last_security_check_at", "");
                }
              }}
            />
          )}
        />
      </View>

      {requiresCheck ? (
        <View style={styles.switchRow}>
          <Text style={styles.label}>Security check exists</Text>
          <Controller
            control={control}
            name="security_check_exists"
            render={({ field: { onChange, value } }) => (
              <Switch
                value={!!value}
                onValueChange={(next) => {
                  onChange(next);
                  if (!next) setValue("last_security_check_at", "");
                }}
              />
            )}
          />
        </View>
      ) : null}

      {requiresCheck && checkExists ? (
        <>
          <Text style={styles.label}>Last security check date</Text>
          <Pressable style={styles.dateField} onPress={() => setCalendarOpen(true)}>
            <Text style={styles.dateText}>{lastCheck || "Select date"}</Text>
          </Pressable>
        </>
      ) : null}

      <Pressable onPress={onSubmit} style={({ pressed }) => [styles.primary, pressed && styles.pressed]} disabled={submitting}>
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
  linkBtn: {
    marginTop: 6,
  },
  linkText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
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
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  primaryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  pressed: {
    opacity: 0.9,
  },
});
