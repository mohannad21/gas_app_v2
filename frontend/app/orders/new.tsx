import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useFocusEffect } from "@react-navigation/native";

import { useCustomers } from "@/hooks/useCustomers";
import { useCreateOrder } from "@/hooks/useOrders";
import { useCreateCollection } from "@/hooks/useCollections";
import { useInventoryLatest, useInitInventory } from "@/hooks/useInventory";
import { usePriceSettings } from "@/hooks/usePrices";
import { useSystems } from "@/hooks/useSystems";
import { getOrderWhatsappLink } from "@/lib/api";
import { formatDateLocale } from "@/lib/date";
import { GasType, OrderCreateInput } from "@/types/domain";
import { gasColor } from "@/constants/gas";

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
      paid_amount: "",
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
  const createCollection = useCreateCollection();
  const initInventory = useInitInventory();

  const [submitting, setSubmitting] = useState(false);
  const [entryMode, setEntryMode] = useState<"order" | "payment" | "return">("order");
  const [orderMode, setOrderMode] = useState<"replacement" | "sell_iron" | "buy_iron">("replacement");
  const [customerSearch, setCustomerSearch] = useState("");
  const searchInputRef = useRef<TextInput | null>(null);
  const [manualPrice, setManualPrice] = useState(false);
  const [whatsappOrderId, setWhatsappOrderId] = useState<string | null>(null);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [whatsappBusy, setWhatsappBusy] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [tradeQuantity, setTradeQuantity] = useState("");
  const [tradeUnitPrice, setTradeUnitPrice] = useState("");
  const [return12, setReturn12] = useState("");
  const [return48, setReturn48] = useState("");
  const [collectionNote, setCollectionNote] = useState("");
  const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false);
  const [customerInputArmed, setCustomerInputArmed] = useState(false);
  const [customerTyping, setCustomerTyping] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const inputRefs = useRef<Record<string, TextInput | null>>({});
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [avoidKeyboard, setAvoidKeyboard] = useState(false);
  const [scrollViewHeight, setScrollViewHeight] = useState(0);
  const [focusTarget, setFocusTarget] = useState<"amounts" | "payments" | null>(null);
  const [amountsLayoutY, setAmountsLayoutY] = useState<number | null>(null);
  const [totalsLayout, setTotalsLayout] = useState<{ y: number; height: number } | null>(null);
  const effectiveKeyboardHeight = avoidKeyboard ? keyboardHeight : 0;
  const showStickyPayment =
    focusTarget === "amounts" && effectiveKeyboardHeight > 0 && orderMode === "replacement";
  const footerHeight = 96;
  const contentBottomPadding = footerHeight + 32;
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
  const [collectionDateOpen, setCollectionDateOpen] = useState(false);
  const [collectionTimeOpen, setCollectionTimeOpen] = useState(false);
  const [collectionDate, setCollectionDate] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });
  const [collectionTime, setCollectionTime] = useState(() => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  });

  const installed = Number(watch("cylinders_installed")) || 0;
  const received = Number(watch("cylinders_received")) || 0;
  const totalAmount = Number(watch("price_total")) || 0;
  const paidInput = Number(watch("paid_amount")) || 0;
  const grossPaid = orderMode === "buy_iron" ? -paidInput : paidInput;
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
  const orderAccessoryId = Platform.OS === "ios" ? "orderFormAccessory" : undefined;
  const doneInputProps = {
    returnKeyType: "done" as const,
    blurOnSubmit: true,
    onSubmitEditing: () => Keyboard.dismiss(),
    ...(orderAccessoryId ? { inputAccessoryViewID: orderAccessoryId } : {}),
  };

  /* -------------------- derived -------------------- */

  const customerOptions = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    const list = customersQuery.data ?? [];
    if (!term) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
      (c.note ?? "").toLowerCase().includes(term)
    );
  }, [customersQuery.data, customerSearch]);
  const customerSearchTerm = customerSearch.trim();
  const hasExactCustomerMatch = useMemo(() => {
    if (!customerSearchTerm) return false;
    const normalized = customerSearchTerm.toLowerCase();
    return (customersQuery.data ?? []).some(
      (c) => c.name.trim().toLowerCase() === normalized
    );
  }, [customersQuery.data, customerSearchTerm]);

  const systemOptions = useMemo(
    () => systemsQuery.data ?? [],
    [systemsQuery.data]
  );

  const selectedSystem = useMemo(
    () => systemOptions.find((s) => s.id === selectedSystemId),
    [systemOptions, selectedSystemId]
  );
  const allowedGasTypes = useMemo(() => {
    if (orderMode !== "replacement") {
      return ["12kg", "48kg"] as GasType[];
    }
    const systemGas = selectedSystem?.gas_type as GasType | undefined;
    if (systemGas === "12kg" || systemGas === "48kg") {
      return [systemGas];
    }
    return ["12kg", "48kg"] as GasType[];
  }, [orderMode, selectedSystem]);
  const selectedCustomerEntry = useMemo(
    () => (customersQuery.data ?? []).find((c) => c.id === selectedCustomer),
    [customersQuery.data, selectedCustomer]
  );
  const hasCustomer = Boolean(selectedCustomerEntry);
  const isTradeMode = orderMode !== "replacement";
  const tradeQuantityValue = Number(tradeQuantity) || 0;
  const tradeUnitPriceValue = Number(tradeUnitPrice) || 0;
  const tradeTotal = tradeQuantityValue * tradeUnitPriceValue;
  const tradeSignedTotal = orderMode === "buy_iron" ? -tradeTotal : tradeTotal;
  const orderSaveDisabled =
    isTradeMode && (tradeQuantityValue <= 0 || tradeUnitPriceValue <= 0);
  const balanceBefore = selectedCustomerEntry?.money_balance ?? 0;
  const balanceAfter = balanceBefore + unpaid;
  const paymentAmountValue = Number(paymentAmount) || 0;
  const paymentBalanceAfter = balanceBefore - paymentAmountValue;
  const return12Value = Number(return12) || 0;
  const return48Value = Number(return48) || 0;
  const cylinder12Before = selectedCustomerEntry?.cylinder_balance_12kg ?? 0;
  const cylinder48Before = selectedCustomerEntry?.cylinder_balance_48kg ?? 0;
  const orderCylinderDelta = orderMode === "replacement" ? installed - received : 0;
  const orderCylinderAfter12 =
    selectedGas === "12kg" ? cylinder12Before + orderCylinderDelta : cylinder12Before;
  const orderCylinderAfter48 =
    selectedGas === "48kg" ? cylinder48Before + orderCylinderDelta : cylinder48Before;
  const cylinder12After = cylinder12Before - return12Value;
  const cylinder48After = cylinder48Before - return48Value;
  const collectionBusy = createCollection.isPending;
  const previousCustomerRef = useRef<string | undefined>();
  const formatMoneyAmount = (value: number) => Math.abs(value).toFixed(0);
  const formatSignedMoney = (value: number) => {
    if (value === 0) return `0₪`;
    const sign = value > 0 ? "-" : "+";
    return `${sign}${formatMoneyAmount(value)}₪`;
  };
  const formatSignedCylinder = (value: number, label: "12kg" | "48kg") => {
    if (value === 0) return `0x ${label}`;
    const sign = value > 0 ? "-" : "+";
    return `${sign}${Math.abs(value)}x ${label}`;
  };
  const adjustReturn12 = (delta: number) => {
    setReturn12((prev) => {
      const next = Math.max(0, (Number(prev) || 0) + delta);
      return next ? String(next) : "";
    });
  };
  const adjustReturn48 = (delta: number) => {
    setReturn48((prev) => {
      const next = Math.max(0, (Number(prev) || 0) + delta);
      return next ? String(next) : "";
    });
  };
  const customerAlertLines = useMemo(() => {
    if (!selectedCustomerEntry) return [];
    const formatMoneyDebtLine = (value: number) => {
      if (value > 0) return `Customer must pay you ${formatMoneyAmount(value)}?`;
      if (value < 0) return `You must pay the customer ${formatMoneyAmount(value)}?`;
      return "Money debt: 0?";
    };
    const formatCylinderDebtLine = (value: number, label: "12kg" | "48kg") => {
      if (value > 0) return `Customer must return ${Math.abs(value)}x ${label}`;
      if (value < 0) return `You must give the customer ${Math.abs(value)}x ${label}`;
      return `${label} debt: 0x`;
    };

    if (entryMode === "payment") {
      return [formatMoneyDebtLine(paymentBalanceAfter)];
    }
    if (entryMode === "return") {
      return [
        formatCylinderDebtLine(cylinder12After, "12kg"),
        formatCylinderDebtLine(cylinder48After, "48kg"),
      ];
    }

    return [
      formatMoneyDebtLine(balanceAfter),
      formatCylinderDebtLine(orderCylinderAfter12, "12kg"),
      formatCylinderDebtLine(orderCylinderAfter48, "48kg"),
    ];
  }, [
    balanceAfter,
    cylinder12After,
    cylinder48After,
    entryMode,
    orderMode,
    orderCylinderAfter12,
    orderCylinderAfter48,
    paymentBalanceAfter,
    selectedCustomerEntry,
    formatMoneyAmount,
  ]);

  const orderBalanceLines = useMemo(
    () => [
      `Money: ${formatSignedMoney(balanceBefore)} -> ${formatSignedMoney(balanceAfter)}`,
      `12kg: ${formatSignedCylinder(cylinder12Before, "12kg")} -> ${formatSignedCylinder(
        orderCylinderAfter12,
        "12kg"
      )}`,
      `48kg: ${formatSignedCylinder(cylinder48Before, "48kg")} -> ${formatSignedCylinder(
        orderCylinderAfter48,
        "48kg"
      )}`,
    ],
    [
      balanceAfter,
      balanceBefore,
      cylinder12Before,
      cylinder48Before,
      orderCylinderAfter12,
      orderCylinderAfter48,
      formatSignedMoney,
      formatSignedCylinder,
    ]
  );
  const paymentBalanceLines = useMemo(
    () => [`Money: ${formatSignedMoney(balanceBefore)} -> ${formatSignedMoney(paymentBalanceAfter)}`],
    [balanceBefore, formatSignedMoney, paymentBalanceAfter]
  );
  const returnBalanceLines = useMemo(
    () => [
      `12kg: ${formatSignedCylinder(cylinder12Before, "12kg")} -> ${formatSignedCylinder(
        cylinder12After,
        "12kg"
      )}`,
      `48kg: ${formatSignedCylinder(cylinder48Before, "48kg")} -> ${formatSignedCylinder(
        cylinder48After,
        "48kg"
      )}`,
    ],
    [cylinder12After, cylinder12Before, cylinder48After, cylinder48Before, formatSignedCylinder]
  );

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
    setPaymentAmount("");
    setTradeQuantity("");
    setTradeUnitPrice("");
    setReturn12("");
    setReturn48("");
    setCollectionNote("");
  }, [selectedCustomer, setValue]);

  useEffect(() => {
    if (!selectedCustomer) {
      return;
    }
    if (systemOptions.length === 1 && !selectedSystemId) {
      setValue("system_id", systemOptions[0].id);
    }
  }, [selectedCustomer, systemOptions, selectedSystemId, setValue]);

  useEffect(() => {
    if (!selectedCustomer) return;
    if (orderMode === "replacement") return;
    if (!selectedSystemId && systemOptions.length > 0) {
      const fallback = systemOptions.find((s) => s.is_active) ?? systemOptions[0];
      if (fallback) {
        setValue("system_id", fallback.id);
      }
    }
    if (!selectedGas) {
      setValue("gas_type", "12kg");
    }
  }, [orderMode, selectedCustomer, selectedGas, selectedSystem, selectedSystemId, systemOptions, setValue]);

  useEffect(() => {
    if (orderMode !== "replacement") return;
    if (!selectedSystem) return;
    if (!allowedGasTypes.length) return;
    if (!selectedGas || !allowedGasTypes.includes(selectedGas)) {
      setValue("gas_type", allowedGasTypes[0]);
    }
  }, [allowedGasTypes, orderMode, selectedGas, selectedSystem, setValue]);

  /* -------------------- pricing -------------------- */

  const unitPrice = useMemo(() => {
    const prices = pricesQuery.data ?? [];
    const match = prices
      .filter((p) => p.gas_type === selectedGas)
      .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
    return match?.selling_price ?? 0;
  }, [pricesQuery.data, selectedGas]);

  /* -------------------- effects -------------------- */

  useEffect(() => {
    if (initialCustomerId && !selectedCustomer) {
      setValue("customer_id", initialCustomerId);
    }
  }, [initialCustomerId, selectedCustomer, setValue]);

  useEffect(() => {
    setIsCustomerSearchOpen(false);
    setCustomerInputArmed(false);
    setCustomerTyping(false);
    setAvoidKeyboard(false);
    Keyboard.dismiss();
  }, [entryMode]);

  useEffect(() => {
    if (isCustomerSearchOpen) return;
    setCustomerSearch(selectedCustomerEntry?.name ?? "");
  }, [isCustomerSearchOpen, selectedCustomerEntry]);

  useFocusEffect(
    useCallback(() => {
      customersQuery.refetch();
    }, [customersQuery])
  );

  useEffect(() => {
    if (isCustomerSearchOpen) {
      customersQuery.refetch();
    }
  }, [isCustomerSearchOpen, customersQuery]);

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
    if (orderMode !== "replacement") return;
    const nextGas = allowedGasTypes[0] ?? "12kg";
    setValue("gas_type", selectedGas && allowedGasTypes.includes(selectedGas) ? selectedGas : nextGas);
    setValue("cylinders_installed", "1");
    setValue("cylinders_received", "1");

    const total = unitPrice;
    setValue("price_total", String(total));
    setValue("paid_amount", String(total));
    setManualPrice(false);
  }, [allowedGasTypes, orderMode, selectedGas, selectedSystem, unitPrice, setValue]);

  // Installed drives total + payment (unless manually overridden)
  useEffect(() => {
    if (orderMode !== "replacement") return;
    if (manualPrice) return;
    if (installed <= 0) return;

    const total = installed * unitPrice;
    setValue("price_total", String(total));
    setValue("paid_amount", String(total));
  }, [orderMode, installed, unitPrice, manualPrice, setValue]);

  useEffect(() => {
    const [year, month, day] = deliveryDate.split("-").map((part) => Number(part));
    const [hour, minute] = deliveryTime.split(":").map((part) => Number(part));
    if (!year || !month || !day) return;
    const next = new Date(year, month - 1, day, hour || 0, minute || 0);
    setValue("delivered_at", next.toISOString());
  }, [deliveryDate, deliveryTime, setValue]);

  useEffect(() => {
    if (!isTradeMode) return;
    if (orderMode === "sell_iron") {
      setValue("cylinders_installed", tradeQuantityValue ? String(tradeQuantityValue) : "");
      setValue("cylinders_received", "0");
      setValue("price_total", tradeTotal ? String(tradeTotal) : "0");
      setValue("paid_amount", tradeTotal ? String(tradeTotal) : "0");
    } else if (orderMode === "buy_iron") {
      setValue("cylinders_installed", "0");
      setValue("cylinders_received", tradeQuantityValue ? String(tradeQuantityValue) : "");
      const negativeTotal = tradeTotal ? -Math.abs(tradeTotal) : 0;
      setValue("price_total", negativeTotal ? String(negativeTotal) : "0");
      setValue("paid_amount", tradeTotal ? String(tradeTotal) : "0");
    }
    setManualPrice(true);
  }, [isTradeMode, orderMode, tradeQuantityValue, tradeTotal, setValue]);

  const buildEffectiveAt = (dateValue: string, timeValue: string) => {
    const [year, month, day] = dateValue.split("-").map((part) => Number(part));
    const [hour, minute] = timeValue.split(":").map((part) => Number(part));
    if (!year || !month || !day) return undefined;
    return new Date(year, month - 1, day, hour || 0, minute || 0).toISOString();
  };

  const activeDate = entryMode === "order" ? deliveryDate : collectionDate;
  const activeTime = entryMode === "order" ? deliveryTime : collectionTime;
  const openActiveDate = () =>
    entryMode === "order" ? setDeliveryDateOpen(true) : setCollectionDateOpen(true);
  const openActiveTime = () =>
    entryMode === "order" ? setDeliveryTimeOpen(true) : setCollectionTimeOpen(true);
  const setActiveNow = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const nextDate = `${year}-${month}-${day}`;
    const nextTime = `${hours}:${minutes}`;
    if (entryMode === "order") {
      setDeliveryDate(nextDate);
      setDeliveryTime(nextTime);
    } else {
      setCollectionDate(nextDate);
      setCollectionTime(nextTime);
    }
  };

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
    if (!avoidKeyboard || focusTarget !== "amounts" || keyboardHeight <= 0) return;
    const timer = setTimeout(() => {
      scrollToAmountsAndTotals();
    }, 60);
    return () => clearTimeout(timer);
  }, [avoidKeyboard, focusTarget, keyboardHeight, scrollViewHeight, amountsLayoutY, totalsLayout]);

  /* -------------------- submit -------------------- */

  const resetOrderForm = () => {
    setValue("customer_id", "");
    setValue("system_id", "");
    setValue("gas_type", "");
    setValue("cylinders_installed", "");
    setValue("cylinders_received", "");
    setValue("price_total", "");
    setValue("paid_amount", "");
    setValue("note", "");
    setManualPrice(false);
    setCustomerSearch("");
    setPaymentAmount("");
    setTradeQuantity("");
    setTradeUnitPrice("");
    setReturn12("");
    setReturn48("");
    setCollectionNote("");
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const nextDate = `${year}-${month}-${day}`;
    const nextTime = `${hours}:${minutes}`;
    setDeliveryDate(nextDate);
    setDeliveryTime(nextTime);
    setValue(
      "delivered_at",
      new Date(year, now.getMonth(), now.getDate(), now.getHours(), now.getMinutes()).toISOString()
    );
  };

  const runOrderSubmit = async (
    values: OrderFormValues,
    options: { showWhatsapp: boolean; resetAfter: boolean }
  ) => {
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
    const installedCount = Number(values.cylinders_installed) || 0;
    const receivedCount = Number(values.cylinders_received) || 0;
    if (orderMode !== "buy_iron" && installedCount <= 0) {
      Alert.alert(
        "Invalid installed count",
        "Orders must have at least 1 installed cylinder. For money-only or return-only actions, use the Payment or Return tabs."
      );
      return;
    }
    if (orderMode === "sell_iron" || orderMode === "buy_iron") {
      const tradeCount = orderMode === "buy_iron" ? receivedCount : installedCount;
      if (tradeCount <= 0) {
        Alert.alert("Missing quantity", "Enter a quantity greater than 0.");
        return;
      }
      if (tradeUnitPriceValue <= 0) {
        Alert.alert("Missing price", "Enter a price per unit.");
        return;
      }
    }
    const total = Number(values.price_total) || 0;
    const paid = Number(values.paid_amount) || 0;
    const grossPaidValue = orderMode === "buy_iron" ? -paid : paid;
    const result = total - grossPaidValue;
    const balanceBeforeValue = selectedCustomerEntry?.money_balance ?? 0;
    const balanceAfterValue = balanceBeforeValue + result;
    const balanceStatus =
      balanceAfterValue < 0 ? "Credit" : balanceAfterValue > 0 ? "Debt" : "Settled";
    const cylDelta =
      orderMode === "replacement" ? installedCount - receivedCount : 0;
    const balanceBeforeCyl =
      gasType === "12kg"
        ? selectedCustomerEntry?.cylinder_balance_12kg ?? 0
        : selectedCustomerEntry?.cylinder_balance_48kg ?? 0;
    const balanceAfterCyl = balanceBeforeCyl + cylDelta;
    const alertLines: string[] = [];
    if (balanceAfterValue !== 0) {
      if (balanceAfterValue > 0) {
        alertLines.push(`Money: Customer must pay ${formatMoneyAmount(balanceAfterValue)}₪`);
      } else {
        alertLines.push(`Money: You must pay the customer ${formatMoneyAmount(balanceAfterValue)}₪`);
      }
    }
    if (balanceAfterCyl !== 0) {
      if (balanceAfterCyl > 0) {
        alertLines.push(`Cylinders: Customer must return ${Math.abs(balanceAfterCyl)} empty`);
      } else {
        alertLines.push(`Cylinders: You must give the customer ${Math.abs(balanceAfterCyl)} empty`);
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
      order_mode: orderMode,
      paid_amount: grossPaidValue,
      note: values.note,
      client_request_id: requestId,
    };

    const finalizeCreate = async () => {
      setSubmitting(true);
      try {
        const created = await createOrder.mutateAsync(orderPayload);
        if (options.showWhatsapp) {
          setWhatsappOrderId(created.id);
          setWhatsappOpen(true);
        }
        if (options.resetAfter) {
          resetOrderForm();
        }
      } catch (err) {
        const axiosError = err as AxiosError;
        const detail = (axiosError.response?.data as { detail?: string } | undefined)?.detail;
        Alert.alert("Error", `Failed to create order. ${detail ?? "Please try again."}`);
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
        "Confirm settlement",
        `${alertMessage}

${moneyLine}
${cylLine}

Resulting ${balanceStatus}: ${Math.abs(
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
  };

  const handleInvalid = (formErrors: Record<string, unknown>) => {
    if (formErrors.cylinders_installed) {
      Alert.alert(
        "Invalid installed count",
        "Orders must have at least 1 installed cylinder. For money-only or return-only actions, use the Payment or Return tabs."
      );
    }
    const first = Object.keys(formErrors)[0];
    if (first) {
      inputRefs.current[first]?.focus?.();
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const handleSaveOrder = handleSubmit(
    (values) => runOrderSubmit(values, { showWhatsapp: true, resetAfter: false }),
    handleInvalid
  );

  const handleSaveAndAddAnother = handleSubmit(
    (values) => runOrderSubmit(values, { showWhatsapp: false, resetAfter: true }),
    handleInvalid
  );


  const runSavePayment = async () => {
    if (!selectedCustomer) {
      Alert.alert("Missing customer", "Please select a customer.");
      return;
    }
    if (paymentAmountValue <= 0) {
      Alert.alert("Missing amount", "Enter a payment amount.");
      return;
    }
    try {
      const effectiveAt = buildEffectiveAt(collectionDate, collectionTime);
      await createCollection.mutateAsync({
        customer_id: selectedCustomer,
        action_type: "payment",
        amount_money: paymentAmountValue,
        effective_at: effectiveAt,
        note: collectionNote || undefined,
      });
      setPaymentAmount("");
      setCollectionNote("");
    } catch (err) {
      const axiosError = err as AxiosError;
      Alert.alert("Payment failed", axiosError.response?.data?.detail ?? axiosError.message);
    }
  };

  const runSaveReturn = async () => {
    if (!selectedCustomer) {
      Alert.alert("Missing customer", "Please select a customer.");
      return;
    }
    if (inventoryInitBlocked) {
      Alert.alert(
        "Initialize inventory",
        "Please add your initial inventory before recording returns.",
        [{ text: "Open inventory setup", onPress: () => setInitModalVisible(true) }]
      );
      return;
    }
    if (return12Value <= 0 && return48Value <= 0) {
      Alert.alert("Missing counts", "Enter at least one cylinder count.");
      return;
    }
    try {
      const effectiveAt = buildEffectiveAt(collectionDate, collectionTime);
      await createCollection.mutateAsync({
        customer_id: selectedCustomer,
        action_type: "return",
        qty_12kg: return12Value > 0 ? return12Value : 0,
        qty_48kg: return48Value > 0 ? return48Value : 0,
        effective_at: effectiveAt,
        note: collectionNote || undefined,
      });
      setReturn12("");
      setReturn48("");
      setCollectionNote("");
    } catch (err) {
      const axiosError = err as AxiosError;
      Alert.alert("Return failed", axiosError.response?.data?.detail ?? axiosError.message);
    }
  };

  const handleSavePayment = () => runSavePayment();
  const handleSavePaymentAndAddAnother = () => runSavePayment();
  const handleSaveReturn = () => runSaveReturn();
  const handleSaveReturnAndAddAnother = () => runSaveReturn();
  /* -------------------- UI -------------------- */

  const scrollToAmountsAndTotals = () => {
    const scrollView = scrollRef.current;
    if (!scrollView || amountsLayoutY === null || !totalsLayout) return;
    if (!scrollViewHeight || !effectiveKeyboardHeight) {
      scrollView.scrollTo({ y: Math.max(amountsLayoutY - 24, 0), animated: true });
      return;
    }
    const visibleHeight = scrollViewHeight - effectiveKeyboardHeight - 16;
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
  const adjustTradeQuantity = (delta: number) => {
    setTradeQuantity((prev) => {
      const next = Math.max(0, (Number(prev) || 0) + delta);
      return next ? String(next) : "";
    });
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
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        const query = url.split("?")[1];
        const fallback = query ? `https://api.whatsapp.com/send?${query}` : url;
        const canOpenFallback = await Linking.canOpenURL(fallback);
        if (!canOpenFallback) {
          throw new Error("Cannot open WhatsApp link");
        }
        await Linking.openURL(fallback);
      } else {
        await Linking.openURL(url);
      }
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
      behavior={Platform.OS === "ios" ? (avoidKeyboard ? "padding" : undefined) : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 120 : 0}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: contentBottomPadding },
        ]}
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInset={{ bottom: contentBottomPadding }}
        scrollIndicatorInsets={{ bottom: contentBottomPadding }}
        alwaysBounceVertical
        onLayout={(event) => setScrollViewHeight(event.nativeEvent.layout.height)}
      >
        <Text style={styles.title}>Add Order</Text>
        <View style={styles.modeRow}>
          {(["order", "payment", "return"] as const).map((mode) => (
            <Pressable
              key={mode}
              onPress={() => setEntryMode(mode)}
              style={[styles.modeButton, entryMode === mode && styles.modeButtonActive]}
            >
              <Text style={[styles.modeText, entryMode === mode && styles.modeTextActive]}>
                {mode === "order" ? "Order" : mode === "payment" ? "Payment" : "Return"}
              </Text>
            </Pressable>
          ))}
        </View>
      {entryMode === "order" && !pricesConfigured && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Selling prices are not configured yet.</Text>
          <Pressable onPress={() => router.push("/add?prices=1")} style={styles.noticeButton}>
            <Text style={styles.noticeButtonText}>Set prices</Text>
          </Pressable>
        </View>
      )}
      {entryMode !== "payment" && inventoryInitBlocked && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Inventory not initialized. Set starting counts to add your first order.</Text>
          <Pressable onPress={() => setInitModalVisible(true)} style={styles.noticeButton}>
            <Text style={styles.noticeButtonText}>Initialize inventory</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.sectionCard}>
        <FieldLabel>Date & time</FieldLabel>
        {entryMode === "order" ? (
          <Controller
            control={control}
            name="delivered_at"
            rules={{ required: "Enter delivery date & time" }}
            render={() => (
              <View style={styles.row}>
                <Pressable
                  style={[
                    styles.input,
                    styles.half,
                    errors.delivered_at && styles.inputError,
                  ]}
                  onPress={openActiveDate}
                >
                  <Text style={styles.dateText}>{activeDate}</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.input,
                    styles.half,
                    errors.delivered_at && styles.inputError,
                  ]}
                  onPress={openActiveTime}
                >
                  <Text style={styles.dateText}>{activeTime}</Text>
                </Pressable>
                <Pressable style={styles.nowButton} onPress={setActiveNow}>
                  <Text style={styles.nowButtonText}>Now</Text>
                </Pressable>
              </View>
            )}
          />
        ) : (
          <View style={styles.row}>
            <Pressable style={[styles.input, styles.half]} onPress={openActiveDate}>
              <Text style={styles.dateText}>{activeDate}</Text>
            </Pressable>
            <Pressable style={[styles.input, styles.half]} onPress={openActiveTime}>
              <Text style={styles.dateText}>{activeTime}</Text>
            </Pressable>
            <Pressable style={styles.nowButton} onPress={setActiveNow}>
              <Text style={styles.nowButtonText}>Now</Text>
            </Pressable>
          </View>
        )}
        {entryMode === "order" ? (
          <FieldError message={errors.delivered_at?.message} />
        ) : null}
      </View>
      {entryMode === "order" ? (
        <View style={styles.sectionCard}>
          <FieldLabel>Order Mode</FieldLabel>
          <View style={styles.modeRow}>
            {(["replacement", "sell_iron", "buy_iron"] as const).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => setOrderMode(mode)}
                style={[styles.modeButton, orderMode === mode && styles.modeButtonActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: orderMode === mode }}
                accessibilityLabel={`Order mode ${mode}`}
              >
                <Text style={[styles.modeText, orderMode === mode && styles.modeTextActive]}>
                  {mode === "replacement"
                    ? "Replacement"
                    : mode === "sell_iron"
                      ? "Selling"
                      : "Buying"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.sectionCard}>
        <FieldLabel>Customer</FieldLabel>
        <Pressable
          style={styles.inputRow}
          onPress={() => {
            if (!customerInputArmed) {
              setIsCustomerSearchOpen(true);
              setCustomerInputArmed(true);
              setCustomerTyping(false);
              setAvoidKeyboard(false);
              Keyboard.dismiss();
              return;
            }
            setCustomerTyping(true);
            setAvoidKeyboard(true);
            setIsCustomerSearchOpen(true);
            setTimeout(() => searchInputRef.current?.focus(), 10);
          }}
        >
          <View style={styles.inputFlex} pointerEvents={customerInputArmed ? "auto" : "none"}>
            <TextInput
              style={[styles.input, styles.inputFlex]}
              placeholder="Search customer"
              value={customerSearch}
              onChangeText={(text) => {
                setCustomerTyping(true);
                setIsCustomerSearchOpen(true);
                setCustomerSearch(text);
              }}
              ref={searchInputRef}
              onFocus={() => {
                setCustomerTyping(true);
                setIsCustomerSearchOpen(true);
                setAvoidKeyboard(true);
              }}
              onBlur={() => {
                setCustomerTyping(false);
                setCustomerInputArmed(false);
                if (!customerSearchTerm) {
                  setTimeout(() => setIsCustomerSearchOpen(false), 150);
                }
              }}
              {...doneInputProps}
            />
          </View>
          {selectedCustomerEntry ? (
            <Pressable
              style={styles.clearButton}
              onPress={() => {
                setValue("customer_id", "");
                setCustomerSearch("");
                setIsCustomerSearchOpen(false);
                setCustomerInputArmed(false);
                setCustomerTyping(false);
                setAvoidKeyboard(false);
                Keyboard.dismiss();
              }}
              accessibilityRole="button"
              accessibilityLabel="Clear customer"
            >
              <Ionicons name="close" size={16} color="#0f172a" />
            </Pressable>
          ) : null}
        </Pressable>

        <Controller
          control={control}
          name="customer_id"
          rules={{ required: "Select a customer" }}
          render={({ field: { onChange, value } }) => (
            isCustomerSearchOpen ? (
              <View style={styles.customerList}>
                {customerSearchTerm && !hasExactCustomerMatch ? (
                  <Pressable
                    style={styles.addCustomerButton}
                    onPress={() => {
                      setIsCustomerSearchOpen(false);
                      setCustomerInputArmed(false);
                      setCustomerTyping(false);
                      setAvoidKeyboard(false);
                      Keyboard.dismiss();
                      router.push("/customers/new");
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Add a new customer"
                  >
                    <Text style={styles.addCustomerButtonText}>+ Add a new customer</Text>
                  </Pressable>
                ) : null}
                {customerOptions.map((c) => {
                  const selected = value === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => {
                        onChange(c.id);
                        setCustomerSearch(c.name);
                        setIsCustomerSearchOpen(false);
                        setCustomerInputArmed(false);
                        setCustomerTyping(false);
                        setAvoidKeyboard(false);
                        Keyboard.dismiss();
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Customer ${c.name}`}
                      accessibilityHint="Select customer"
                      ref={(node) => {
                        if (node && selected) inputRefs.current.customer_id = node as unknown as TextInput;
                      }}
                      style={[styles.customerOption, selected && styles.customerOptionActive]}
                    >
                      <View style={styles.customerOptionRow}>
                        <Text style={[styles.customerOptionName, selected && styles.customerOptionNameActive]}>
                          {c.name}
                        </Text>
                        {c.note ? (
                          <Text
                            style={[styles.customerOptionNote, selected && styles.customerOptionNoteActive]}
                            numberOfLines={1}
                          >
                            {c.note}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null
          )}
        />
        <FieldError message={errors.customer_id?.message} />
      </View>
      {hasCustomer && customerAlertLines.length > 0 ? (
        <View style={styles.alertBox}>
          {customerAlertLines.map((line) => (
            <Text key={line} style={styles.alertText}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}

      {entryMode === "order" && hasCustomer ? (
        <>
          {orderMode === "replacement" ? (
            <>
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <FieldLabel>System</FieldLabel>
                  <Pressable
                    style={styles.sectionHeaderButton}
                    onPress={() => {
                      if (!selectedCustomer) return;
                      router.push(`/customers/${selectedCustomer}/edit`);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Update systems"
                  >
                    <Text style={styles.sectionHeaderButtonText}>Update</Text>
                  </Pressable>
                </View>
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
                            if (node && value === s.id) {
                              inputRefs.current.system_id = node as unknown as TextInput;
                            }
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
                      {allowedGasTypes.map((g) => (
                        <Pressable
                          key={g}
                          onPress={() => onChange(g)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: value === g }}
                          accessibilityLabel={`Gas type ${g}`}
                          accessibilityHint="Select gas type"
                          ref={(node) => {
                            if (node && value === g) {
                              inputRefs.current.gas_type = node as unknown as TextInput;
                            }
                          }}
                          style={[
                            styles.chip,
                            value === g && {
                              backgroundColor: gasColor(g),
                              borderColor: gasColor(g),
                            },
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
            </>
          ) : null}

      <View
        onLayout={(event) => {
          setAmountsLayoutY(event.nativeEvent.layout.y);
        }}
      >
        <View style={styles.fieldBox}>
          {orderMode === "replacement" ? (
            <>
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
                        validate: (val) => {
                          const count = Number(val) || 0;
                          if (orderMode === "buy_iron") return true;
                          if (count <= 0) return "Installed must be greater than 0";
                          return true;
                        },
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
                          {...doneInputProps}
                          ref={(node) => (inputRefs.current.cylinders_installed = node)}
                          onFocus={() => {
                            setAvoidKeyboard(true);
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
                          {...doneInputProps}
                          ref={(node) => (inputRefs.current.cylinders_received = node)}
                          onFocus={() => {
                            setAvoidKeyboard(true);
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
                        {...doneInputProps}
                        ref={(node) => (inputRefs.current.price_total = node)}
                        onFocus={() => {
                          setAvoidKeyboard(true);
                          setFocusTarget("payments");
                        }}
                        onBlur={() => setFocusTarget(null)}
                        onChangeText={(t) => {
                          setManualPrice(true);
                          field.onChange(t);
                          setValue("paid_amount", t);
                        }}
                      />
                    )}
                  />
                </View>

                <View style={styles.amountCell}>
                  <Text style={styles.fieldName}>Paid</Text>
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
                          errors.paid_amount && styles.inputError,
                        ]}
                        accessibilityLabel="Paid amount"
                        accessibilityHint="Enter amount paid"
                        keyboardType="numeric"
                        inputMode="numeric"
                        placeholder="0"
                        value={field.value}
                        {...doneInputProps}
                        ref={(node) => (inputRefs.current.paid_amount = node)}
                        onFocus={() => {
                          setAvoidKeyboard(true);
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
            </>
          ) : (
            <>
              <View style={styles.amountsRow}>
                <View style={styles.amountCell}>
                  <Text style={styles.fieldName}>
                    {orderMode === "buy_iron" ? "Empty qty" : "Full qty"}
                  </Text>
                  <View style={styles.amountGroup}>
                    <Pressable style={styles.stepperBtn} onPress={() => adjustTradeQuantity(-1)}>
                      <Ionicons name="remove" size={10} color="#0a7ea4" />
                    </Pressable>
                    <TextInput
                      style={[styles.input, styles.amountInput]}
                      accessibilityLabel="Quantity"
                      accessibilityHint="Enter quantity"
                      keyboardType="numeric"
                      inputMode="numeric"
                      placeholder="0"
                      value={tradeQuantity}
                      {...doneInputProps}
                      onFocus={() => {
                        setAvoidKeyboard(true);
                        setFocusTarget("amounts");
                        scrollToAmountsAndTotals();
                      }}
                      onBlur={() => setFocusTarget(null)}
                      onChangeText={setTradeQuantity}
                    />
                    <Pressable style={styles.stepperBtn} onPress={() => adjustTradeQuantity(1)}>
                      <Ionicons name="add" size={10} color="#0a7ea4" />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.amountCell}>
                  <Text style={styles.fieldName}>Price per unit</Text>
                  <TextInput
                    style={[styles.input, styles.amountInput]}
                    accessibilityLabel="Price per unit"
                    accessibilityHint="Enter price per unit"
                    keyboardType="numeric"
                    inputMode="numeric"
                    placeholder="0"
                    value={tradeUnitPrice}
                    {...doneInputProps}
                    onFocus={() => {
                      setAvoidKeyboard(true);
                      setFocusTarget("payments");
                    }}
                    onBlur={() => setFocusTarget(null)}
                    onChangeText={setTradeUnitPrice}
                  />
                </View>

                <View style={styles.amountCell}>
                  <Text style={styles.fieldName}>Total (₪)</Text>
                  <TextInput
                    style={[styles.input, styles.inputReadOnly]}
                    value={tradeSignedTotal.toString()}
                    editable={false}
                    placeholder="0"
                  />
                </View>
              </View>
              <View style={[styles.amountsRow, showStickyPayment ? styles.hidden : undefined]}>
                <View style={styles.amountCell}>
                  <Text style={styles.fieldName}>Paid</Text>
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
                          errors.paid_amount && styles.inputError,
                        ]}
                        accessibilityLabel="Paid amount"
                        accessibilityHint="Enter amount paid"
                        keyboardType="numeric"
                        inputMode="numeric"
                        placeholder="0"
                        value={field.value}
                        {...doneInputProps}
                        onFocus={() => {
                          setAvoidKeyboard(true);
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
            </>
          )}
          {selectedCustomerEntry ? <BalancePreviewCard lines={orderBalanceLines} /> : null}
        </View>
        <FieldError message={errors.cylinders_installed?.message} />
        <FieldError message={errors.cylinders_received?.message} />
        <FieldError message={errors.price_total?.message} />
        <FieldError message={errors.paid_amount?.message} />
      </View>

      <View style={styles.sectionCard}>
        <FieldLabel>Note (optional)</FieldLabel>
        <Controller
          control={control}
          name="note"
          render={({ field }) => (
            <TextInput
              style={styles.input}
              placeholder="Optional note"
              value={field.value}
              onChangeText={field.onChange}
              onFocus={() => {
                setAvoidKeyboard(true);
                setFocusTarget(null);
              }}
              {...doneInputProps}
            />
          )}
        />
      </View>

      <Modal visible={whatsappOpen} transparent animationType="fade" onRequestClose={exitAfterWhatsApp}>
        <Pressable style={styles.whatsappOverlay} onPress={exitAfterWhatsApp}>
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
        </>
      ) : null}

      {entryMode === "payment" && hasCustomer ? (
        <>
          <View style={styles.sectionCard}>
            <FieldLabel>Payment amount</FieldLabel>
            
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              inputMode="numeric"
              placeholder="0"
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              onFocus={() => {
                setAvoidKeyboard(true);
                setFocusTarget(null);
              }}
              {...doneInputProps}
            />
          </View>

          {selectedCustomerEntry ? <BalancePreviewCard lines={paymentBalanceLines} /> : null}
          <View style={styles.sectionCard}>
            <FieldLabel>Note (optional)</FieldLabel>
            <TextInput
              style={styles.input}
              placeholder="Optional note"
              value={collectionNote}
              onChangeText={setCollectionNote}
              onFocus={() => {
                setAvoidKeyboard(true);
                setFocusTarget(null);
              }}
              {...doneInputProps}
            />
          </View>

          
        </>
      ) : null}

      {entryMode === "return" && hasCustomer ? (
        <>
          <View style={styles.sectionCard}>
            <FieldLabel>Return empties</FieldLabel>
            <View style={styles.row}>
              <View style={styles.half}>
                <FieldLabel>12kg</FieldLabel>
                <View style={styles.amountGroup}>
                  <Pressable style={styles.stepperBtn} onPress={() => adjustReturn12(-1)}>
                    <Ionicons name="remove" size={10} color="#0a7ea4" />
                  </Pressable>
                  <TextInput
                    style={[styles.input, styles.amountInput]}
                    keyboardType="numeric"
                    inputMode="numeric"
                    placeholder="0"
                    value={return12}
                    onChangeText={setReturn12}
                    onFocus={() => setAvoidKeyboard(true)}
                    {...doneInputProps}
                  />
                  <Pressable style={styles.stepperBtn} onPress={() => adjustReturn12(1)}>
                    <Ionicons name="add" size={10} color="#0a7ea4" />
                  </Pressable>
                </View>
              </View>
              <View style={styles.half}>
                <FieldLabel>48kg</FieldLabel>
                <View style={styles.amountGroup}>
                  <Pressable style={styles.stepperBtn} onPress={() => adjustReturn48(-1)}>
                    <Ionicons name="remove" size={10} color="#0a7ea4" />
                  </Pressable>
                  <TextInput
                    style={[styles.input, styles.amountInput]}
                    keyboardType="numeric"
                    inputMode="numeric"
                    placeholder="0"
                    value={return48}
                    onChangeText={setReturn48}
                    onFocus={() => setAvoidKeyboard(true)}
                    {...doneInputProps}
                  />
                  <Pressable style={styles.stepperBtn} onPress={() => adjustReturn48(1)}>
                    <Ionicons name="add" size={10} color="#0a7ea4" />
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          {selectedCustomerEntry ? <BalancePreviewCard lines={returnBalanceLines} /> : null}

          <View style={styles.sectionCard}>
            <FieldLabel>Note (optional)</FieldLabel>
            <TextInput
              style={styles.input}
              placeholder="Optional note"
              value={collectionNote}
              onChangeText={setCollectionNote}
              onFocus={() => setAvoidKeyboard(true)}
              {...doneInputProps}
            />
          </View>
        </>
      ) : null}

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
        visible={collectionDateOpen}
        value={collectionDate}
        maxDate={new Date()}
        onSelect={(next) => setCollectionDate(next)}
        onClose={() => setCollectionDateOpen(false)}
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
      <TimePickerModal
        visible={collectionTimeOpen}
        value={collectionTime}
        onSelect={(next) => setCollectionTime(next)}
        onClose={() => setCollectionTimeOpen(false)}
      />
      </ScrollView>
      {hasCustomer ? (
        <>
      <View style={[styles.stickyFooter, { bottom: 0 }]}>
            {entryMode === "order" ? (
              <View style={styles.footerRow}>
                <Pressable
                  onPress={handleSaveAndAddAnother}
                  disabled={submitting || orderSaveDisabled}
                  style={[
                    styles.footerSecondary,
                    (submitting || orderSaveDisabled) && styles.footerButtonDisabled,
                  ]}
                >
                  <Text style={styles.footerSecondaryText}>Save & Add Another</Text>
                </Pressable>
                <Pressable
                  onPress={handleSaveOrder}
                  disabled={submitting || orderSaveDisabled}
                  style={[
                    styles.footerPrimary,
                    (submitting || orderSaveDisabled) && styles.footerButtonDisabled,
                  ]}
                >
                  <Text style={styles.footerPrimaryText}>
                    {submitting ? "Saving..." : "Save Order"}
                  </Text>
                </Pressable>
              </View>
            ) : entryMode === "payment" ? (
              <View style={styles.footerRow}>
                <Pressable
                  onPress={handleSavePaymentAndAddAnother}
                  disabled={collectionBusy}
                  style={[styles.footerSecondary, collectionBusy && styles.footerButtonDisabled]}
                >
                  <Text style={styles.footerSecondaryText}>Save & Add Another</Text>
                </Pressable>
                <Pressable
                  onPress={handleSavePayment}
                  disabled={collectionBusy}
                  style={[styles.footerPrimary, collectionBusy && styles.footerButtonDisabled]}
                >
                  <Text style={styles.footerPrimaryText}>
                    {collectionBusy ? "Saving..." : "Save Payment"}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.footerRow}>
                <Pressable
                  onPress={handleSaveReturnAndAddAnother}
                  disabled={collectionBusy}
                  style={[styles.footerSecondary, collectionBusy && styles.footerButtonDisabled]}
                >
                  <Text style={styles.footerSecondaryText}>Save & Add Another</Text>
                </Pressable>
                <Pressable
                  onPress={handleSaveReturn}
                  disabled={collectionBusy}
                  style={[styles.footerPrimary, collectionBusy && styles.footerButtonDisabled]}
                >
                  <Text style={styles.footerPrimaryText}>
                    {collectionBusy ? "Saving..." : "Save Return"}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
          {showStickyPayment && (
            <View
              style={[styles.stickyPayment, { bottom: footerHeight + 8 }]}
            >
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
        </>
      ) : null}
      {Platform.OS === "ios" && orderAccessoryId ? (
        <InputAccessoryView nativeID={orderAccessoryId}>
          <View style={styles.accessoryRow}>
            <Pressable onPress={() => Keyboard.dismiss()} style={styles.accessoryButton}>
              <Text style={styles.accessoryText}>Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
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

function BalancePreviewCard({ lines }: { lines: string[] }) {
  return (
    <View style={styles.balancePreviewCard}>
      <Text style={styles.balancePreviewTitle}>New Balance</Text>
      {lines.map((line) => (
        <Text key={line} style={styles.balancePreviewLine}>
          {line}
        </Text>
      ))}
    </View>
  );
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
  const monthLabel = formatDateLocale(month, { month: "long", year: "numeric" }, "en-US");
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
  modeRow: { flexDirection: "row", gap: 8, marginTop: 6, marginBottom: 2 },
  modeButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
  },
  modeButtonActive: { backgroundColor: "#0a7ea4" },
  modeText: { fontWeight: "700", color: "#1f2937" },
  modeTextActive: { color: "#fff" },
  label: { fontWeight: "700", marginTop: 6, color: "#0f172a" },
  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  balancePreviewCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 10,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  balancePreviewTitle: { fontSize: 12, fontWeight: "800", color: "#0f172a" },
  balancePreviewLine: { fontSize: 12, fontWeight: "700", color: "#0f172a" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { padding: 10, borderRadius: 12, backgroundColor: "#eef2f6" },
  chipActive: { backgroundColor: "#0a7ea4" },
  chipInactive: { opacity: 0.4 },
  chipText: { fontWeight: "600", color: "#1f2937" },
  chipTextActive: { color: "#fff" },
  customerList: { gap: 8 },
  addCustomerButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#0a7ea4",
    backgroundColor: "#e6f3f8",
  },
  addCustomerButtonText: { color: "#0a7ea4", fontWeight: "700" },
  customerOption: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#eef2f6",
  },
  customerOptionActive: { backgroundColor: "#0a7ea4" },
  customerOptionRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  customerOptionName: { fontWeight: "700", color: "#1f2937" },
  customerOptionNameActive: { color: "#fff" },
  customerOptionNote: { fontSize: 12, color: "#64748b", flexShrink: 1 },
  customerOptionNoteActive: { color: "#dbeafe" },
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
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inputFlex: {
    flex: 1,
  },
  clearButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d7dde4",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
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
  nowButton: {
    alignSelf: "stretch",
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#0a7ea4",
    alignItems: "center",
    justifyContent: "center",
  },
  nowButtonText: { color: "#fff", fontWeight: "700" },
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
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionHeaderButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#e2e8f0",
  },
  sectionHeaderButtonText: {
    fontWeight: "700",
    color: "#0a7ea4",
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
  alertBox: {
    backgroundColor: "#fdecea",
    borderColor: "#f5c6cb",
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
    gap: 4,
  },
  alertText: { color: "#b00020", fontWeight: "700", fontSize: 12 },
  primary: {
    backgroundColor: "#0a7ea4",
    padding: 14,
    borderRadius: 12,
    marginTop: 16,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700" },
  stickyFooter: {
    position: "absolute",
    left: 16,
    right: 16,
  },
  footerRow: { flexDirection: "row", gap: 10 },
  footerPrimary: {
    flex: 1,
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  footerPrimaryText: { color: "#fff", fontWeight: "700" },
  footerSecondary: {
    flex: 1,
    borderColor: "#cbd5e1",
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  footerSecondaryText: { color: "#0a7ea4", fontWeight: "700" },
  footerButtonDisabled: { opacity: 0.6 },
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
  whatsappOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
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
