import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { useCustomers, useUpdateCustomer } from "@/hooks/useCustomers";
import { useOrders } from "@/hooks/useOrders";
import { useCreateSystem, useDeleteSystem, useSystems, useUpdateSystem } from "@/hooks/useSystems";
import { CustomerType, GasType, SystemType } from "@/types/domain";
import { gasColor } from "@/constants/gas";

type CustomerFormValues = {
  name: string;
  phone?: string;
  notes?: string;
  systems: Array<{
    id: string;
    system_type: SystemType;
    gas_type: GasType;
    system_customer_type: CustomerType;
    name: string;
    is_active?: boolean;
    require_security_check?: boolean;
    security_check_exists?: boolean;
    security_check_date?: string;
  }>;
};

export default function EditCustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const customersQuery = useCustomers();
  const customer = useMemo(() => (customersQuery.data ?? []).find((c) => c.id === id), [customersQuery.data, id]);
  const systemsQuery = useSystems(id?.trim() || undefined, { enabled: !!id });
  const ordersQuery = useOrders();

  const { control, handleSubmit, reset } = useForm<CustomerFormValues>({
    defaultValues: {
      name: "",
      phone: "",
      notes: "",
      systems: [],
    },
  });
  const { fields, update, append, remove } = useFieldArray({
    control,
    name: "systems",
    keyName: "fieldId",
  });
  const updateCustomer = useUpdateCustomer();
  const createSystem = useCreateSystem();
  const updateSystem = useUpdateSystem();
  const deleteSystem = useDeleteSystem();
  const [submitting, setSubmitting] = useState(false);

  const systemPresets = useMemo(
    () =>
      [
        { id: "main_kitchen", label: "Main Kitchen" },
        { id: "side_kitchen", label: "Side Kitchen" },
        { id: "oven", label: "Oven" },
        { id: "restaurant", label: "Restaurant" },
        { id: "other", label: "Other" },
      ] as Array<{ id: SystemType; label: string }>,
    []
  );

  const presetLabel = (t: SystemType) => systemPresets.find((p) => p.id === t)?.label ?? t;

  const [initialized, setInitialized] = useState(false);
  const initializedCustomerId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!customer?.id) {
      initializedCustomerId.current = undefined;
      setInitialized(false);
      return;
    }

    if (initializedCustomerId.current !== customer.id) {
      initializedCustomerId.current = customer.id;
      setInitialized(false);
    }
  }, [customer?.id]);

  useEffect(() => {
    if (!customer || !systemsQuery.data) return;

    // Run ONLY once — prevents overwriting edited values with stale cache
    if (!initialized) {
      // Convert systems exactly like before
      const systems = Array.from(
        new Map(
          systemsQuery.data.map((s) => [
            s.id,
            {
              id: s.id,
              name: s.name,
              system_type: s.system_type,
              gas_type: s.gas_type ?? "12kg",
              system_customer_type: s.system_customer_type ?? "private",
              is_active: s.is_active ?? true,
              require_security_check: s.require_security_check ?? false,
              security_check_exists: s.security_check_exists ?? false,
              security_check_date: s.security_check_date ?? "",
            },
          ])
        ).values()
      );

      // Initial form fill
      reset({
        name: customer.name,
        phone: customer.phone ?? "",
        notes: customer.notes ?? "",
        systems,
      });

      setInitialized(true);
    }
  }, [customer, systemsQuery.data, reset, initialized]);

  useEffect(() => {
    if (customer && !systemsQuery.isLoading && (systemsQuery.data ?? []).length === 0) {
      reset({
        name: customer.name,
        phone: customer.phone ?? "",
        notes: customer.notes ?? "",
        systems: [],
      });
    }
  }, [customer, systemsQuery.isLoading, systemsQuery.data, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!customer) return;
    try {
      setSubmitting(true);
      console.log("[edit customer submit] systems", values.systems);
      // Only update customer core fields; systems will be updated separately.
      await updateCustomer.mutateAsync({
        id: customer.id,
        payload: {
          name: values.name,
          phone: values.phone?.trim() ? values.phone.trim() : undefined,
          notes: values.notes,
          // avoid logging an activity for unchanged customer_type
          customer_type: customer.customer_type,
        },
      });
      for (const sys of values.systems) {
        const normalizedSecurityDate =
          sys.security_check_exists && sys.security_check_date ? sys.security_check_date.trim() : null;
        const securityDate = normalizedSecurityDate && normalizedSecurityDate.length > 0 ? normalizedSecurityDate : null;
        const payload = {
          name: sys.name || presetLabel(sys.system_type),
          system_type: sys.system_type,
          gas_type: sys.gas_type,
          system_customer_type: sys.system_customer_type,
          customer_id: customer.id,
          is_active: sys.is_active ?? true,
          require_security_check: sys.require_security_check ?? false,
          security_check_exists: sys.security_check_exists ?? false,
          security_check_date: securityDate,
        };
        if (sys.id.startsWith("s-temp")) {
          console.log("[edit] createSystem mutate", sys.id, sys.is_active, sys);
          await createSystem.mutateAsync(payload);
        } else {
          console.log("[edit] updateSystem mutate", sys.id, sys.is_active, sys);
          await updateSystem.mutateAsync({
            id: sys.id,
            payload,
          });
        }
      }
      Alert.alert("Customer updated");
      router.back();
    } catch (err) {
      Alert.alert("Error", "Failed to update customer.");
    } finally {
      setSubmitting(false);
    }
  });

  if (customersQuery.isLoading || systemsQuery.isLoading) {
    return (
      <View style={styles.center}>
        <Text>Loading...</Text>
      </View>
    );
  }

  if (!customer) {
    return (
      <View style={styles.center}>
        <Text>Customer not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Edit Customer</Text>

      <FieldLabel>Name</FieldLabel>
      <Controller
        control={control}
        name="name"
        rules={{ required: true }}
        render={({ field: { onChange, value } }) => <TextInput style={styles.input} placeholder="Customer name" value={value} onChangeText={onChange} />}
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

      <Text style={[styles.label, { marginBottom: 4 }]}>Systems ({fields.length})</Text>
      {fields.length === 0 && <Text style={styles.meta}>No systems to edit.</Text>}
      {fields.map((field, index) => {
        const hasOrders =
          (ordersQuery.data ?? []).some((o) => o.system_id === fields[index].id && o.customer_id === customer.id);
        return (
          <View key={field.fieldId} style={styles.systemCard}>
            <Text style={styles.systemTitle}>{presetLabel(field.system_type)}</Text>
          <FieldLabel>System Type</FieldLabel>
          <Controller
            control={control}
            name={`systems.${index}.system_type`}
            render={({ field: { value, onChange } }) => (
              <View style={styles.chipRow}>
                {(["main_kitchen", "side_kitchen", "oven", "restaurant", "other"] as SystemType[]).map((t) => (
                  <Pressable
                      key={t}
                      onPress={() => {
                        onChange(t);
                        update(index, { ...fields[index], system_type: t, name: presetLabel(t) });
                      }}
                      style={[styles.chip, value === t && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, value === t && styles.chipTextActive]}>{t}</Text>
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
                    onPress={() => {
                      onChange(g);
                      update(index, { ...fields[index], gas_type: g });
                    }}
                    style={[
                      styles.chip,
                      value === g && { backgroundColor: gasColor(g), borderColor: gasColor(g) },
                    ]}
                  >
                    <Text style={[styles.chipText, value === g ? styles.chipTextActive : { color: gasColor(g) }]}>
                      {g}
                    </Text>
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
                    onPress={() => {
                      onChange(t);
                      update(index, { ...fields[index], system_customer_type: t });
                    }}
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
            <View style={styles.rowBetween}>
              <Pressable
                onPress={() => {
                  if (hasOrders) {
                    Alert.alert("Cannot remove", "This system has orders and cannot be deleted.");
                    return;
                  }
                  Alert.alert("Remove system?", "This will delete the system from this customer.", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: async () => {
                        if (!fields[index].id.startsWith("s-temp")) {
                          await deleteSystem.mutateAsync({ id: fields[index].id, customerId: customer.id });
                        }
                        remove(index);
                      },
                    },
                  ]);
                }}
                disabled={hasOrders}
              >
                <Text style={[styles.removeText, hasOrders && styles.disabledText]}>
                  {hasOrders ? "Has orders" : "Remove"}
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      <Pressable
        onPress={() =>
          append({
            id: `s-temp-${fields.length + 1}`,
            name: presetLabel("main_kitchen"),
            system_type: "main_kitchen",
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
        <Text style={styles.primaryText}>{submitting ? "Saving..." : "Update Customer"}</Text>
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
    marginTop: 6,
  },
  systemCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    gap: 6,
  },
  systemTitle: {
    fontWeight: "700",
  },
  meta: {
    color: "#666",
  },
  disabledText: {
    color: "#999",
  },
  removeText: {
    color: "#b00020",
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 6,
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: {
    backgroundColor: "#e8eef1",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  secondaryText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
});
