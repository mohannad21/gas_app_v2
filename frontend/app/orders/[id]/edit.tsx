import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useCustomers } from "@/hooks/useCustomers";
import { useOrders, useUpdateOrder } from "@/hooks/useOrders";
import { useSystems } from "@/hooks/useSystems";
import type { GasType } from "@/types/domain";
import BigBox from "@/components/entry/BigBox";
import { FieldCell, type FieldStepper } from "@/components/entry/FieldPair";
import { calcCustomerCylinderDelta, calcMoneyUiResult } from "@/lib/ledgerMath";
import { formatBalanceTransitions, makeBalanceTransition } from "@/lib/balanceTransitions";
import { CUSTOMER_WORDING } from "@/lib/wording";

/**
 * 🔴 BACKEND CONTRACT (IMPORTANT)
 * Replace this with your real API / React Query hook later.
 */

type OrderFormValues = {
  customer_id: string;
  system_id: string;
  delivered_at: string;
  gas_type: GasType;
  cylinders_installed: string;
  cylinders_received: string;
  price_total: string;
  paid_amount: string;
  note?: string;
};

export default function EditOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<OrderFormValues>({
    defaultValues: {
      gas_type: "12kg",
      delivered_at: new Date().toISOString(),
      cylinders_installed: "1",
      cylinders_received: "1",
      price_total: "0",
      paid_amount: "0",
      customer_id: "",
      system_id: "",
      note: "",
    },
  });

  const ordersQuery = useOrders();
  const order = useMemo(
    () => (ordersQuery.data ?? []).find((o) => o.id === id),
    [ordersQuery.data, id]
  );

  const customersQuery = useCustomers();
  const selectedCustomer = watch("customer_id");

  const systemsQuery = useSystems(
    selectedCustomer || order?.customer_id
  );

  const systemOptions = useMemo(
    () => systemsQuery.data ?? [],
    [systemsQuery.data]
  );

  const selectedGas = watch("gas_type");
  const selectedCustomerEntry = useMemo(
    () => (customersQuery.data ?? []).find((c) => c.id === selectedCustomer),
    [customersQuery.data, selectedCustomer]
  );

  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const inputRefs = useRef<Record<string, TextInput | null>>({});

  const installed = Number(watch("cylinders_installed")) || 0;
  const received = Number(watch("cylinders_received")) || 0;
  const total = Number(watch("price_total")) || 0;
  const paid = Number(watch("paid_amount")) || 0;

  const diff = calcCustomerCylinderDelta("replacement", installed, received);
  const remaining = calcMoneyUiResult(total, paid);
  const cylinderBefore =
    selectedGas === "12kg"
      ? Number(selectedCustomerEntry?.cylinder_balance_12kg ?? 0)
      : Number(selectedCustomerEntry?.cylinder_balance_48kg ?? 0);
  const moneyBefore = Number(selectedCustomerEntry?.money_balance ?? 0);
  const cylinderAfter = cylinderBefore + diff;
  const moneyAfter = moneyBefore + remaining;
  const cylinderStatusLine = formatBalanceTransitions(
    [makeBalanceTransition("customer", selectedGas === "12kg" ? "cyl_12" : "cyl_48", cylinderBefore, cylinderAfter)],
    { mode: "transition", formatMoney: (value) => value.toFixed(0) }
  ).join("\n");
  const moneyStatusLine = formatBalanceTransitions(
    [makeBalanceTransition("customer", "money", moneyBefore, moneyAfter)],
    { mode: "transition", formatMoney: (value) => value.toFixed(0) }
  ).join("\n");
  const moneySteppers: FieldStepper[] = [
    { delta: 20, label: "+20", position: "top" },
    { delta: -5, label: "-5", position: "left" },
    { delta: 5, label: "+5", position: "right" },
    { delta: -20, label: "-20", position: "bottom" },
  ];

  const updateOrder = useUpdateOrder();

  /**
   * Load order into form ONCE
   */
  useEffect(() => {
    if (!order) return;

    reset({
      customer_id: order.customer_id,
      system_id: order.system_id,
      delivered_at: order.delivered_at,
      gas_type: order.gas_type,
      cylinders_installed: String(order.cylinders_installed),
      cylinders_received: String(order.cylinders_received),
      price_total: String(order.price_total),
      paid_amount: String(order.paid_amount),
      note: order.note ?? "",
    });
    if (order.cylinders_installed > 0) {
      setUnitPrice(order.price_total / order.cylinders_installed);
    }
  }, [order, reset]);


  /**
   * SUBMIT
   */
  const onSubmit = handleSubmit(
    async (values) => {
      if (!order) return;

      const totalValue = Number(values.price_total) || 0;
      const paidValue = Number(values.paid_amount) || 0;
      const overpay = paidValue - totalValue;
      const priorDebt = Math.max(selectedCustomerEntry?.money_balance ?? 0, 0);
      const paidEarlier = Math.min(Math.max(overpay, 0), priorDebt);
      const extraCredit = Math.max(overpay - paidEarlier, 0);

      const runUpdate = async () => {
        try {
          setSubmitting(true);

          await updateOrder.mutateAsync({
            id: order.id,
            payload: {
              customer_id: values.customer_id,
              system_id: values.system_id,
              delivered_at: values.delivered_at,
              gas_type: values.gas_type,
              cylinders_installed: Number(values.cylinders_installed),
              cylinders_received: Number(values.cylinders_received),
              price_total: totalValue,
              paid_amount: paidValue,
              note: values.note,
            },
          });

          Alert.alert("Order updated");
          router.back();
        } catch {
          Alert.alert("Error", "Failed to update order.");
        } finally {
          setSubmitting(false);
        }
      };

      if (overpay > 0) {
        const lines: string[] = [];
        if (paidEarlier > 0) {
          lines.push(`Includes $${paidEarlier} paid earlier`);
        }
        if (extraCredit > 0) {
          lines.push(`Creates $${extraCredit} extra credit`);
        }
        if (lines.length === 0) {
          lines.push(`Paid exceeds total by $${overpay}`);
        }
        Alert.alert("Overpayment", lines.join("\n"), [
          { text: "Cancel", style: "cancel" },
          { text: "Continue", onPress: () => void runUpdate() },
        ]);
        return;
      }

      await runUpdate();
    },
    (formErrors) => {
      const first = Object.keys(formErrors)[0];
      if (first) {
        inputRefs.current[first]?.focus?.();
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
    }
  );

  if (!order) {
    return (
      <View style={styles.center}>
        <Text>Order not found</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} ref={scrollRef}>
      <Text style={styles.title}>Edit Order</Text>

      {/* CUSTOMER */}
      <FieldLabel>Customer</FieldLabel>
      <Controller
        control={control}
        name="customer_id"
        rules={{ required: "Select a customer" }}
        render={({ field }) => (
          <View style={styles.chipRow}>
            {customersQuery.data?.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => field.onChange(c.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: field.value === c.id }}
                accessibilityLabel={`Customer ${c.name}`}
                accessibilityHint="Select customer"
                ref={(node) => {
                  if (node && field.value === c.id) inputRefs.current.customer_id = node as unknown as TextInput;
                }}
                style={[
                  styles.chip,
                  field.value === c.id && styles.chipActive,
                ]}
              >
                <Text>{c.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
      />
      <FieldError message={errors.customer_id?.message} />

      {/* SYSTEM */}
      <FieldLabel>System</FieldLabel>
      <Controller
        control={control}
        name="system_id"
        rules={{ required: "Select a system" }}
        render={({ field }) => (
          <View style={styles.chipRow}>
            {systemOptions.map((s) => (
              <Pressable
                key={s.id}
                disabled={s.is_active === false}
                onPress={() => field.onChange(s.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: field.value === s.id, disabled: s.is_active === false }}
                accessibilityLabel={`System ${s.name}`}
                accessibilityHint={s.is_active === false ? "System inactive" : "Select system"}
                ref={(node) => {
                  if (node && field.value === s.id) inputRefs.current.system_id = node as unknown as TextInput;
                }}
                style={[
                  styles.chip,
                  s.is_active === false && styles.chipInactive,
                  field.value === s.id && styles.chipActive,
                ]}
              >
                <Text>
                  {s.name}
                  {s.is_active === false ? " (inactive)" : ""}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      />
      <FieldError message={errors.system_id?.message} />

      <BigBox
        title={CUSTOMER_WORDING.cylinders}
        statusLine={cylinderStatusLine}
        statusIsAlert={cylinderAfter > 0}
        defaultExpanded
      >
        <View style={styles.entryFieldPair}>
          <Controller
            control={control}
            name="cylinders_installed"
            rules={{
              required: "Enter installed cylinders",
              validate: (val) =>
                (Number(val) || 0) > 0 || "Installed must be greater than zero",
            }}
            render={({ field }) => (
              <FieldCell
                title={CUSTOMER_WORDING.installed}
                value={Number(field.value) || 0}
                onIncrement={() => {
                  const next = Math.max((Number(field.value) || 0) + 1, 0);
                  field.onChange(String(next));
                  const nextTotal = next * unitPrice;
                  setValue("cylinders_received", String(next));
                  setValue("price_total", String(nextTotal));
                  setValue("paid_amount", String(nextTotal));
                }}
                onDecrement={() => {
                  const next = Math.max((Number(field.value) || 0) - 1, 0);
                  field.onChange(String(next));
                  const nextTotal = next * unitPrice;
                  setValue("cylinders_received", String(next));
                  setValue("price_total", String(nextTotal));
                  setValue("paid_amount", String(nextTotal));
                }}
                onChangeText={(text) => {
                  field.onChange(text);
                  const qty = Number(text) || 0;
                  const nextTotal = qty * unitPrice;
                  setValue("cylinders_received", String(qty));
                  setValue("price_total", String(nextTotal));
                  setValue("paid_amount", String(nextTotal));
                }}
                error={Boolean(errors.cylinders_installed)}
                inputRef={(node) => {
                  inputRefs.current.cylinders_installed = node;
                }}
              />
            )}
          />
          <Controller
            control={control}
            name="cylinders_received"
            rules={{
              required: "Enter received cylinders",
              validate: (val) =>
                (Number(val) || 0) >= 0 || "Received cannot be negative",
            }}
            render={({ field }) => (
              <FieldCell
                title={CUSTOMER_WORDING.received}
                value={Number(field.value) || 0}
                onIncrement={() => field.onChange(String(Math.max((Number(field.value) || 0) + 1, 0)))}
                onDecrement={() => field.onChange(String(Math.max((Number(field.value) || 0) - 1, 0)))}
                onChangeText={field.onChange}
                error={Boolean(errors.cylinders_received)}
                inputRef={(node) => {
                  inputRefs.current.cylinders_received = node;
                }}
              />
            )}
          />
        </View>
      </BigBox>
      <FieldError message={errors.cylinders_installed?.message} />
      <FieldError message={errors.cylinders_received?.message} />

      <BigBox
        title={CUSTOMER_WORDING.money}
        statusLine={moneyStatusLine}
        statusIsAlert={moneyAfter > 0}
        defaultExpanded
      >
        <View style={styles.entryFieldPair}>
          <Controller
            control={control}
            name="price_total"
            rules={{
              required: "Enter total price",
              validate: (val) =>
                (Number(val) || 0) >= 0 || "Total cannot be negative",
            }}
            render={({ field }) => (
              <FieldCell
                title={CUSTOMER_WORDING.total}
                value={Number(field.value) || 0}
                onIncrement={() => {
                  const next = Math.max((Number(field.value) || 0) + 5, 0);
                  field.onChange(String(next));
                  setValue("paid_amount", String(next));
                }}
                onDecrement={() => {
                  const next = Math.max((Number(field.value) || 0) - 5, 0);
                  field.onChange(String(next));
                  setValue("paid_amount", String(next));
                }}
                onChangeText={(text) => {
                  field.onChange(text);
                  setValue("paid_amount", text);
                }}
                steppers={moneySteppers}
                error={Boolean(errors.price_total)}
                inputRef={(node) => {
                  inputRefs.current.price_total = node;
                }}
              />
            )}
          />
          <Controller
            control={control}
            name="paid_amount"
            rules={{
              required: "Enter paid amount",
              validate: (val) =>
                (Number(val) || 0) >= 0 || "Paid cannot be negative",
            }}
            render={({ field }) => (
              <FieldCell
                title={CUSTOMER_WORDING.paid}
                value={Number(field.value) || 0}
                onIncrement={() => field.onChange(String(Math.max((Number(field.value) || 0) + 5, 0)))}
                onDecrement={() => field.onChange(String(Math.max((Number(field.value) || 0) - 5, 0)))}
                onChangeText={field.onChange}
                steppers={moneySteppers}
                error={Boolean(errors.paid_amount)}
                inputRef={(node) => {
                  inputRefs.current.paid_amount = node;
                }}
              />
            )}
          />
        </View>
      </BigBox>
      <FieldError message={errors.price_total?.message} />
      <FieldError message={errors.paid_amount?.message} />

      <BigBox title={CUSTOMER_WORDING.notes}>
        <Controller
          control={control}
          name="note"
          render={({ field }) => (
            <TextInput
              style={styles.input}
              value={field.value ?? ""}
              onChangeText={field.onChange}
              placeholder="Add a note"
              multiline
            />
          )}
        />
      </BigBox>

      <Pressable
        onPress={onSubmit}
        disabled={submitting}
        style={styles.primary}
      >
        <Text style={styles.primaryText}>
          {submitting ? "Saving..." : "Update Order"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <Text style={styles.errorText}>{message}</Text>;
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 8 },
  title: { fontSize: 24, fontWeight: "700" },
  label: { fontWeight: "700", marginTop: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { padding: 10, borderRadius: 12, backgroundColor: "#e8eef1" },
  chipActive: { backgroundColor: "#0a7ea4" },
  chipInactive: { opacity: 0.5 },
  input: { backgroundColor: "#fff", padding: 10, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "#ccc" },
  inputError: { borderColor: "#b00020" },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  meta: { color: "#666" },
  entryFieldPair: {
    flexDirection: "row",
    gap: 12,
  },
  primary: {
    backgroundColor: "#0a7ea4",
    padding: 14,
    borderRadius: 12,
    marginTop: 20,
  },
  primaryText: { color: "#fff", textAlign: "center", fontWeight: "700" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { color: "#b00020", marginTop: 2, fontSize: 12 },
});

