import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Alert, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import CustomerSystemsEditor, {
  createEmptyCustomerSystem,
  EditableCustomerSystem,
  systemRowHasData,
  systemRowIsComplete,
} from "@/components/CustomerSystemsEditor";
import { FieldCell, type FieldStepper } from "@/components/entry/FieldPair";
import { useCreateCustomerAdjustment, useCustomers, useUpdateCustomer } from "@/hooks/useCustomers";
import { useCreateSystem, useSystems, useUpdateSystem } from "@/hooks/useSystems";
import { useSystemTypes } from "@/hooks/useSystemTypes";


type BalanceState = "balanced" | "customer_owes" | "you_owe";

type CustomerFormValues = {
  name: string;
  phone?: string;
  address?: string;
  note?: string;
  balance_money_state: BalanceState;
  balance_money_amount: number;
  balance_12kg_state: BalanceState;
  balance_12kg_amount: number;
  balance_48kg_state: BalanceState;
  balance_48kg_amount: number;
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

export default function EditCustomerScreen() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const customersQuery = useCustomers();
  const customer = useMemo(() => (customersQuery.data ?? []).find((c) => c.id === id), [customersQuery.data, id]);
  const systemsQuery = useSystems(id, { enabled: !!id });
  const systemTypesQuery = useSystemTypes();
  const [activeTab, setActiveTab] = useState<"personal" | "balances" | "systems">("personal");
  const [systems, setSystems] = useState<EditableCustomerSystem[]>([createEmptyCustomerSystem()]);

  const { control, handleSubmit, reset, setValue, watch } = useForm<CustomerFormValues>({
    defaultValues: {
      name: "",
      phone: "",
      address: "",
      note: "",
      balance_money_state: "balanced",
      balance_money_amount: 0,
      balance_12kg_state: "balanced",
      balance_12kg_amount: 0,
      balance_48kg_state: "balanced",
      balance_48kg_amount: 0,
    },
  });
  const updateCustomer = useUpdateCustomer();
  const createAdjustment = useCreateCustomerAdjustment({ showToast: false });
  const createSystem = useCreateSystem();
  const updateSystem = useUpdateSystem();
  const [submitting, setSubmitting] = useState(false);
  const moneyState = watch("balance_money_state");
  const cyl12State = watch("balance_12kg_state");
  const cyl48State = watch("balance_48kg_state");
  const typeOptions = useMemo(
    () => (systemTypesQuery.data ?? []).filter((t) => t.is_active !== false),
    [systemTypesQuery.data]
  );

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
  const deriveBalance = (value: number) => {
    if (value > 0) return { state: "customer_owes" as BalanceState, amount: Math.abs(value) };
    if (value < 0) return { state: "you_owe" as BalanceState, amount: Math.abs(value) };
    return { state: "balanced" as BalanceState, amount: 0 };
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
  const renderBalanceAmountField = (
    fieldName: "balance_money_amount" | "balance_12kg_amount" | "balance_48kg_amount",
    steppers: FieldStepper[]
  ) => (
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
  );
  const hasIncompleteSystem = systems.some((system) => !systemRowIsComplete(system));

  useEffect(() => {
    if (!customer) return;
    const moneyBalance = deriveBalance(customer.money_balance || 0);
    const cyl12Balance = deriveBalance(customer.cylinder_balance_12kg || 0);
    const cyl48Balance = deriveBalance(customer.cylinder_balance_48kg || 0);
    reset({
      name: customer.name,
      phone: customer.phone ?? "",
      address: customer.address ?? "",
      note: customer.note ?? "",
      balance_money_state: moneyBalance.state,
      balance_money_amount: moneyBalance.amount,
      balance_12kg_state: cyl12Balance.state,
      balance_12kg_amount: cyl12Balance.amount,
      balance_48kg_state: cyl48Balance.state,
      balance_48kg_amount: cyl48Balance.amount,
    });
  }, [customer, reset]);

  useEffect(() => {
    if (tab === "personal" || tab === "balances" || tab === "systems") {
      setActiveTab(tab);
    }
  }, [tab]);

  useEffect(() => {
    if (systemsQuery.isLoading) return;
    const nextSystems =
      systemsQuery.data && systemsQuery.data.length > 0
        ? Array.from(new Map(systemsQuery.data.map((sys) => [sys.id, sys])).values()).map((sys) => ({
            id: `sys_${sys.id}`,
            persistedId: sys.id,
            name: sys.name,
            gas_type: sys.gas_type,
            requires_security_check: sys.requires_security_check ?? null,
            security_check_exists: sys.security_check_exists ?? null,
            last_security_check_at: sys.last_security_check_at ?? "",
          }))
        : [createEmptyCustomerSystem()];
    setSystems(nextSystems);
  }, [systemsQuery.data, systemsQuery.isLoading]);

  const onSubmit = handleSubmit(async (values) => {
    if (!customer) return;
    try {
      if (hasIncompleteSystem) {
        Alert.alert("Incomplete system", "Finish the system details or leave the row blank before saving.");
        return;
      }
      setSubmitting(true);
      await updateCustomer.mutateAsync({
        id: customer.id,
        payload: {
          name: values.name,
          phone: values.phone?.trim() ? values.phone.trim() : undefined,
          address: values.address?.trim() ? values.address.trim() : undefined,
          note: values.note,
        },
      });
      const desiredMoney = resolveSignedAmount(values.balance_money_state, values.balance_money_amount);
      const desired12 = resolveSignedCount(values.balance_12kg_state, values.balance_12kg_amount);
      const desired48 = resolveSignedCount(values.balance_48kg_state, values.balance_48kg_amount);
      const currentMoney = Number(customer.money_balance || 0);
      const current12 = Number(customer.cylinder_balance_12kg || 0);
      const current48 = Number(customer.cylinder_balance_48kg || 0);
      const moneyDelta = desiredMoney - currentMoney;
      const cyl12Delta = desired12 - current12;
      const cyl48Delta = desired48 - current48;
      if (moneyDelta !== 0 || cyl12Delta !== 0 || cyl48Delta !== 0) {
        const payload: {
          customer_id: string;
          amount_money?: number;
          count_12kg?: number;
          count_48kg?: number;
          reason: string;
        } = {
          customer_id: customer.id,
          reason: "Balance update (Edit Customer)",
        };
        if (moneyDelta !== 0) payload.amount_money = moneyDelta;
        if (cyl12Delta !== 0) payload.count_12kg = cyl12Delta;
        if (cyl48Delta !== 0) payload.count_48kg = cyl48Delta;
        await createAdjustment.mutateAsync(payload);
      }
      for (const sys of systems) {
        if (!systemRowHasData(sys)) continue;
        const payload = {
          name: sys.name.trim(),
          gas_type: sys.gas_type!,
          requires_security_check: sys.requires_security_check!,
          security_check_exists: sys.requires_security_check ? sys.security_check_exists ?? false : false,
          last_security_check_at:
            sys.requires_security_check && sys.security_check_exists && sys.last_security_check_at
              ? sys.last_security_check_at
              : undefined,
          is_active: true,
        };
        if (sys.persistedId) {
          await updateSystem.mutateAsync({ id: sys.persistedId, payload });
        } else {
          await createSystem.mutateAsync({ customer_id: customer.id, ...payload });
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

  if (customersQuery.isLoading) {
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

      <View style={styles.tabs}>
        {(
          [
            { id: "personal", label: "Personal info" },
            { id: "balances", label: "Balances" },
            { id: "systems", label: "Systems" },
          ] as const
        ).map((tab) => (
          <Pressable
            key={tab.id}
            onPress={() => setActiveTab(tab.id)}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "personal" ? (
        <>
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

          <FieldLabel>Address</FieldLabel>
          <Controller
            control={control}
            name="address"
            render={({ field: { onChange, value } }) => (
              <TextInput style={styles.input} placeholder="Address" value={value} onChangeText={onChange} />
            )}
          />

          <FieldLabel>Note</FieldLabel>
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

      {activeTab === "balances" ? (
        <>
          <Text style={styles.sectionTitle}>Balances</Text>
          <Text style={styles.balanceNote}>
            Positive = debts on customer. Negative = credit for customer.
          </Text>

          <FieldLabel>Money balance</FieldLabel>
          <Controller
            control={control}
            name="balance_money_state"
            render={({ field: { value, onChange } }) => (
              <View style={styles.balanceChoiceRow}>
                {balanceOptions.map((option) => (
                  <Pressable
                    key={option.id}
                    onPress={() => {
                      onChange(option.id);
                      if (option.id === "balanced") {
                        setValue("balance_money_amount", 0);
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
          {moneyState !== "balanced" ? renderBalanceAmountField("balance_money_amount", CUSTOMER_MONEY_STEPPERS) : null}

          <FieldLabel>12kg balance</FieldLabel>
          <Controller
            control={control}
            name="balance_12kg_state"
            render={({ field: { value, onChange } }) => (
              <View style={styles.balanceChoiceRow}>
                {balanceOptions.map((option) => (
                  <Pressable
                    key={option.id}
                    onPress={() => {
                      onChange(option.id);
                      if (option.id === "balanced") {
                        setValue("balance_12kg_amount", 0);
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
          {cyl12State !== "balanced" ? renderBalanceAmountField("balance_12kg_amount", CUSTOMER_CYLINDER_STEPPERS) : null}

          <FieldLabel>48kg balance</FieldLabel>
          <Controller
            control={control}
            name="balance_48kg_state"
            render={({ field: { value, onChange } }) => (
              <View style={styles.balanceChoiceRow}>
                {balanceOptions.map((option) => (
                  <Pressable
                    key={option.id}
                    onPress={() => {
                      onChange(option.id);
                      if (option.id === "balanced") {
                        setValue("balance_48kg_amount", 0);
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
          {cyl48State !== "balanced" ? renderBalanceAmountField("balance_48kg_amount", CUSTOMER_CYLINDER_STEPPERS) : null}
        </>
      ) : null}

      {activeTab === "systems" ? (
        <>
          <Text style={styles.sectionTitle}>Systems</Text>
          {systemsQuery.isLoading ? <Text style={styles.meta}>Loading systems...</Text> : null}
          <CustomerSystemsEditor systems={systems} onChange={setSystems} typeOptions={typeOptions} />
        </>
      ) : null}

      <Pressable
        onPress={onSubmit}
        style={({ pressed }) => [
          styles.primary,
          pressed && styles.pressed,
          (submitting || hasIncompleteSystem) && styles.disabledButton,
        ]}
        disabled={submitting || hasIncompleteSystem}
      >
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 8,
  },
  balanceNote: {
    color: "#64748b",
    fontSize: 12,
    marginBottom: 4,
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
  tabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#e8eef1",
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "#0a7ea4",
  },
  tabText: {
    color: "#1f2937",
    fontWeight: "700",
  },
  tabTextActive: {
    color: "#fff",
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
  secondaryBtn: {
    backgroundColor: "#e8eef1",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  secondaryText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.9,
  },
  disabledButton: {
    opacity: 0.6,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

