import { useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { ScrollView, View, Text, TextInput, Pressable, StyleSheet, Alert, Switch } from "react-native";
import { router } from "expo-router";

import { useCreateCustomer } from "@/hooks/useCustomers";
import { useCreateSystem } from "@/hooks/useSystems";
import { CustomerType, GasType, SystemType } from "@/types/domain";

type CustomerFormValues = {
  name: string;
  phone: string;
  notes?: string;
  systems: Array<{
    type: SystemType;
    gas_type: GasType;
    system_customer_type: CustomerType;
    is_active: boolean;
    require_security_check?: boolean;
    security_check_exists?: boolean;
    security_check_date?: string;
  }>;
};

export default function NewCustomerScreen() {
  const { control, handleSubmit } = useForm<CustomerFormValues>({
    defaultValues: {
      name: "",
      phone: "",
      notes: "",
      systems: [
        {
          type: "main_kitchen",
          gas_type: "12kg",
          system_customer_type: "private",
          is_active: true,
          require_security_check: false,
          security_check_exists: false,
          security_check_date: "",
        },
      ],
    },
  });
  const { fields, append, remove, update } = useFieldArray({
    control,
    name: "systems",
  });
  const createCustomer = useCreateCustomer();
  const createSystem = useCreateSystem();
  const [submitting, setSubmitting] = useState(false);

  const systemPresets = useMemo(
    () =>
      [
        { id: "main_kitchen", label: "Main Kitchen", suggestedName: "Main Kitchen" },
        { id: "side_kitchen", label: "Side Kitchen", suggestedName: "Side Kitchen" },
        { id: "oven", label: "Oven", suggestedName: "Oven" },
        { id: "restaurant", label: "Restaurant", suggestedName: "Restaurant" },
        { id: "other", label: "Something else", suggestedName: "" },
      ] as Array<{ id: SystemType; label: string; suggestedName: string }>,
    []
  );

  const presetLabel = (type: SystemType) => systemPresets.find((p) => p.id === type)?.label ?? type;

  const onSubmit = handleSubmit(async (values) => {
    try {
      setSubmitting(true);
      console.log("[new customer submit] systems length", values.systems.length, values.systems);
      const created = await createCustomer.mutateAsync({
        name: values.name,
        phone: values.phone,
        notes: values.notes,
        customer_type: values.systems[0]?.system_customer_type ?? "private",
      });
      // create systems in sequence
      for (const sys of values.systems) {
        const sanitizedSecurityDate = sys.security_check_date?.trim();
        await createSystem.mutateAsync({
          customer_id: created.id,
          name: presetLabel(sys.type),
          location: undefined,
          system_type: sys.type,
          gas_type: sys.gas_type,
          system_customer_type: sys.system_customer_type,
          is_active: sys.is_active,
          require_security_check: sys.require_security_check,
          security_check_exists: sys.security_check_exists,
          security_check_date: sanitizedSecurityDate ? sanitizedSecurityDate : undefined,
        });
      }
      router.replace({ pathname: "/", params: { flash: "customer-created" } });
    } catch (err) {
      Alert.alert("Error", "Failed to create customer.");
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Add Customer</Text>

      <FieldLabel>Name</FieldLabel>
      <Controller
        control={control}
        name="name"
        rules={{ required: true }}
        render={({ field: { onChange, value } }) => (
          <TextInput style={styles.input} placeholder="Customer name" value={value} onChangeText={onChange} />
        )}
      />

      <FieldLabel>Phone</FieldLabel>
      <Controller
        control={control}
        name="phone"
        render={({ field: { onChange, value } }) => (
          <TextInput style={styles.input} placeholder="Phone" value={value} onChangeText={onChange} keyboardType="phone-pad" />
        )}
      />

      <FieldLabel>Notes</FieldLabel>
      <Controller
        control={control}
        name="notes"
        render={({ field: { onChange, value } }) => (
          <TextInput
            style={[styles.input, { minHeight: 60 }]}
            placeholder="Optional notes"
            value={value}
            onChangeText={onChange}
            multiline
          />
        )}
      />

      <FieldLabel>Systems ({fields.length})</FieldLabel>
      {fields.map((field, index) => {
        return (
          <View key={field.id} style={styles.systemCard}>
            <Text style={styles.systemTitle}>System {index + 1}</Text>
            <Controller
              control={control}
              name={`systems.${index}.type`}
              render={({ field: { value, onChange } }) => (
                <View style={styles.chipRow}>
                  {systemPresets.map((preset) => (
                    <Pressable
                      key={preset.id}
                      onPress={() => {
                        onChange(preset.id);
                        update(index, {
                          ...fields[index],
                          type: preset.id,
                        });
                      }}
                      style={[styles.chip, value === preset.id && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, value === preset.id && styles.chipTextActive]}>{preset.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            />
            <FieldLabel>Gas Type</FieldLabel>
            <Controller
              control={control}
              name={`systems.${index}.gas_type`}
              render={({ field: { value, onChange } }) => (
                <View style={styles.chipRow}>
                  {(["12kg", "48kg"] as GasType[]).map((g) => (
                    <Pressable
                      key={g}
                      onPress={() => onChange(g)}
                      style={[styles.chip, value === g && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, value === g && styles.chipTextActive]}>{g}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            />

            <FieldLabel>Customer Type</FieldLabel>
            <Controller
              control={control}
              name={`systems.${index}.system_customer_type`}
              render={({ field: { value, onChange } }) => (
                <View style={styles.chipRow}>
                  {(["private", "industrial"] as CustomerType[]).map((t) => (
                    <Pressable
                      key={t}
                      onPress={() => onChange(t)}
                      style={[styles.chip, value === t && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, value === t && styles.chipTextActive]}>{t}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            />
            <Controller
              control={control}
              name={`systems.${index}.is_active`}
              render={({ field: { value, onChange } }) => {
                const active = value ?? true;
                return (
                  <>
                    <View style={styles.rowBetween}>
                      <Text style={styles.meta}>Is active?</Text>
                      <Switch
                        value={active}
                        onValueChange={(next) => {
                          onChange(next);
                          update(index, {
                            ...fields[index],
                            is_active: next,
                            // Reset downstream flags when turning inactive.
                            require_security_check: next ? fields[index].require_security_check ?? false : false,
                            security_check_exists: next ? fields[index].security_check_exists ?? false : false,
                            security_check_date: next ? fields[index].security_check_date ?? "" : "",
                          });
                        }}
                      />
                    </View>
                    {active && (
                      <Controller
                        control={control}
                        name={`systems.${index}.require_security_check`}
                        render={({ field: { value: requireCheck = false, onChange: onRequireChange } }) => (
                          <>
                            <View style={styles.rowBetween}>
                              <Text style={styles.meta}>Require security check?</Text>
                              <Switch
                                value={requireCheck}
                                onValueChange={(next) => {
                                  onRequireChange(next);
                                  update(index, {
                                    ...fields[index],
                                    require_security_check: next,
                                    security_check_exists: next ? fields[index].security_check_exists ?? false : false,
                                    security_check_date: next ? fields[index].security_check_date ?? "" : "",
                                  });
                                }}
                              />
                            </View>
                            {requireCheck && (
                              <Controller
                                control={control}
                                name={`systems.${index}.security_check_exists`}
                                render={({ field: { value: exists = false, onChange: onExistsChange } }) => (
                                  <>
                                    <View style={styles.rowBetween}>
                                      <Text style={styles.meta}>Security check exists?</Text>
                                      <Switch
                                        value={exists}
                                        onValueChange={(next) => {
                                          onExistsChange(next);
                                          update(index, {
                                            ...fields[index],
                                            security_check_exists: next,
                                            security_check_date: next ? fields[index].security_check_date ?? "" : "",
                                          });
                                        }}
                                      />
                                    </View>
                                    {exists && (
                                      <Controller
                                        control={control}
                                        name={`systems.${index}.security_check_date`}
                                        rules={{ required: exists }}
                                        render={({ field: { value: dateValue = "", onChange: onDateChange } }) => (
                                          <>
                                            <FieldLabel>Last security check date</FieldLabel>
                                            <TextInput
                                              style={styles.input}
                                              placeholder="YYYY-MM-DD"
                                              value={dateValue}
                                              onChangeText={(txt) => {
                                                onDateChange(txt);
                                                update(index, { ...fields[index], security_check_date: txt });
                                              }}
                                            />
                                          </>
                                        )}
                                      />
                                    )}
                                  </>
                                )}
                              />
                            )}
                          </>
                        )}
                      />
                    )}
                  </>
                );
              }}
            />
            {fields.length > 1 && (
              <Pressable onPress={() => remove(index)} style={styles.removeBtn}>
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      <Pressable
        onPress={() =>
          append({
            type: "main_kitchen",
            gas_type: "12kg",
            system_customer_type: "private",
            is_active: true,
            require_security_check: false,
            security_check_exists: false,
            security_check_date: "",
          })
        }
        style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
      >
        <Text style={styles.secondaryText}>+ Add another system</Text>
      </Pressable>

      <Pressable onPress={onSubmit} style={({ pressed }) => [styles.primary, pressed && styles.pressed]} disabled={submitting}>
        <Text style={styles.primaryText}>{submitting ? "Saving..." : "Save Customer"}</Text>
      </Pressable>
    </ScrollView>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
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
    marginBottom: 8,
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
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  meta: {
    color: "#666",
  },
  toggle: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  toggleOn: {
    backgroundColor: "#0a7ea4",
  },
  toggleOff: {
    backgroundColor: "#e0e0e0",
  },
  toggleText: {
    color: "#fff",
    fontWeight: "700",
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
  systemCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  systemTitle: {
    fontWeight: "700",
    marginBottom: 6,
  },
  removeBtn: {
    marginTop: 8,
    alignSelf: "flex-end",
  },
  removeText: {
    color: "#b00020",
    fontWeight: "700",
  },
  secondary: {
    backgroundColor: "#e8eef1",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  secondaryText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
});
