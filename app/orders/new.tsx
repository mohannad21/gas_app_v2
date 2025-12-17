import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useCustomers } from "@/hooks/useCustomers";
import { useCreateOrder } from "@/hooks/useOrders";
import { useInventoryLatest, useInitInventory } from "@/hooks/useInventory";
import { usePriceSettings } from "@/hooks/usePrices";
import { useSystems } from "@/hooks/useSystems";
import { CustomerType, GasType } from "@/types/domain";

type OrderFormValues = {
  customer_id: string;
  system_id: string;
  delivered_at: string;
  gas_type: GasType | "";
  cylinders_installed: string;
  cylinders_received: string;
  price_total: string;
  paid_amount: string;
  note?: string;
};

export default function NewOrderScreen() {
  const { customerId } = useLocalSearchParams<{ customerId?: string }>();

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<OrderFormValues>({
    defaultValues: {
      gas_type: "",
      delivered_at: new Date().toISOString(),
      cylinders_installed: "",
      cylinders_received: "",
      price_total: "",
      paid_amount: "",
      customer_id: "",
      system_id: "",
      note: "",
    },
  });

  const selectedCustomer = watch("customer_id");
  const selectedSystemId = watch("system_id");
  const selectedGas = watch("gas_type");

  const customersQuery = useCustomers();
  const inventoryLatest = useInventoryLatest();
  const systemsQuery = useSystems(selectedCustomer);
  const pricesQuery = usePriceSettings();
  const createOrder = useCreateOrder();
  const initInventory = useInitInventory();

  const [submitting, setSubmitting] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [manualPrice, setManualPrice] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const inputRefs = useRef<Record<string, TextInput | null>>({});

  const installed = Number(watch("cylinders_installed")) || 0;
  const inventoryInitBlocked = inventoryLatest.data === null;
  const inventoryPromptedRef = useRef(false);
  const [initModalVisible, setInitModalVisible] = useState(false);
  const [initCounts, setInitCounts] = useState({
    full12: "",
    empty12: "",
    full48: "",
    empty48: "",
  });

  /* -------------------- derived -------------------- */

  const customerOptions = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    const list = customersQuery.data ?? [];
    if (!term) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.notes ?? "").toLowerCase().includes(term)
    );
  }, [customersQuery.data, customerSearch]);

  const systemOptions = useMemo(
    () => systemsQuery.data ?? [],
    [systemsQuery.data]
  );

  const selectedSystem = useMemo(
    () => systemOptions.find((s) => s.id === selectedSystemId),
    [systemOptions, selectedSystemId]
  );
  const previousCustomerRef = useRef<string | undefined>();

  useEffect(() => {
    if (previousCustomerRef.current === selectedCustomer) {
      return;
    }
    previousCustomerRef.current = selectedCustomer;
    setValue("system_id", "");
    setValue("gas_type", "");
    setValue("cylinders_installed", "");
    setValue("cylinders_received", "");
    setValue("price_total", "");
    setValue("paid_amount", "");
    setManualPrice(false);
  }, [selectedCustomer, setValue]);

  useEffect(() => {
    if (!selectedCustomer) {
      return;
    }
    if (systemOptions.length === 1 && !selectedSystemId) {
      setValue("system_id", systemOptions[0].id);
    }
  }, [selectedCustomer, systemOptions, selectedSystemId, setValue]);

  /* -------------------- pricing -------------------- */

  const unitPrice = useMemo(() => {
    const customer = customersQuery.data?.find(
      (c) => c.id === selectedCustomer
    );

    const systemCustomerType = selectedSystem?.system_customer_type;
    let resolvedType: CustomerType | undefined;
    if (systemCustomerType === "private") {
      resolvedType = "private";
    } else if (
      systemCustomerType === "industrial" ||
      systemCustomerType === "commercial"
    ) {
      resolvedType = "industrial";
    } else {
      resolvedType = undefined;
    }

    const customerType = resolvedType ?? customer?.customer_type ?? "any";

    const prices = pricesQuery.data ?? [];

    const match = prices
      .filter(
        (p) =>
          p.gas_type === selectedGas &&
          (p.customer_type === "any" || p.customer_type === customerType)
      )
      .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];

    return match?.selling_price ?? 0;
  }, [
    customersQuery.data,
    pricesQuery.data,
    selectedCustomer,
    selectedGas,
    selectedSystem?.system_customer_type,
  ]);

  /* -------------------- effects -------------------- */

  useEffect(() => {
    if (customerId && !selectedCustomer) {
      setValue("customer_id", customerId);
    }
  }, [customerId, selectedCustomer, setValue]);

  useEffect(() => {
    if (inventoryPromptedRef.current) return;
    if (customersQuery.isLoading || inventoryLatest.isLoading) return;
    if (inventoryInitBlocked) {
      inventoryPromptedRef.current = true;
      setInitModalVisible(true);
    }
  }, [customersQuery.isLoading, inventoryLatest.isLoading, inventoryInitBlocked]);

  // System selection sets defaults ONCE
  useEffect(() => {
    if (!selectedSystem) return;

    setValue("gas_type", selectedSystem.gas_type ?? "12kg");
    setValue("cylinders_installed", "1");
    setValue("cylinders_received", "1");

    const total = unitPrice;
    setValue("price_total", String(total));
    setValue("paid_amount", String(total));
    setManualPrice(false);
  }, [selectedSystem, unitPrice, setValue]);

  // Installed drives total + paid (unless manually overridden)
  useEffect(() => {
    if (manualPrice) return;
    if (installed <= 0) return;

    const total = installed * unitPrice;
    setValue("price_total", String(total));
    setValue("paid_amount", String(total));
  }, [installed, unitPrice, manualPrice, setValue]);

  /* -------------------- submit -------------------- */

  const onSubmit = handleSubmit(
    async (values) => {
      try {
        if (inventoryInitBlocked) {
          Alert.alert(
            "Initialize inventory",
            "Please add your initial inventory before creating the first order.",
            [
              {
                text: "Open inventory setup",
                onPress: () => setInitModalVisible(true),
              },
            ]
          );
          return;
        }
        setSubmitting(true);

        await createOrder.mutateAsync({
          customer_id: values.customer_id,
          system_id: values.system_id,
          delivered_at: values.delivered_at,
          gas_type: values.gas_type,
          cylinders_installed: Number(values.cylinders_installed) || 0,
          cylinders_received: Number(values.cylinders_received) || 0,
          price_total: Number(values.price_total) || 0,
          paid_amount: Number(values.paid_amount) || 0,
          note: values.note,
        });

      router.replace({ pathname: "/", params: { flash: "order-created" } });
      } catch {
        Alert.alert("Error", "Failed to create order.");
      } finally {
        setSubmitting(false);
      }
    },
    (formErrors) => {
      const first = Object.keys(formErrors)[0];
      if (first) {
        inputRefs.current[first]?.focus?.();
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
    }
  );

  /* -------------------- UI -------------------- */

  return (
    <ScrollView contentContainerStyle={styles.container} ref={scrollRef}>
      <Text style={styles.title}>Add Order</Text>
      {inventoryInitBlocked && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Inventory not initialized. Set starting counts to add your first order.</Text>
          <Pressable onPress={() => setInitModalVisible(true)} style={styles.noticeButton}>
            <Text style={styles.noticeButtonText}>Initialize inventory</Text>
          </Pressable>
        </View>
      )}

      <FieldLabel>Customer</FieldLabel>
      <TextInput
        style={styles.input}
        placeholder="Search customer"
        value={customerSearch}
        onChangeText={setCustomerSearch}
      />

      <Controller
        control={control}
        name="customer_id"
        rules={{ required: "Select a customer" }}
        render={({ field: { onChange, value } }) => (
          <View style={styles.chipRow}>
            {customerOptions.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => onChange(c.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: value === c.id }}
                accessibilityLabel={`Customer ${c.name}`}
                accessibilityHint="Select customer"
                ref={(node) => {
                  if (node && value === c.id) inputRefs.current.customer_id = node as unknown as TextInput;
                }}
                style={[styles.chip, value === c.id && styles.chipActive]}
              >
                <Text
                  style={[
                    styles.chipText,
                    value === c.id && styles.chipTextActive,
                  ]}
                >
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      />
      <FieldError message={errors.customer_id?.message} />

      <FieldLabel>System</FieldLabel>
      <Controller
        control={control}
        name="system_id"
        rules={{ required: "Select a system" }}
        render={({ field: { onChange, value } }) => (
          <View style={styles.chipRow}>
            {systemOptions.map((s) => (
                <Pressable
                key={s.id}
                disabled={!s.is_active}
                onPress={() => s.is_active && onChange(s.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: value === s.id, disabled: !s.is_active }}
                accessibilityLabel={`System ${s.name}`}
                accessibilityHint={s.is_active ? "Select system" : "System inactive"}
                ref={(node) => {
                  if (node && value === s.id) inputRefs.current.system_id = node as unknown as TextInput;
                }}
                style={[
                  styles.chip,
                  !s.is_active && styles.chipInactive,
                  value === s.id && styles.chipActive,
                ]}
              >
                <Text>{s.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
      />
      <FieldError message={errors.system_id?.message} />

      <FieldLabel>Gas Type</FieldLabel>
      <Controller
        control={control}
        name="gas_type"
        rules={{ required: "Pick a gas type" }}
        render={({ field: { onChange, value } }) => (
          <View style={styles.chipRow}>
            {(["12kg", "48kg"] as GasType[]).map((g) => (
              <Pressable
                key={g}
                onPress={() => onChange(g)}
                accessibilityRole="button"
                accessibilityState={{ selected: value === g }}
                accessibilityLabel={`Gas type ${g}`}
                accessibilityHint="Select gas type"
                ref={(node) => {
                  if (node && value === g) inputRefs.current.gas_type = node as unknown as TextInput;
                }}
                style={[styles.chip, value === g && styles.chipActive]}
              >
                <Text
                  style={[
                    styles.chipText,
                    value === g && styles.chipTextActive,
                  ]}
                >
                  {g}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      />
      <FieldError message={errors.gas_type?.message} />

      <FieldLabel>Delivery (date & time)</FieldLabel>
      <Controller
        control={control}
        name="delivered_at"
        rules={{ required: "Enter delivery date & time" }}
        render={({ field }) => (
          <TextInput
            style={[styles.input, errors.delivered_at && styles.inputError]}
            accessibilityLabel="Delivery date and time"
            accessibilityHint="Enter ISO date with time, e.g. 2025-12-15T18:30:00Z"
            placeholder="2025-12-15T18:30:00Z"
            value={field.value}
            onChangeText={field.onChange}
            ref={(node) => (inputRefs.current.delivered_at = node)}
          />
        )}
      />
      <FieldError message={errors.delivered_at?.message} />

      <FieldLabel>Installed / Received</FieldLabel>
      <View style={styles.row}>
        <Controller
          control={control}
          name="cylinders_installed"
          rules={{
            required: "Enter installed cylinders",
            validate: (val) =>
              (Number(val) || 0) > 0 || "Installed must be greater than zero",
          }}
          render={({ field }) => (
            <TextInput
              style={[
                styles.input,
                styles.half,
                errors.cylinders_installed && styles.inputError,
              ]}
              accessibilityLabel="Installed cylinders"
              accessibilityHint="Enter number of cylinders installed"
              keyboardType="numeric"
              placeholder="Installed"
              value={field.value}
              ref={(node) => (inputRefs.current.cylinders_installed = node)}
              onChangeText={(t) => {
                field.onChange(t);
                setValue("cylinders_received", t);
                setManualPrice(false);
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
            <TextInput
              style={[
                styles.input,
                styles.half,
                errors.cylinders_received && styles.inputError,
              ]}
              accessibilityLabel="Received cylinders"
              accessibilityHint="Enter number of cylinders received"
              keyboardType="numeric"
              placeholder="Received"
              value={field.value}
              ref={(node) => (inputRefs.current.cylinders_received = node)}
              onChangeText={field.onChange}
            />
          )}
        />
      </View>
      <FieldError message={errors.cylinders_installed?.message} />
      <FieldError message={errors.cylinders_received?.message} />

      <FieldLabel>Total / Paid</FieldLabel>
      <View style={styles.row}>
        <Controller
          control={control}
          name="price_total"
          rules={{
            required: "Enter total price",
            validate: (val) =>
              (Number(val) || 0) >= 0 || "Total cannot be negative",
          }}
          render={({ field }) => (
            <TextInput
              style={[
                styles.input,
                styles.half,
                errors.price_total && styles.inputError,
              ]}
              accessibilityLabel="Total price"
              accessibilityHint="Enter total price"
              keyboardType="numeric"
              placeholder="Total"
              value={field.value}
              ref={(node) => (inputRefs.current.price_total = node)}
              onChangeText={(t) => {
                setManualPrice(true);
                field.onChange(t);
                setValue("paid_amount", t);
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
            <TextInput
              style={[
                styles.input,
                styles.half,
                errors.paid_amount && styles.inputError,
              ]}
              accessibilityLabel="Paid amount"
              accessibilityHint="Enter amount paid"
              keyboardType="numeric"
              placeholder="Paid"
              value={field.value}
              ref={(node) => (inputRefs.current.paid_amount = node)}
              onChangeText={(t) => {
                setManualPrice(true);
                field.onChange(t);
              }}
            />
          )}
        />
      </View>
      <FieldError message={errors.price_total?.message} />
      <FieldError message={errors.paid_amount?.message} />

      <Pressable
        onPress={onSubmit}
        disabled={submitting}
        style={styles.primary}
      >
        <Text style={styles.primaryText}>
          {submitting ? "Saving..." : "Save Order"}
        </Text>
      </Pressable>

      <Modal visible={initModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Initialize inventory</Text>
            <Text style={styles.orderMeta}>Enter starting counts for each cylinder size.</Text>
            <View style={styles.row}>
              <View style={styles.half}>
                <FieldLabel>12kg Full</FieldLabel>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="0"
                  value={initCounts.full12}
                  onChangeText={(t) => setInitCounts((s) => ({ ...s, full12: t }))}
                />
              </View>
              <View style={styles.half}>
                <FieldLabel>12kg Empty</FieldLabel>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="0"
                  value={initCounts.empty12}
                  onChangeText={(t) => setInitCounts((s) => ({ ...s, empty12: t }))}
                />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.half}>
                <FieldLabel>48kg Full</FieldLabel>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="0"
                  value={initCounts.full48}
                  onChangeText={(t) => setInitCounts((s) => ({ ...s, full48: t }))}
                />
              </View>
              <View style={styles.half}>
                <FieldLabel>48kg Empty</FieldLabel>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="0"
                  value={initCounts.empty48}
                  onChangeText={(t) => setInitCounts((s) => ({ ...s, empty48: t }))}
                />
              </View>
            </View>
            <View style={styles.row}>
              <Pressable
                style={[styles.secondaryButton, { flex: 1 }]}
                onPress={() => setInitModalVisible(false)}
                disabled={initInventory.isPending}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.primary, { flex: 1, marginTop: 0 }]}
                disabled={initInventory.isPending}
                onPress={async () => {
                  const payload = {
                    full12: Number(initCounts.full12) || 0,
                    empty12: Number(initCounts.empty12) || 0,
                    full48: Number(initCounts.full48) || 0,
                    empty48: Number(initCounts.empty48) || 0,
                    reason: "initial",
                  };
                  await initInventory.mutateAsync(payload);
                  setInitModalVisible(false);
                }}
              >
                <Text style={styles.primaryText}>
                  {initInventory.isPending ? "Saving..." : "Save inventory"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  chipInactive: { opacity: 0.4 },
  chipText: { fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ccc",
  },
  inputError: {
    borderColor: "#b00020",
  },
  errorText: {
    color: "#b00020",
    marginTop: 2,
    fontSize: 12,
  },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  primary: {
    backgroundColor: "#0a7ea4",
    padding: 14,
    borderRadius: 12,
    marginTop: 16,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700" },
  notice: {
    backgroundColor: "#fff7e6",
    borderColor: "#f0c36d",
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
    gap: 8,
    marginTop: 10,
  },
  noticeText: { color: "#8a5b00" },
  noticeButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#0a7ea4",
    borderRadius: 8,
  },
  noticeButtonText: { color: "#fff", fontWeight: "700" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  secondaryButton: {
    borderColor: "#ccc",
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
    alignItems: "center",
  },
  secondaryButtonText: { fontWeight: "700", color: "#333" },
});
