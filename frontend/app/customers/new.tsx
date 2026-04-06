import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ScrollView, View, Text, TextInput, Pressable, StyleSheet, Alert, Keyboard } from "react-native";
import { router } from "expo-router";

import { CalendarModal } from "@/components/AddRefillModal";
import { FieldCell, type FieldStepper } from "@/components/entry/FieldPair";
import { useCreateCustomer, useCreateCustomerAdjustment } from "@/hooks/useCustomers";
import { useCreateSystem } from "@/hooks/useSystems";
import { getUserFacingApiError, logApiError } from "@/lib/apiErrors";
import { useSystemTypes } from "@/hooks/useSystemTypes";
import { showToast } from "@/lib/toast";

type BalanceState = "balanced" | "customer_owes" | "you_owe";

type CustomerFormValues = {
  name: string;
  phone?: string;
  address?: string;
  note?: string;
  initial_money_state: BalanceState;
  initial_money_amount: number;
  initial_12kg_state: BalanceState;
  initial_12kg_amount: number;
  initial_48kg_state: BalanceState;
  initial_48kg_amount: number;
};

type NewSystemForm = {
  id: string;
  name: string;
  gas_type: "12kg" | "48kg" | null;
  requires_security_check: boolean | null;
  security_check_exists: boolean | null;
  last_security_check_at?: string;
};

const CUSTOMER_MONEY_STEPPERS: FieldStepper[] = [
  { delta: -5, label: "-5", position: "left" },
  { delta: 5, label: "+5", position: "right" },
  { delta: -20, label: "-20", position: "top-left" },
  { delta: 20, label: "+20", position: "top-right" },
];

const CUSTOMER_CYLINDER_STEPPERS: FieldStepper[] = [
  { delta: -1, label: "-1", position: "left" },
  { delta: 1, label: "+1", position: "right" },
];

function systemRowHasData(system: NewSystemForm) {
  return Boolean(
    system.name ||
      system.gas_type ||
      system.requires_security_check !== null ||
      system.security_check_exists !== null ||
      system.last_security_check_at
  );
}

function systemRowIsComplete(system: NewSystemForm) {
  if (!systemRowHasData(system)) return true;
  if (!system.name || !system.gas_type || system.requires_security_check === null) return false;
  if (system.requires_security_check && system.security_check_exists === null) return false;
  return true;
}

export default function NewCustomerScreen() {
  const {
    control,
    handleSubmit,
    trigger,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CustomerFormValues>({
    defaultValues: {
      name: "",
      phone: "",
      address: "",
      note: "",
      initial_money_state: "balanced",
      initial_money_amount: 0,
      initial_12kg_state: "balanced",
      initial_12kg_amount: 0,
      initial_48kg_state: "balanced",
      initial_48kg_amount: 0,
    },
  });
  const createCustomer = useCreateCustomer({ showToast: false });
  const createAdjustment = useCreateCustomerAdjustment({ showToast: false });
  const createSystem = useCreateSystem();
  const systemTypesQuery = useSystemTypes();
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(1);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState<string | null>(null);

  const [systems, setSystems] = useState<NewSystemForm[]>([
    {
      id: `sys_${Date.now()}`,
      name: "",
      gas_type: null,
      requires_security_check: null,
      security_check_exists: null,
      last_security_check_at: "",
    },
  ]);

  const typeOptions = useMemo(
    () => (systemTypesQuery.data ?? []).filter((t) => t.is_active !== false),
    [systemTypesQuery.data]
  );

  const nameValue = watch("name");
  const moneyState = watch("initial_money_state");
  const cyl12State = watch("initial_12kg_state");
  const cyl48State = watch("initial_48kg_state");

  const balanceOptions: Array<{ id: BalanceState; label: string }> = [
    { id: "customer_owes", label: "Debts on customer" },
    { id: "balanced", label: "Balanced" },
    { id: "you_owe", label: "Credit for customer" },
  ];
  const toPositiveNumber = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
  };
  const resolveSignedAmount = (state: BalanceState, amount: number) => {
    const normalized = Number.isFinite(amount) ? Math.abs(amount) : 0;
    if (state === "customer_owes") return normalized;
    if (state === "you_owe") return -normalized;
    return 0;
  };
  const resolveSignedCount = (state: BalanceState, amount: number) => {
    const normalized = Number.isFinite(amount) ? Math.trunc(Math.abs(amount)) : 0;
    if (state === "customer_owes") return normalized;
    if (state === "you_owe") return -normalized;
    return 0;
  };
  const goNext = async () => {
    if (step === 1) {
      const ok = await trigger("name");
      if (!ok) return;
    }
    setStep((prev) => Math.min(3, prev + 1));
  };
  const goBack = () => setStep((prev) => Math.max(1, prev - 1));
  const hasIncompleteSystem = systems.some((system) => !systemRowIsComplete(system));

  const renderBalanceAmountField = (
    fieldName: "initial_money_amount" | "initial_12kg_amount" | "initial_48kg_amount",
    steppers: FieldStepper[]
  ) => (
    <>
      <Controller
        control={control}
        name={fieldName}
        render={({ field: { onChange, value } }) => (
          <View style={styles.balanceFieldWrap}>
            <FieldCell
              title="Amount"
              value={Number(value ?? 0)}
              onIncrement={() => onChange(Math.max(0, Number(value ?? 0) + 1))}
              onDecrement={() => onChange(Math.max(0, Number(value ?? 0) - 1))}
              onChangeText={(text) => onChange(toPositiveNumber(text))}
              steppers={steppers}
            />
          </View>
        )}
      />
    </>
  );

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

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (hasIncompleteSystem) {
        Alert.alert("Incomplete system", "Finish the system details or leave the row blank before saving.");
        return;
      }
      setSubmitting(true);
      const created = await createCustomer.mutateAsync({
        name: values.name,
        phone: values.phone?.trim() ? values.phone.trim() : undefined,
        address: values.address?.trim() ? values.address.trim() : undefined,
        note: values.note,
      });
      const adjustmentReason = "Opening Balance (App Setup)";
      const moneyDelta = resolveSignedAmount(values.initial_money_state, values.initial_money_amount);
      const cyl12Delta = resolveSignedCount(values.initial_12kg_state, values.initial_12kg_amount);
      const cyl48Delta = resolveSignedCount(values.initial_48kg_state, values.initial_48kg_amount);
      if (moneyDelta !== 0 || cyl12Delta !== 0 || cyl48Delta !== 0) {
        await createAdjustment.mutateAsync({
          customer_id: created.id,
          amount_money: moneyDelta,
          count_12kg: cyl12Delta,
          count_48kg: cyl48Delta,
          reason: adjustmentReason,
        });
      }
      for (const sys of systems) {
        if (!systemRowHasData(sys)) continue;
        const name = sys.name.trim();
        await createSystem.mutateAsync({
          customer_id: created.id,
          name,
          gas_type: sys.gas_type!,
          requires_security_check: sys.requires_security_check!,
          security_check_exists: sys.requires_security_check ? sys.security_check_exists ?? false : false,
          last_security_check_at:
            sys.requires_security_check && sys.security_check_exists && sys.last_security_check_at
              ? sys.last_security_check_at
              : undefined,
          is_active: true,
        });
      }
      showToast("Customer created");
      router.replace({ pathname: "/", params: { flash: "customer-created" } });
    } catch (err) {
      logApiError("[new customer submit] error", err);
      Alert.alert("Error", getUserFacingApiError(err, "Failed to create customer."));
    } finally {
      setSubmitting(false);
    }
  });

  const openCalendarFor = (systemId: string) => {
    setCalendarTarget(systemId);
    setCalendarOpen(true);
  };

  const calendarTargetSystem = systems.find((s) => s.id === calendarTarget);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Add Customer</Text>
      <Text style={styles.stepText}>Step {step} of 3</Text>

      {step === 1 ? (
        <>
          <Text style={styles.stepQuestion}>Who is your new customer?</Text>
          <FieldLabel>What is the name of the customer or business?</FieldLabel>
          <Controller
            control={control}
            name="name"
            rules={{ required: "Name is required" }}
            render={({ field: { onChange, value } }) => (
              <TextInput style={styles.input} placeholder="Customer name" value={value} onChangeText={onChange} />
            )}
          />
          {errors.name?.message ? <Text style={styles.errorText}>{errors.name.message}</Text> : null}

          <FieldLabel>How can we reach them by phone?</FieldLabel>
          <Controller
            control={control}
            name="phone"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={styles.input}
                placeholder="Phone"
                value={value}
                onChangeText={onChange}
                keyboardType="phone-pad"
              />
            )}
          />

          <FieldLabel>Where are they located?</FieldLabel>
          <Controller
            control={control}
            name="address"
            render={({ field: { onChange, value } }) => (
              <TextInput style={styles.input} placeholder="Address" value={value} onChangeText={onChange} />
            )}
          />

          <FieldLabel>Anything to remember about this customer?</FieldLabel>
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
                blurOnSubmit
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
            )}
          />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Text style={styles.stepQuestion}>Opening balances</Text>

          <FieldLabel>Money balance</FieldLabel>
          <Controller
            control={control}
            name="initial_money_state"
            render={({ field: { value, onChange } }) => (
              <View style={styles.balanceChoiceRow}>
                {balanceOptions.map((option) => (
                  <Pressable
                    key={option.id}
                    onPress={() => {
                      onChange(option.id);
                      if (option.id === "balanced") {
                        setValue("initial_money_amount", 0);
                      }
                    }}
                    style={({ pressed }) => [
                      styles.balanceChoiceButton,
                      pressed && styles.chipPressed,
                      value === option.id && styles.chipActive,
                    ]}
                  >
                    <Text style={[styles.balanceChoiceText, value === option.id && styles.chipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          />
          {moneyState !== "balanced" ? renderBalanceAmountField("initial_money_amount", CUSTOMER_MONEY_STEPPERS) : null}

          <FieldLabel>12kg cylinders</FieldLabel>
          <Controller
            control={control}
            name="initial_12kg_state"
            render={({ field: { value, onChange } }) => (
              <View style={styles.balanceChoiceRow}>
                {balanceOptions.map((option) => (
                  <Pressable
                    key={option.id}
                    onPress={() => {
                      onChange(option.id);
                      if (option.id === "balanced") {
                        setValue("initial_12kg_amount", 0);
                      }
                    }}
                    style={({ pressed }) => [
                      styles.balanceChoiceButton,
                      pressed && styles.chipPressed,
                      value === option.id && styles.chipActive,
                    ]}
                  >
                    <Text style={[styles.balanceChoiceText, value === option.id && styles.chipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          />
          {cyl12State !== "balanced" ? renderBalanceAmountField("initial_12kg_amount", CUSTOMER_CYLINDER_STEPPERS) : null}

          <FieldLabel>48kg cylinders</FieldLabel>
          <Controller
            control={control}
            name="initial_48kg_state"
            render={({ field: { value, onChange } }) => (
              <View style={styles.balanceChoiceRow}>
                {balanceOptions.map((option) => (
                  <Pressable
                    key={option.id}
                    onPress={() => {
                      onChange(option.id);
                      if (option.id === "balanced") {
                        setValue("initial_48kg_amount", 0);
                      }
                    }}
                    style={({ pressed }) => [
                      styles.balanceChoiceButton,
                      pressed && styles.chipPressed,
                      value === option.id && styles.chipActive,
                    ]}
                  >
                    <Text style={[styles.balanceChoiceText, value === option.id && styles.chipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          />
          {cyl48State !== "balanced" ? renderBalanceAmountField("initial_48kg_amount", CUSTOMER_CYLINDER_STEPPERS) : null}
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Text style={styles.stepQuestion}>Add systems</Text>
          <Text style={styles.helper}>Each customer can have one or more systems.</Text>
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
                    onPress={() =>
                      setSystems((prev) =>
                        prev.map((row) => (row.id === sys.id ? { ...row, name: opt.name } : row))
                      )
                    }
                    style={({ pressed }) => [
                      styles.chip,
                      pressed && styles.chipPressed,
                      sys.name === opt.name && styles.chipActive,
                    ]}
                  >
                    <Text style={[styles.chipText, sys.name === opt.name && styles.chipTextActive]}>
                      {opt.name}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Gas type</Text>
              <View style={styles.chipRow}>
                {(["12kg", "48kg"] as const).map((gas) => (
                  <Pressable
                    key={gas}
                    onPress={() =>
                      setSystems((prev) => prev.map((row) => (row.id === sys.id ? { ...row, gas_type: gas } : row)))
                    }
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
                setSystems((prev) =>
                  prev.map((row) =>
                    row.id === sys.id
                      ? {
                          ...row,
                          requires_security_check: next,
                          security_check_exists: next ? row.security_check_exists : null,
                          last_security_check_at: next ? row.last_security_check_at : "",
                        }
                      : row
                  )
                )
              )}

              {sys.requires_security_check ? (
                <>
                  <Text style={styles.label}>Security check exists</Text>
                  {renderBinaryChoice(sys.security_check_exists, (next) =>
                    setSystems((prev) =>
                      prev.map((row) =>
                        row.id === sys.id
                          ? {
                              ...row,
                              security_check_exists: next,
                              last_security_check_at: next ? row.last_security_check_at : "",
                            }
                          : row
                      )
                    )
                  )}
                  {sys.security_check_exists ? (
                    <>
                      <Text style={styles.label}>Last security check date</Text>
                      <Pressable style={styles.dateField} onPress={() => openCalendarFor(sys.id)}>
                        <Text style={styles.dateText}>{sys.last_security_check_at || "Select date"}</Text>
                      </Pressable>
                    </>
                  ) : null}
                </>
              ) : null}

              {systems.length > 1 ? (
                <Pressable
                  onPress={() => setSystems((prev) => prev.filter((row) => row.id !== sys.id))}
                  style={styles.removeBtn}
                >
                  <Text style={styles.removeText}>Remove system</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
          <Pressable
            onPress={() =>
              setSystems((prev) => [
                ...prev,
                {
                  id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                  name: "",
                  gas_type: null,
                  requires_security_check: null,
                  security_check_exists: null,
                  last_security_check_at: "",
                },
              ])
            }
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryText}>+ Add another system</Text>
          </Pressable>
        </>
      ) : null}

      <View style={styles.navRow}>
        {step > 1 ? (
          <Pressable onPress={goBack} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>Back</Text>
          </Pressable>
        ) : (
          <View style={styles.navSpacer} />
        )}
        {step < 3 ? (
          <Pressable
            onPress={goNext}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            disabled={step === 1 && !nameValue?.trim()}
          >
            <Text style={styles.primaryText}>Next</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onSubmit}
            style={({ pressed }) => [
              styles.primary,
              pressed && styles.pressed,
              (submitting || hasIncompleteSystem) && styles.disabledButton,
            ]}
            disabled={submitting || hasIncompleteSystem}
          >
            <Text style={styles.primaryText}>{submitting ? "Saving..." : "Save Customer"}</Text>
          </Pressable>
        )}
      </View>

      <CalendarModal
        visible={calendarOpen && !!calendarTargetSystem}
        value={calendarTargetSystem?.last_security_check_at || new Date().toISOString().slice(0, 10)}
        onSelect={(next) => {
          if (!calendarTargetSystem) return;
          setSystems((prev) =>
            prev.map((row) => (row.id === calendarTargetSystem.id ? { ...row, last_security_check_at: next } : row))
          );
        }}
        onClose={() => {
          setCalendarOpen(false);
          setCalendarTarget(null);
        }}
      />
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
  stepText: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#6b7280",
    marginBottom: 6,
  },
  stepQuestion: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  helper: {
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
  balanceChoiceRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  balanceChoiceButton: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#e8eef1",
    alignItems: "center",
    justifyContent: "center",
  },
  balanceChoiceText: {
    color: "#444",
    fontWeight: "600",
    fontSize: 12,
    textAlign: "center",
  },
  balanceFieldWrap: {
    marginTop: 6,
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
  primary: {
    flex: 1,
    minHeight: 52,
    backgroundColor: "#16a34a",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 16,
    justifyContent: "center",
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
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    gap: 12,
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
  navSpacer: {
    flex: 1,
  },
  secondaryText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  errorText: {
    color: "#b00020",
    marginTop: 4,
    fontSize: 12,
  },
});

