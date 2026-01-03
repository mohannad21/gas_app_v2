import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  Alert,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AxiosError } from "axios";

import { useCustomers } from "@/hooks/useCustomers";
import { useCreateOrder } from "@/hooks/useOrders";
import { useInventoryLatest, useInitInventory } from "@/hooks/useInventory";
import { usePriceSettings } from "@/hooks/usePrices";
import { useSystems } from "@/hooks/useSystems";
import { getOrderWhatsappLink } from "@/lib/api";
import { CustomerType, GasType, OrderCreateInput } from "@/types/domain";
import { gasColor } from "@/constants/gas";

type OrderFormValues = {
  customer_id: string;
  system_id: string;
  delivered_at: string;
  gas_type: GasType | "";
  cylinders_installed: string;
  cylinders_received: string;
  price_total: string;
  money_received: string;
  money_given: string;
  note?: string;
};

export default function NewOrderScreen() {
  const { customerId, systemId } = useLocalSearchParams<{
    customerId?: string | string[];
    systemId?: string | string[];
  }>();
  const initialCustomerId = Array.isArray(customerId) ? customerId[0] : customerId;
  const initialSystemId = Array.isArray(systemId) ? systemId[0] : systemId;

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
      money_received: "",
      money_given: "",
      customer_id: "",
      system_id: "",
      note: "",
    },
  });

  const selectedCustomer = watch("customer_id");
  const selectedSystemId = watch("system_id");
  const selectedGas = watch("gas_type");
  const deliveredAtValue = watch("delivered_at");

  const customersQuery = useCustomers();
  const inventoryLatest = useInventoryLatest();
  const systemsQuery = useSystems(selectedCustomer, { enabled: !!selectedCustomer });
  const pricesQuery = usePriceSettings();
  const pricesConfigured = (pricesQuery.data ?? []).length > 0;
  const createOrder = useCreateOrder();
  const initInventory = useInitInventory();

  const [submitting, setSubmitting] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [manualPrice, setManualPrice] = useState(false);
  const [whatsappOrderId, setWhatsappOrderId] = useState<string | null>(null);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [whatsappBusy, setWhatsappBusy] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const inputRefs = useRef<Record<string, TextInput | null>>({});
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [scrollViewHeight, setScrollViewHeight] = useState(0);
  const [focusTarget, setFocusTarget] = useState<"amounts" | "payments" | null>(null);
  const [amountsLayoutY, setAmountsLayoutY] = useState<number | null>(null);
  const [totalsLayout, setTotalsLayout] = useState<{ y: number; height: number } | null>(null);
  const showStickyPayment = focusTarget === "amounts" && keyboardHeight > 0;
  const [deliveryDateOpen, setDeliveryDateOpen] = useState(false);
  const [deliveryTimeOpen, setDeliveryTimeOpen] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });
  const [deliveryTime, setDeliveryTime] = useState(() => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  });

  const installed = Number(watch("cylinders_installed")) || 0;
  const received = Number(watch("cylinders_received")) || 0;
  const totalAmount = Number(watch("price_total")) || 0;
  const moneyReceived = Number(watch("money_received")) || 0;
  const moneyGiven = 0;
  const grossPaid = moneyReceived - moneyGiven;
  const missing = Math.max(0, installed - received);
  const unpaid = totalAmount - grossPaid;
  const inventoryInitBlocked = inventoryLatest.data === null;
  const inventoryPromptedRef = useRef(false);
  const [initModalVisible, setInitModalVisible] = useState(false);
  const [initCounts, setInitCounts] = useState({
    full12: "",
    empty12: "",
    full48: "",
    empty48: "",
  });
  const [initDateOpen, setInitDateOpen] = useState(false);
  const [initDate, setInitDate] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });
  const initAccessoryId = Platform.OS === "ios" ? "initInventoryAccessory" : undefined;

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
  const selectedCustomerEntry = useMemo(
    () => (customersQuery.data ?? []).find((c) => c.id === selectedCustomer),
    [customersQuery.data, selectedCustomer]
  );
  const balanceBefore = selectedCustomerEntry?.money_balance ?? 0;
  const balanceAfter = balanceBefore + unpaid;
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
    setValue("money_received", "");
    setValue("money_given", "");
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
      systemCustomerType === "industrial"
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
    if (initialCustomerId && !selectedCustomer) {
      setValue("customer_id", initialCustomerId);
    }
  }, [initialCustomerId, selectedCustomer, setValue]);

  useEffect(() => {
    if (!initialSystemId || !selectedCustomer) return;
    if (selectedSystemId) return;
    const exists = systemOptions.some((s) => s.id === initialSystemId);
    if (exists) {
      setValue("system_id", initialSystemId);
    }
  }, [initialSystemId, selectedCustomer, selectedSystemId, systemOptions, setValue]);

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
    setValue("money_received", String(total));
    setValue("money_given", "0");
    setManualPrice(false);
  }, [selectedSystem, unitPrice, setValue]);

  // Installed drives total + payment (unless manually overridden)
  useEffect(() => {
    if (manualPrice) return;
    if (installed <= 0) return;

    const total = installed * unitPrice;
    setValue("price_total", String(total));
    setValue("money_received", String(total));
    setValue("money_given", "0");
  }, [installed, unitPrice, manualPrice, setValue]);

  useEffect(() => {
    const [year, month, day] = deliveryDate.split("-").map((part) => Number(part));
    const [hour, minute] = deliveryTime.split(":").map((part) => Number(part));
    if (!year || !month || !day) return;
    const next = new Date(year, month - 1, day, hour || 0, minute || 0);
    setValue("delivered_at", next.toISOString());
  }, [deliveryDate, deliveryTime, setValue]);

  useEffect(() => {
    if (!selectedCustomer || !selectedSystemId || !selectedGas) return;
    setValue("money_given", "0");
  }, [selectedCustomer, selectedSystemId, selectedGas, setValue]);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  useEffect(() => {
    if (focusTarget !== "amounts" || keyboardHeight <= 0) return;
    const timer = setTimeout(() => {
      scrollToAmountsAndTotals();
    }, 60);
    return () => clearTimeout(timer);
  }, [focusTarget, keyboardHeight, scrollViewHeight, amountsLayoutY, totalsLayout]);

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

        if (!pricesConfigured) {
          Alert.alert(
            "Set prices first",
            "Selling prices are not configured yet. Please add prices before creating orders.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Set prices",
                onPress: () => router.push("/add?prices=1"),
              },
            ]
          );
          return;
        }

        if (!values.gas_type) {
          Alert.alert("Missing gas type", "Please select a gas type.");
          return;
        }
        const gasType = values.gas_type as GasType;
        const total = Number(values.price_total) || 0;
        const paid = Number(values.money_received) || 0;
        const result = total - paid;
        const balanceBeforeValue = selectedCustomerEntry?.money_balance ?? 0;
        const balanceAfterValue = balanceBeforeValue + result;
        const balanceStatus = balanceAfterValue < 0 ? "Credit" : balanceAfterValue > 0 ? "Debt" : "Settled";
        const cylDelta = (Number(values.cylinders_installed) || 0) - (Number(values.cylinders_received) || 0);
        const balanceBeforeCyl =
          gasType === "12kg"
            ? selectedCustomerEntry?.cylinder_balance_12kg ?? 0
            : selectedCustomerEntry?.cylinder_balance_48kg ?? 0;
        const balanceAfterCyl = balanceBeforeCyl + cylDelta;
        const alertLines: string[] = [];
        if (balanceAfterValue !== 0) {
          if (balanceAfterValue > 0) {
            alertLines.push(`Money: Customer must pay ${Math.abs(balanceAfterValue).toFixed(0)}`);
          } else {
            alertLines.push(`Money: Customer must get ${Math.abs(balanceAfterValue).toFixed(0)}`);
          }
        }
        if (balanceAfterCyl !== 0) {
          if (balanceAfterCyl > 0) {
            alertLines.push(`Cylinders: Customer must return ${Math.abs(balanceAfterCyl)} empty`);
          } else {
            alertLines.push(`Cylinders: Customer must get ${Math.abs(balanceAfterCyl)} empty`);
          }
        }
        const alertMessage = alertLines.length > 0 ? alertLines.join("\n") : "All settled.";

        const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const orderPayload: OrderCreateInput = {
          customer_id: values.customer_id,
          system_id: values.system_id,
          delivered_at: values.delivered_at,
          gas_type: gasType,
          cylinders_installed: Number(values.cylinders_installed) || 0,
          cylinders_received: Number(values.cylinders_received) || 0,
          price_total: total,
          money_received: paid,
          money_given: 0,
          note: values.note,
          client_request_id: requestId,
        };

        const finalizeCreate = async () => {
          setSubmitting(true);
          try {
            const created = await createOrder.mutateAsync(orderPayload);
            setWhatsappOrderId(created.id);
            setWhatsappOpen(true);
          } finally {
            setSubmitting(false);
          }
        };

        if (balanceAfterValue !== 0 || balanceAfterCyl !== 0) {
          const moneyLine = `Money balance (before + this order = after): ${balanceBeforeValue.toFixed(
            0
          )} + ${result.toFixed(0)} = ${balanceAfterValue.toFixed(0)}`;
          const cylLine = `Cylinder balance (before + this order = after): ${balanceBeforeCyl.toFixed(
            0
          )} + ${cylDelta.toFixed(0)} = ${balanceAfterCyl.toFixed(0)}`;
          Alert.alert(
            "🔴 Confirm settlement",
            `${alertMessage}\n\n${moneyLine}\n${cylLine}\n\nResulting ${balanceStatus}: ${Math.abs(
              balanceAfterValue
            ).toFixed(0)}`,
            [
              { text: "Cancel", style: "cancel" },
              { text: "Confirm", onPress: () => void finalizeCreate() },
            ]
          );
          return;
        }

        await finalizeCreate();
      } catch (err) {
        const axiosError = err as AxiosError;
        const detail = (axiosError.response?.data as { detail?: string } | undefined)?.detail;
        Alert.alert("Error", `Failed to create order. ${detail ?? "Please try again."}`);
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

  const scrollToAmountsAndTotals = () => {
    const scrollView = scrollRef.current;
    if (!scrollView || amountsLayoutY === null || !totalsLayout) return;
    if (!scrollViewHeight || !keyboardHeight) {
      scrollView.scrollTo({ y: Math.max(amountsLayoutY - 24, 0), animated: true });
      return;
    }
    const visibleHeight = scrollViewHeight - keyboardHeight - 16;
    const totalsBottom = totalsLayout.y + totalsLayout.height;
    const targetForTotals = Math.max(totalsBottom - visibleHeight, 0);
    scrollView.scrollTo({ y: targetForTotals, animated: true });
  };


  const adjustInstalled = (delta: number) => {
    const current = Number(watch("cylinders_installed")) || 0;
    const next = Math.max(0, current + delta);
    setValue("cylinders_installed", String(next), { shouldDirty: true, shouldValidate: true });
    setValue("cylinders_received", String(next), { shouldDirty: true, shouldValidate: true });
    setManualPrice(false);
  };

  const adjustReceived = (delta: number) => {
    const current = Number(watch("cylinders_received")) || 0;
    const next = Math.max(0, current + delta);
    setValue("cylinders_received", String(next), { shouldDirty: true, shouldValidate: true });
  };

  const exitAfterWhatsApp = () => {
    setWhatsappOpen(false);
    setWhatsappOrderId(null);
    router.replace({ pathname: "/", params: { flash: "order-created" } });
  };

  const openWhatsAppConfirmation = async () => {
    if (!whatsappOrderId) return;
    try {
      setWhatsappBusy(true);
      const { url } = await getOrderWhatsappLink(whatsappOrderId);
      await Linking.openURL(url);
      exitAfterWhatsApp();
    } catch {
      Alert.alert("WhatsApp not available", "Could not open WhatsApp on this device.");
    } finally {
      setWhatsappBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoider}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 120 : 0}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          keyboardHeight ? { paddingBottom: keyboardHeight + 16 } : null,
        ]}
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInset={{ bottom: keyboardHeight }}
        scrollIndicatorInsets={{ bottom: keyboardHeight }}
        alwaysBounceVertical
        onLayout={(event) => setScrollViewHeight(event.nativeEvent.layout.height)}
      >
        <Text style={styles.title}>Add Order</Text>
      {!pricesConfigured && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Selling prices are not configured yet.</Text>
          <Pressable onPress={() => router.push("/add?prices=1")} style={styles.noticeButton}>
            <Text style={styles.noticeButtonText}>Set prices</Text>
          </Pressable>
        </View>
      )}
      {inventoryInitBlocked && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Inventory not initialized. Set starting counts to add your first order.</Text>
          <Pressable onPress={() => setInitModalVisible(true)} style={styles.noticeButton}>
            <Text style={styles.noticeButtonText}>Initialize inventory</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.sectionCard}>
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
      </View>

      <View style={styles.sectionCard}>
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
                  <Text style={styles.chipText}>{s.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
        />
        <FieldError message={errors.system_id?.message} />
      </View>

      <View style={styles.sectionCard}>
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
                  style={[
                    styles.chip,
                    value === g && { backgroundColor: gasColor(g), borderColor: gasColor(g) },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      value === g ? styles.chipTextActive : { color: gasColor(g) },
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
      </View>

      <View style={styles.sectionCard}>
        <FieldLabel>Delivery (date & time)</FieldLabel>
        <Controller
          control={control}
          name="delivered_at"
          rules={{ required: "Enter delivery date & time" }}
          render={() => (
            <View style={styles.row}>
              <Pressable
                style={[styles.input, styles.half, errors.delivered_at && styles.inputError]}
                onPress={() => setDeliveryDateOpen(true)}
              >
                <Text style={styles.dateText}>{deliveryDate}</Text>
              </Pressable>
              <Pressable
                style={[styles.input, styles.half, errors.delivered_at && styles.inputError]}
                onPress={() => setDeliveryTimeOpen(true)}
              >
                <Text style={styles.dateText}>{deliveryTime}</Text>
              </Pressable>
            </View>
          )}
        />
        <FieldError message={errors.delivered_at?.message} />
      </View>

      <View
        onLayout={(event) => {
          setAmountsLayoutY(event.nativeEvent.layout.y);
        }}
      >
        <View style={styles.fieldBox}>
          <View style={styles.amountsRow}>
            <View style={styles.amountCell}>
              <Text style={styles.fieldName}>Installed</Text>
              <View style={styles.amountGroup}>
                <Pressable style={styles.stepperBtn} onPress={() => adjustInstalled(-1)}>
                  <Ionicons name="remove" size={10} color="#0a7ea4" />
                </Pressable>
                <Controller
                  control={control}
                  name="cylinders_installed"
                  rules={{
                    required: "Enter installed cylinders",
                    validate: (val) =>
                      (Number(val) || 0) >= 0 || "Installed cannot be negative",
                  }}
                  render={({ field }) => (
                    <TextInput
                      style={[
                        styles.input,
                        styles.amountInput,
                        errors.cylinders_installed && styles.inputError,
                      ]}
                      accessibilityLabel="Installed cylinders"
                      accessibilityHint="Enter number of cylinders installed"
                      keyboardType="numeric"
                      inputMode="numeric"
                      placeholder="0"
                      value={field.value}
                      ref={(node) => (inputRefs.current.cylinders_installed = node)}
                      onFocus={() => {
                        setFocusTarget("amounts");
                        scrollToAmountsAndTotals();
                      }}
                      onBlur={() => setFocusTarget(null)}
                      onChangeText={(t) => {
                        field.onChange(t);
                        setValue("cylinders_received", t);
                        setManualPrice(false);
                      }}
                    />
                  )}
                />
                <Pressable style={styles.stepperBtn} onPress={() => adjustInstalled(1)}>
                  <Ionicons name="add" size={10} color="#0a7ea4" />
                </Pressable>
              </View>
            </View>

            <View style={styles.amountCell}>
              <Text style={styles.fieldName}>Received</Text>
              <View style={styles.amountGroup}>
                <Pressable style={styles.stepperBtn} onPress={() => adjustReceived(-1)}>
                  <Ionicons name="remove" size={10} color="#0a7ea4" />
                </Pressable>
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
                        styles.amountInput,
                        errors.cylinders_received && styles.inputError,
                      ]}
                      accessibilityLabel="Received cylinders"
                      accessibilityHint="Enter number of cylinders received"
                      keyboardType="numeric"
                      inputMode="numeric"
                      placeholder="0"
                      value={field.value}
                      ref={(node) => (inputRefs.current.cylinders_received = node)}
                      onFocus={() => {
                        setFocusTarget("amounts");
                        scrollToAmountsAndTotals();
                      }}
                      onBlur={() => setFocusTarget(null)}
                      onChangeText={field.onChange}
                    />
                  )}
                />
                <Pressable style={styles.stepperBtn} onPress={() => adjustReceived(1)}>
                  <Ionicons name="add" size={10} color="#0a7ea4" />
                </Pressable>
              </View>
            </View>

            <View style={styles.amountCell}>
              <Text style={styles.fieldName}>Missing</Text>
              <TextInput
                style={[styles.input, styles.inputReadOnly]}
                value={missing.toString()}
                editable={false}
                placeholder="0"
              />
            </View>
          </View>

          <View style={[styles.amountsRow, showStickyPayment ? styles.hidden : undefined]}>
            <View
              style={styles.amountCell}
              onLayout={(event) => {
                const { y, height } = event.nativeEvent.layout;
                setTotalsLayout({ y, height });
              }}
            >
              <Text style={styles.fieldName}>Total</Text>
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
                      errors.price_total && styles.inputError,
                    ]}
                    accessibilityLabel="Total price"
                    accessibilityHint="Enter total price"
                    keyboardType="numeric"
                    inputMode="numeric"
                    placeholder="0"
                    value={field.value}
                    ref={(node) => (inputRefs.current.price_total = node)}
                    onFocus={() => {
                      setFocusTarget("payments");
                    }}
                    onBlur={() => setFocusTarget(null)}
                    onChangeText={(t) => {
                      setManualPrice(true);
                      field.onChange(t);
                      setValue("money_received", t);
                      setValue("money_given", "0");
                    }}
                  />
                )}
              />
            </View>

            <View style={styles.amountCell}>
              <Text style={styles.fieldName}>Paid</Text>
              <Controller
                control={control}
                name="money_received"
                rules={{
                  required: "Enter paid amount",
                  validate: (val) =>
                    (Number(val) || 0) >= 0 || "Paid cannot be negative",
                }}
                render={({ field }) => (
                  <TextInput
                    style={[
                      styles.input,
                      errors.money_received && styles.inputError,
                    ]}
                    accessibilityLabel="Paid amount"
                    accessibilityHint="Enter amount paid"
                    keyboardType="numeric"
                    inputMode="numeric"
                    placeholder="0"
                    value={field.value}
                    ref={(node) => (inputRefs.current.money_received = node)}
                    onFocus={() => {
                      setFocusTarget("payments");
                    }}
                    onBlur={() => setFocusTarget(null)}
                    onChangeText={(t) => {
                      field.onChange(t);
                    }}
                  />
                )}
              />
            </View>

            <View style={styles.amountCell}>
              <Text style={styles.fieldName}>Result</Text>
              <TextInput
                style={[styles.input, styles.inputReadOnly]}
                value={unpaid.toString()}
                editable={false}
                placeholder="0"
              />
            </View>
          </View>
          <Text style={styles.balanceHint}>
            Balance: {balanceBefore.toFixed(0)} {"->"} {balanceAfter.toFixed(0)}
          </Text>
        </View>
        <FieldError message={errors.cylinders_installed?.message} />
        <FieldError message={errors.cylinders_received?.message} />
        <FieldError message={errors.price_total?.message} />
        <FieldError message={errors.money_received?.message} />
      </View>

      <Pressable
        onPress={onSubmit}
        disabled={submitting}
        style={styles.primary}
      >
        <Text style={styles.primaryText}>
          {submitting ? "Saving..." : "Save Order"}
        </Text>
      </Pressable>

      <Modal visible={whatsappOpen} transparent animationType="fade" onRequestClose={exitAfterWhatsApp}>
        <Pressable style={styles.modalOverlay} onPress={exitAfterWhatsApp}>
          <Pressable style={[styles.modalCard, styles.whatsappCard]} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Order saved</Text>
            <Text style={styles.modalSubtitle}>Send the confirmation to the customer?</Text>
            <Pressable
              style={[styles.whatsappButton, whatsappBusy && styles.whatsappButtonDisabled]}
              onPress={openWhatsAppConfirmation}
              disabled={whatsappBusy || !whatsappOrderId}
            >
              <Text style={styles.whatsappButtonText}>
                {whatsappBusy ? "Opening..." : "Send WhatsApp Confirmation"}
              </Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={exitAfterWhatsApp}>
              <Text style={styles.secondaryButtonText}>Skip</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={initModalVisible} animationType="slide" transparent onRequestClose={() => setInitModalVisible(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 120 : 0}
        >
          <ScrollView
            contentContainerStyle={[
              styles.modalScrollContent,
              keyboardHeight ? { paddingBottom: keyboardHeight } : null,
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Initialize inventory</Text>
            <Text style={styles.orderMeta}>Enter starting counts for each cylinder size.</Text>
            <View style={styles.fieldBlock}>
              <FieldLabel>Inventory date</FieldLabel>
              <Pressable style={styles.input} onPress={() => setInitDateOpen(true)}>
                <Text style={styles.dateText}>{initDate}</Text>
              </Pressable>
            </View>
            <View style={styles.row}>
              <View style={styles.half}>
                <FieldLabel>12kg Full</FieldLabel>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  inputMode="numeric"
                  placeholder="0"
                  value={initCounts.full12}
                  onChangeText={(t) => setInitCounts((s) => ({ ...s, full12: t }))}
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={() => Keyboard.dismiss()}
                  inputAccessoryViewID={initAccessoryId}
                />
              </View>
              <View style={styles.half}>
                <FieldLabel>12kg Empty</FieldLabel>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  inputMode="numeric"
                  placeholder="0"
                  value={initCounts.empty12}
                  onChangeText={(t) => setInitCounts((s) => ({ ...s, empty12: t }))}
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={() => Keyboard.dismiss()}
                  inputAccessoryViewID={initAccessoryId}
                />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.half}>
                <FieldLabel>48kg Full</FieldLabel>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  inputMode="numeric"
                  placeholder="0"
                  value={initCounts.full48}
                  onChangeText={(t) => setInitCounts((s) => ({ ...s, full48: t }))}
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={() => Keyboard.dismiss()}
                  inputAccessoryViewID={initAccessoryId}
                />
              </View>
              <View style={styles.half}>
                <FieldLabel>48kg Empty</FieldLabel>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  inputMode="numeric"
                  placeholder="0"
                  value={initCounts.empty48}
                  onChangeText={(t) => setInitCounts((s) => ({ ...s, empty48: t }))}
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={() => Keyboard.dismiss()}
                  inputAccessoryViewID={initAccessoryId}
                />
              </View>
            </View>
            <View style={styles.modalActionRow}>
              <Pressable
                style={styles.modalActionSecondary}
                onPress={() => setInitModalVisible(false)}
                disabled={initInventory.isPending}
              >
                <Text style={styles.modalActionSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalActionPrimary}
                disabled={initInventory.isPending}
                onPress={async () => {
                  const payload = {
                    date: initDate,
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
          </ScrollView>
          {Platform.OS === "ios" && (
            <InputAccessoryView nativeID={initAccessoryId}>
              <View style={styles.accessoryRow}>
                <Pressable onPress={() => Keyboard.dismiss()} style={styles.accessoryButton}>
                  <Text style={styles.accessoryText}>Done</Text>
                </Pressable>
              </View>
            </InputAccessoryView>
          )}
        </KeyboardAvoidingView>
      </Modal>

      <CalendarModal
        visible={deliveryDateOpen}
        value={deliveryDate}
        maxDate={new Date()}
        onSelect={(next) => setDeliveryDate(next)}
        onClose={() => setDeliveryDateOpen(false)}
      />
      <CalendarModal
        visible={initDateOpen}
        value={initDate}
        maxDate={new Date()}
        onSelect={(next) => setInitDate(next)}
        onClose={() => setInitDateOpen(false)}
      />
      <TimePickerModal
        visible={deliveryTimeOpen}
        value={deliveryTime}
        onSelect={(next) => setDeliveryTime(next)}
        onClose={() => setDeliveryTimeOpen(false)}
      />
      </ScrollView>
      {showStickyPayment && (
        <View style={[styles.stickyPayment, { bottom: keyboardHeight }]}>
          <Text style={styles.stickyLabel}>Total / Paid</Text>
          <View style={[styles.row, styles.fieldBox]}>
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
                  keyboardType="numeric"
                  inputMode="numeric"
                  placeholder="Tot"
                  value={field.value}
                  editable={false}
                  onChangeText={(t) => {
                    setManualPrice(true);
                    field.onChange(t);
                    setValue("money_received", t);
                    setValue("money_given", "0");
                  }}
                />
              )}
            />
            <Controller
              control={control}
              name="money_received"
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
                    errors.money_received && styles.inputError,
                  ]}
                  keyboardType="numeric"
                  inputMode="numeric"
                  placeholder="Paid"
                  value={field.value}
                  editable={false}
                  onChangeText={(t) => {
                    field.onChange(t);
                  }}
                />
              )}
            />
            <TextInput
              style={[styles.input, styles.half, styles.inputReadOnly]}
              value={unpaid.toString()}
              editable={false}
              placeholder="Unp"
            />
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <Text style={styles.errorText}>{message}</Text>;
}

function CalendarModal({
  visible,
  value,
  maxDate,
  onSelect,
  onClose,
}: {
  visible: boolean;
  value: string;
  maxDate: Date;
  onSelect: (next: string) => void;
  onClose: () => void;
}) {
  const parseDate = (dateValue: string) => {
    const parts = dateValue.split("-").map((part) => Number(part));
    if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
      return new Date();
    }
    return new Date(parts[0], parts[1] - 1, parts[2]);
  };
  const formatDate = (valueDate: Date) => {
    const year = valueDate.getFullYear();
    const month = String(valueDate.getMonth() + 1).padStart(2, "0");
    const day = String(valueDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [month, setMonth] = useState(() => parseDate(value));

  useEffect(() => {
    if (!visible) return;
    setMonth(parseDate(value));
  }, [value, visible]);

  const today = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const startDay = start.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const monthLabel = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const selected = value;
  const cells = Array.from({ length: 42 }, (_, index) => {
    const dayNumber = index - startDay + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) return null;
    return dayNumber;
  });

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.calendarOverlay}>
        <View style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <Pressable
              style={styles.calendarNav}
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            >
              <Text style={styles.calendarNavText}>{"<"}</Text>
            </Pressable>
            <Text style={styles.calendarTitle}>{monthLabel}</Text>
            <Pressable
              style={styles.calendarNav}
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              <Text style={styles.calendarNavText}>{">"}</Text>
            </Pressable>
          </View>
          <View style={styles.calendarWeekRow}>
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <Text key={day} style={styles.calendarWeekDay}>
                {day}
              </Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {cells.map((day, index) => {
              if (!day) {
                return <View key={`empty-${index}`} style={styles.calendarCell} />;
              }
              const dayDate = new Date(month.getFullYear(), month.getMonth(), day);
              const dayValue = formatDate(dayDate);
              const isSelected = dayValue === selected;
              const isFuture = dayDate > today;
              return (
                <Pressable
                  key={dayValue}
                  disabled={isFuture}
                  style={[
                    styles.calendarCell,
                    isSelected && styles.calendarCellSelected,
                    isFuture && styles.calendarCellDisabled,
                  ]}
                  onPress={() => {
                    onSelect(dayValue);
                    onClose();
                  }}
                >
                  <Text
                    style={[
                      styles.calendarDayText,
                      isSelected && styles.calendarDayTextSelected,
                      isFuture && styles.calendarDayTextDisabled,
                    ]}
                  >
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable style={styles.calendarClose} onPress={onClose}>
            <Text style={styles.calendarCloseText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function TimePickerModal({
  visible,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  value: string;
  onSelect: (next: string) => void;
  onClose: () => void;
}) {
  const times = useMemo(() => {
    const list: string[] = [];
    for (let hour = 0; hour < 24; hour += 1) {
      for (let minute = 0; minute < 60; minute += 15) {
        list.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
      }
    }
    return list;
  }, []);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.calendarOverlay}>
        <View style={styles.calendarCard}>
          <Text style={styles.calendarTitle}>Select time</Text>
          <ScrollView style={styles.timeList} contentContainerStyle={styles.timeListContent}>
            {times.map((time) => {
              const selected = time === value;
              return (
                <Pressable
                  key={time}
                  style={[styles.timeItem, selected && styles.timeItemSelected]}
                  onPress={() => {
                    onSelect(time);
                    onClose();
                  }}
                >
                  <Text style={[styles.timeText, selected && styles.timeTextSelected]}>{time}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable style={styles.calendarClose} onPress={onClose}>
            <Text style={styles.calendarCloseText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardAvoider: {
    flex: 1,
  },
  container: {
    padding: 14,
    gap: 6,
    backgroundColor: "#f3f5f7",
  },
  title: { fontSize: 26, fontWeight: "800", color: "#0f172a" },
  label: { fontWeight: "700", marginTop: 6, color: "#0f172a" },
  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { padding: 10, borderRadius: 12, backgroundColor: "#eef2f6" },
  chipActive: { backgroundColor: "#0a7ea4" },
  chipInactive: { opacity: 0.4 },
  chipText: { fontWeight: "600", color: "#1f2937" },
  chipTextActive: { color: "#fff" },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d7dde4",
  },
  inputReadOnly: {
    backgroundColor: "#eef2f6",
    color: "#8a8a8a",
  },
  hidden: {
    display: "none",
  },
  stickyPayment: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d0d7de",
  },
  stickyLabel: {
    fontWeight: "700",
    marginBottom: 6,
  },
  dateText: {
    color: "#111827",
    fontWeight: "600",
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
  quarter: { flex: 1 },
  amountGroup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  amountInput: {
    flex: 1,
    textAlign: "center",
  },
  stepperBtn: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d7dde4",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  amountsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  amountCell: {
    flex: 1,
    gap: 6,
  },
  fieldName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  fieldBox: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  balanceHint: {
    marginTop: 6,
    color: "#475569",
    fontWeight: "600",
  },
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
    padding: 8,
    borderRadius: 10,
    gap: 4,
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
    padding: 20,
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    gap: 10,
    maxHeight: "90%",
  },
  whatsappCard: {
    gap: 12,
  },
  whatsappButton: {
    backgroundColor: "#16a34a",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  whatsappButtonDisabled: {
    opacity: 0.6,
  },
  whatsappButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  modalActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  modalActionSecondary: {
    flex: 1,
    borderColor: "#ccc",
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  modalActionSecondaryText: { fontWeight: "700", color: "#333" },
  modalActionPrimary: {
    flex: 1,
    backgroundColor: "#0a7ea4",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  calendarOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  calendarCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  calendarNav: {
    padding: 6,
  },
  calendarNavText: {
    fontWeight: "700",
    color: "#0a7ea4",
  },
  calendarTitle: {
    fontWeight: "700",
    fontSize: 16,
    color: "#1f2937",
  },
  calendarWeekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  calendarWeekDay: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    color: "#6b7280",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calendarCell: {
    width: "14.285%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 2,
    borderRadius: 8,
  },
  calendarCellSelected: {
    backgroundColor: "#0a7ea4",
  },
  calendarCellDisabled: {
    backgroundColor: "#f1f5f9",
  },
  calendarDayText: {
    color: "#1f2937",
    fontWeight: "600",
  },
  calendarDayTextSelected: {
    color: "#fff",
  },
  calendarDayTextDisabled: {
    color: "#9ca3af",
  },
  calendarClose: {
    alignSelf: "flex-end",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#e8eef1",
  },
  calendarCloseText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  timeList: {
    maxHeight: 240,
  },
  timeListContent: {
    gap: 6,
  },
  timeItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
  },
  timeItemSelected: {
    backgroundColor: "#0a7ea4",
  },
  timeText: {
    fontWeight: "600",
    color: "#1f2937",
  },
  timeTextSelected: {
    color: "#fff",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#444",
    marginBottom: 12,
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
  accessoryRow: {
    backgroundColor: "#f1f5f9",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#cbd5f5",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  accessoryButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#0a7ea4",
    borderRadius: 8,
  },
  accessoryText: {
    color: "#fff",
    fontWeight: "700",
  },
});
