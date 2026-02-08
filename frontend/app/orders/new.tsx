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
import { buildHappenedAt, formatDateLocale } from "@/lib/date";
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
type ActionMode = "replacement" | "payment" | "return" | "sell_iron" | "buy_iron";

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
    getValues,
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
  const [paymentDirection, setPaymentDirection] = useState<"receive" | "payout">("receive");
  const [customerSearch, setCustomerSearch] = useState("");
  const searchInputRef = useRef<TextInput | null>(null);
  const [manualPrice, setManualPrice] = useState(false);
  const [whatsappOrderId, setWhatsappOrderId] = useState<string | null>(null);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [whatsappBusy, setWhatsappBusy] = useState(false);
  const [gasPriceInput, setGasPriceInput] = useState("");
  const [gasPriceDirty, setGasPriceDirty] = useState(false);
  const [ironPriceInput, setIronPriceInput] = useState("");
  const [ironPriceDirty, setIronPriceDirty] = useState(false);
  const [paidDirty, setPaidDirty] = useState(false);
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

  const currentAction: ActionMode = entryMode === "order" ? orderMode : entryMode;
  const setActionMode = (mode: ActionMode) => {
    if (mode === "payment" || mode === "return") {
      setEntryMode(mode);
      return;
    }
    setEntryMode("order");
    setOrderMode(mode);
  };
  const isOrderAction =
    currentAction === "replacement" || currentAction === "sell_iron" || currentAction === "buy_iron";
  const isSellIron = currentAction === "sell_iron";
  const isBuyIron = currentAction === "buy_iron";
  const isPayment = currentAction === "payment";
  const isReturn = currentAction === "return";
  const showStickyPayment =
    focusTarget === "amounts" && effectiveKeyboardHeight > 0 && currentAction === "replacement";

  const installed = Number(watch("cylinders_installed")) || 0;
  const received = Number(watch("cylinders_received")) || 0;
  const totalAmount = Number(watch("price_total")) || 0;
  const paidInput = Number(watch("paid_amount")) || 0;
  const cylinderResult =
    currentAction === "replacement" || currentAction === "return" ? installed - received : 0;
  const moneyDelta =
    currentAction === "buy_iron"
      ? paidInput - totalAmount
      : currentAction === "payment" && paymentDirection === "payout"
        ? paidInput
        : totalAmount - paidInput;
  const canEditInstalled = currentAction === "replacement" || isSellIron;
  const canEditReceived = currentAction === "replacement" || isBuyIron || isReturn;
  const canEditTotal = currentAction === "replacement";
  const canEditPaid = !isReturn;
  const showTotalStepper = true;
  const showPaidStepper = true;
  const unpaid = moneyDelta;
  const moneyDeltaAbs = Math.abs(unpaid);
  const moneyDeltaIsOutflow = unpaid < 0;
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
    if (currentAction !== "replacement") {
      return ["12kg", "48kg"] as GasType[];
    }
    const systemGas = selectedSystem?.gas_type as GasType | undefined;
    if (systemGas === "12kg" || systemGas === "48kg") {
      return [systemGas];
    }
    return ["12kg", "48kg"] as GasType[];
  }, [currentAction, selectedSystem]);
  const selectedCustomerEntry = useMemo(
    () => (customersQuery.data ?? []).find((c) => c.id === selectedCustomer),
    [customersQuery.data, selectedCustomer]
  );
  const hasCustomer = Boolean(selectedCustomerEntry);
  const showOrderTabs = hasCustomer;
  const showSystemSection = hasCustomer && currentAction === "replacement";
  const showOrderDetails =
    hasCustomer && (currentAction !== "replacement" || Boolean(selectedSystemId));
  const balanceBefore = selectedCustomerEntry?.money_balance ?? 0;
  const balanceAfter = balanceBefore + unpaid;
  const cylinder12Before = selectedCustomerEntry?.cylinder_balance_12kg ?? 0;
  const cylinder48Before = selectedCustomerEntry?.cylinder_balance_48kg ?? 0;
  const hasMoneyDebt = balanceBefore > 0;
  const hasMoneyCredit = balanceBefore < 0;
  const paymentTabEnabled = hasMoneyDebt || hasMoneyCredit;
  const receivePaymentDisabled = balanceBefore <= 0;
  const payoutPaymentDisabled = balanceBefore >= 0;
  const hasReturnDebt12 = cylinder12Before > 0;
  const hasReturnDebt48 = cylinder48Before > 0;
  const returnTabEnabled = hasReturnDebt12 || hasReturnDebt48;
  const orderCylinderDelta =
    currentAction === "replacement" || currentAction === "return" ? cylinderResult : 0;
  const orderCylinderAfter12 =
    selectedGas === "12kg" ? cylinder12Before + orderCylinderDelta : cylinder12Before;
  const orderCylinderAfter48 =
    selectedGas === "48kg" ? cylinder48Before + orderCylinderDelta : cylinder48Before;
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
  const customerAlertLines = useMemo(() => {
    if (!selectedCustomerEntry) return [];
    const formatMoneyDebtLine = (value: number) => {
      if (value > 0) return `Customer must pay you ${formatMoneyAmount(value)}`;
      if (value < 0) return `You must pay the customer ${formatMoneyAmount(value)}`;
      return "Money debt: 0";
    };
    const formatCylinderDebtLine = (value: number, label: "12kg" | "48kg") => {
      if (value > 0) return `Customer must return ${Math.abs(value)}x ${label}`;
      if (value < 0) return `You must give the customer ${Math.abs(value)}x ${label}`;
      return `${label} debt: 0x`;
    };

    if (isPayment) {
      const paymentDelta = paymentDirection === "payout" ? paidInput : -paidInput;
      const paymentAfter = balanceBefore + paymentDelta;
      if (paidInput <= 0) {
        return [formatMoneyDebtLine(balanceBefore)];
      }
      if (paymentAfter > 0) {
        return [`After payment, customer still owes ${formatMoneyAmount(paymentAfter)}`];
      }
      if (paymentAfter < 0) {
        return [`After payment, you owe the customer ${formatMoneyAmount(paymentAfter)}`];
      }
      return ["After payment, balance is settled"];
    }
    if (isReturn) {
      return [
        formatCylinderDebtLine(orderCylinderAfter12, "12kg"),
        formatCylinderDebtLine(orderCylinderAfter48, "48kg"),
      ];
    }

    return [
      formatMoneyDebtLine(balanceAfter),
      formatCylinderDebtLine(orderCylinderAfter12, "12kg"),
      formatCylinderDebtLine(orderCylinderAfter48, "48kg"),
    ];
  }, [
    balanceAfter,
    isPayment,
    isReturn,
    orderCylinderAfter12,
    orderCylinderAfter48,
    paymentDirection,
    selectedCustomerEntry,
    formatMoneyAmount,
  ]);

  const balancePreviewLines = useMemo(() => {
    if (!selectedCustomerEntry) return [];
    const lines: string[] = [];
    if (!isReturn) {
      lines.push(`Money: ${formatSignedMoney(balanceBefore)} -> ${formatSignedMoney(balanceAfter)}`);
    }
    if (!isPayment) {
      lines.push(
        `12kg: ${formatSignedCylinder(cylinder12Before, "12kg")} -> ${formatSignedCylinder(
          orderCylinderAfter12,
          "12kg"
        )}`
      );
      lines.push(
        `48kg: ${formatSignedCylinder(cylinder48Before, "48kg")} -> ${formatSignedCylinder(
          orderCylinderAfter48,
          "48kg"
        )}`
      );
    }
    return lines;
  }, [
    balanceAfter,
    balanceBefore,
    cylinder12Before,
    cylinder48Before,
    isPayment,
    isReturn,
    orderCylinderAfter12,
    orderCylinderAfter48,
    selectedCustomerEntry,
    formatSignedMoney,
    formatSignedCylinder,
  ]);

  const adjustPriceTotal = (delta: number) => {
    if (!canEditTotal) return;
    const current = Number(watch("price_total")) || 0;
    const next = Math.max(0, current + delta);
    setManualPrice(true);
    setValue("price_total", String(next));
    if (!paidDirty) {
      setValue("paid_amount", String(next));
    }
  };

  const adjustPaidAmount = (delta: number) => {
    if (!canEditPaid) return;
    const current = Number(watch("paid_amount")) || 0;
    const next = Math.max(0, current + delta);
    setPaidDirty(true);
    setValue("paid_amount", String(next));
  };

  const adjustGasPrice = (delta: number) => {
    const current = Number(gasPriceInput) || 0;
    const next = Math.max(0, current + delta);
    setGasPriceDirty(true);
    setGasPriceInput(String(next));
  };

  const adjustIronPrice = (delta: number) => {
    const current = Number(ironPriceInput) || 0;
    const next = Math.max(0, current + delta);
    setIronPriceDirty(true);
    setIronPriceInput(String(next));
  };

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
    setGasPriceInput("");
    setGasPriceDirty(false);
    setIronPriceInput("");
    setIronPriceDirty(false);
    setPaidDirty(false);
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
    if (currentAction === "replacement") return;
    if (isPayment) return;
    if (!selectedGas) {
      setValue("gas_type", "12kg");
    }
    if ((isSellIron || isBuyIron) && !selectedSystemId && systemOptions.length > 0) {
      const fallback = systemOptions.find((s) => s.is_active) ?? systemOptions[0];
      if (fallback) {
        setValue("system_id", fallback.id);
      }
    }
  }, [
    currentAction,
    isPayment,
    isSellIron,
    isBuyIron,
    selectedCustomer,
    selectedGas,
    selectedSystemId,
    systemOptions,
    setValue,
  ]);

  useEffect(() => {
    if (currentAction !== "replacement") return;
    if (!selectedSystem) return;
    if (!allowedGasTypes.length) return;
    if (!selectedGas || !allowedGasTypes.includes(selectedGas)) {
      setValue("gas_type", allowedGasTypes[0]);
    }
  }, [allowedGasTypes, currentAction, selectedGas, selectedSystem, setValue]);

  useEffect(() => {
    if (!isReturn) return;
    if (!selectedGas) return;
    if (selectedGas === "12kg" && !hasReturnDebt12 && hasReturnDebt48) {
      setValue("gas_type", "48kg");
    }
    if (selectedGas === "48kg" && !hasReturnDebt48 && hasReturnDebt12) {
      setValue("gas_type", "12kg");
    }
  }, [hasReturnDebt12, hasReturnDebt48, isReturn, selectedGas, setValue]);

  useEffect(() => {
    if (!isPayment) return;
    if (balanceBefore > 0) {
      setPaymentDirection("receive");
      return;
    }
    if (balanceBefore < 0) {
      setPaymentDirection("payout");
    }
  }, [balanceBefore, isPayment]);

  /* -------------------- pricing -------------------- */

  const unitPrice = useMemo(() => {
    const prices = pricesQuery.data ?? [];
    const match = prices
      .filter((p) => p.gas_type === selectedGas)
      .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
    return match?.selling_price ?? 0;
  }, [pricesQuery.data, selectedGas]);

  const ironSellPrice = useMemo(() => {
    const prices = pricesQuery.data ?? [];
    const match = prices
      .filter((p) => p.gas_type === selectedGas)
      .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
    return match?.selling_iron_price ?? 0;
  }, [pricesQuery.data, selectedGas]);

  const ironBuyPrice = useMemo(() => {
    const prices = pricesQuery.data ?? [];
    const match = prices
      .filter((p) => p.gas_type === selectedGas)
      .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
    return match?.buying_iron_price ?? 0;
  }, [pricesQuery.data, selectedGas]);
  const gasUnitPriceValue = Number(gasPriceInput) || unitPrice;
  const ironUnitPriceValue =
    Number(ironPriceInput) || (isSellIron ? ironSellPrice : ironBuyPrice);
  const gasLineTotal = isSellIron ? installed * gasUnitPriceValue : 0;
  const ironLineTotal =
    (isSellIron ? installed : isBuyIron ? received : 0) * ironUnitPriceValue;
  const computedTradeTotal = isSellIron
    ? gasLineTotal + ironLineTotal
    : isBuyIron
      ? ironLineTotal
      : 0;
  const orderSaveDisabled =
    isOrderAction &&
    ((currentAction === "replacement" && installed <= 0) ||
      (isSellIron && (installed <= 0 || gasUnitPriceValue <= 0 || ironUnitPriceValue <= 0)) ||
      (isBuyIron && (received <= 0 || ironUnitPriceValue <= 0)));

  /* -------------------- effects -------------------- */

  useEffect(() => {
    if (!isSellIron) return;
    if (gasPriceDirty) return;
    if (unitPrice > 0) {
      setGasPriceInput(String(unitPrice));
    }
  }, [gasPriceDirty, isSellIron, unitPrice]);

  useEffect(() => {
    if (!isSellIron && !isBuyIron) return;
    if (ironPriceDirty) return;
    const nextDefault = isSellIron ? ironSellPrice : ironBuyPrice;
    if (nextDefault > 0) {
      setIronPriceInput(String(nextDefault));
    }
  }, [ironBuyPrice, ironPriceDirty, ironSellPrice, isBuyIron, isSellIron]);

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

  const previousSystemRef = useRef<string | undefined>();
  // System selection sets defaults ONCE
  useEffect(() => {
    if (currentAction !== "replacement") return;
    if (!selectedSystem) return;
    const systemId = selectedSystem.id;
    if (previousSystemRef.current === systemId) return;
    previousSystemRef.current = systemId;

    const nextGas = allowedGasTypes[0] ?? "12kg";
    setValue("gas_type", selectedGas && allowedGasTypes.includes(selectedGas) ? selectedGas : nextGas);
    setValue("cylinders_installed", "1");
    setValue("cylinders_received", "1");

    const total = unitPrice;
    setValue("price_total", String(total));
    if (!paidDirty) {
      setValue("paid_amount", String(total));
    }
    setManualPrice(false);
    setPaidDirty(false);
  }, [allowedGasTypes, currentAction, selectedGas, selectedSystem, unitPrice, setValue]);

  // Installed drives total + payment (unless manually overridden)
  useEffect(() => {
    if (currentAction !== "replacement") return;
    if (manualPrice) return;
    if (installed <= 0) return;

    const total = installed * unitPrice;
    setValue("price_total", String(total));
    if (!paidDirty) {
      setValue("paid_amount", String(total));
    }
  }, [currentAction, installed, manualPrice, paidDirty, setValue, unitPrice]);

  useEffect(() => {
    const next = buildHappenedAt({ date: deliveryDate, time: deliveryTime });
    if (!next) return;
    setValue("delivered_at", next);
  }, [deliveryDate, deliveryTime, setValue]);

  useEffect(() => {
    if (!isSellIron && !isBuyIron) return;
    const nextTotal = computedTradeTotal;
    setValue("price_total", nextTotal ? String(nextTotal) : "0");
    if (!paidDirty) {
      setValue("paid_amount", nextTotal ? String(nextTotal) : "0");
    }
    setManualPrice(true);
  }, [computedTradeTotal, isBuyIron, isSellIron, paidDirty, setValue]);

  useEffect(() => {
    setPaidDirty(false);
    if (currentAction === "sell_iron") {
      setValue("cylinders_received", "0");
      setGasPriceDirty(false);
      setIronPriceDirty(false);
    }
    if (currentAction === "buy_iron") {
      setValue("cylinders_installed", "0");
      setIronPriceDirty(false);
    }
    if (currentAction === "payment") {
      setValue("cylinders_installed", "0");
      setValue("cylinders_received", "0");
      setValue("price_total", "0");
      setValue("paid_amount", "0");
      setManualPrice(false);
    }
    if (currentAction === "return") {
      setValue("cylinders_installed", "0");
      setValue("price_total", "0");
      setValue("paid_amount", "0");
      setManualPrice(false);
    }
    if (currentAction === "replacement") {
      setGasPriceDirty(false);
      setIronPriceDirty(false);
      setManualPrice(false);
    }
  }, [currentAction, setValue]);

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
    setGasPriceInput("");
    setGasPriceDirty(false);
    setIronPriceInput("");
    setIronPriceDirty(false);
    setPaidDirty(false);
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
    setCollectionDate(nextDate);
    setCollectionTime(nextTime);
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
    if (!values.system_id) {
      Alert.alert("Missing system", "Please add a system for this customer.");
      return;
    }
    const gasType = values.gas_type as GasType;
    const installedCount = Number(values.cylinders_installed) || 0;
    const receivedCount = Number(values.cylinders_received) || 0;
    if (orderMode !== "buy_iron" && installedCount <= 0) {
      Alert.alert(
        "Invalid installed count",
        "Orders must have at least 1 installed cylinder. For money-only or return-only actions, use the Payment or Return actions."
      );
      return;
    }
    if (orderMode === "sell_iron" || orderMode === "buy_iron") {
      const tradeCount = orderMode === "buy_iron" ? receivedCount : installedCount;
      if (tradeCount <= 0) {
        Alert.alert("Missing quantity", "Enter a quantity greater than 0.");
        return;
      }
      if (ironUnitPriceValue <= 0) {
        Alert.alert("Missing price", "Enter a price per unit.");
        return;
      }
    }
    const total = Number(values.price_total) || 0;
    const paid = Number(values.paid_amount) || 0;
    const moneyDeltaValue = orderMode === "buy_iron" ? paid - total : total - paid;
    const balanceBeforeValue = selectedCustomerEntry?.money_balance ?? 0;
    const balanceAfterValue = balanceBeforeValue + moneyDeltaValue;
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
      paid_amount: paid,
      debt_cash: balanceAfterValue,
      debt_cylinders_12: orderCylinderAfter12,
      debt_cylinders_48: orderCylinderAfter48,
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
      )} + ${moneyDeltaValue.toFixed(0)} = ${balanceAfterValue.toFixed(0)}`;
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
        "Orders must have at least 1 installed cylinder. For money-only or return-only actions, use the Payment or Return actions."
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
    const values = getValues();
    const paid = Number(values.paid_amount) || 0;
    if (paid <= 0) {
      Alert.alert("Missing amount", "Enter a payment amount.");
      return;
    }
    try {
      const effectiveAt = buildHappenedAt({ date: collectionDate, time: collectionTime });
      await createCollection.mutateAsync({
        customer_id: selectedCustomer,
        action_type: paymentDirection === "payout" ? "payout" : "payment",
        amount_money: paid,
        debt_cash: balanceAfter,
        debt_cylinders_12: cylinder12Before,
        debt_cylinders_48: cylinder48Before,
        effective_at: effectiveAt,
        note: values.note || undefined,
      });
      setValue("paid_amount", "");
      setValue("note", "");
      setPaidDirty(false);
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
    const values = getValues();
    if (!values.gas_type) {
      Alert.alert("Missing gas type", "Please select a gas type.");
      return;
    }
    const gasType = values.gas_type as GasType;
    const receivedCount = Number(values.cylinders_received) || 0;
    if (receivedCount <= 0) {
      Alert.alert("Missing counts", "Enter at least one cylinder count.");
      return;
    }
    try {
      const effectiveAt = buildHappenedAt({ date: collectionDate, time: collectionTime });
      await createCollection.mutateAsync({
        customer_id: selectedCustomer,
        action_type: "return",
        qty_12kg: gasType === "12kg" ? receivedCount : 0,
        qty_48kg: gasType === "48kg" ? receivedCount : 0,
        debt_cash: balanceBefore,
        debt_cylinders_12: orderCylinderAfter12,
        debt_cylinders_48: orderCylinderAfter48,
        effective_at: effectiveAt,
        note: values.note || undefined,
      });
      setValue("cylinders_received", "");
      setValue("note", "");
    } catch (err) {
      const axiosError = err as AxiosError;
      Alert.alert("Return failed", axiosError.response?.data?.detail ?? axiosError.message);
    }
  };

  const handleSavePayment = () => runSavePayment();
  const handleSavePaymentAndAddAnother = () => runSavePayment();
  const handleSaveReturn = () => runSaveReturn();
  const handleSaveReturnAndAddAnother = () => runSaveReturn();
  const savePrimaryLabel = isOrderAction
    ? "Save Order"
    : isPayment
      ? paymentDirection === "payout"
        ? "Save Payout"
        : "Save Payment"
      : "Save Return";
  const savePrimaryHandler = isOrderAction
    ? handleSaveOrder
    : isPayment
      ? handleSavePayment
      : handleSaveReturn;
  const saveSecondaryHandler = isOrderAction
    ? handleSaveAndAddAnother
    : isPayment
      ? handleSavePaymentAndAddAnother
      : handleSaveReturnAndAddAnother;
  const saveBusy = isOrderAction ? submitting : collectionBusy;
  const saveDisabled = isOrderAction ? submitting || orderSaveDisabled : collectionBusy;
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
    if (!(currentAction === "replacement" || isSellIron)) return;
    const current = Number(watch("cylinders_installed")) || 0;
    const next = Math.max(0, current + delta);
    setValue("cylinders_installed", String(next), { shouldDirty: true, shouldValidate: true });
    if (currentAction === "replacement") {
      setValue("cylinders_received", String(next), { shouldDirty: true, shouldValidate: true });
      setManualPrice(false);
    }
  };

  const adjustReceived = (delta: number) => {
    if (!(currentAction === "replacement" || isBuyIron || isReturn)) return;
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
      {showOrderTabs ? (
        <View style={styles.modeRow}>
          {(["replacement", "payment", "return", "sell_iron", "buy_iron"] as const).map((mode) => {
            const isDisabled =
              (mode === "payment" && !paymentTabEnabled) ||
              (mode === "return" && !returnTabEnabled);
            return (
            <Pressable
              key={mode}
              onPress={() => {
                if (isDisabled) return;
                setActionMode(mode);
              }}
              disabled={isDisabled}
              style={[
                styles.modeButton,
                currentAction === mode && styles.modeButtonActive,
                isDisabled && styles.modeButtonDisabled,
              ]}
            >
              <Text
                style={[
                  styles.modeText,
                  currentAction === mode && styles.modeTextActive,
                  isDisabled && styles.modeTextDisabled,
                ]}
              >
                {mode === "replacement"
                  ? "Replacement"
                  : mode === "sell_iron"
                    ? "Selling"
                    : mode === "buy_iron"
                      ? "Buying"
                      : mode === "payment"
                        ? "Payment"
                        : "Return"}
              </Text>
            </Pressable>
          )})}
        </View>
      ) : null}

      {showSystemSection ? (
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
      ) : null}

      {showOrderDetails ? (
        <>
          {isOrderAction && !pricesConfigured && (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>Selling prices are not configured yet.</Text>
              <Pressable onPress={() => router.push("/add?prices=1")} style={styles.noticeButton}>
                <Text style={styles.noticeButtonText}>Set prices</Text>
              </Pressable>
            </View>
          )}
          {!isPayment && inventoryInitBlocked && (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                Inventory not initialized. Set starting counts to add your first order.
              </Text>
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

          {isPayment ? (
            <View style={styles.sectionCard}>
              <FieldLabel>Payment direction</FieldLabel>
              <View style={styles.modeRow}>
                <Pressable
                  onPress={() => {
                    if (receivePaymentDisabled) return;
                    setPaymentDirection("receive");
                  }}
                  disabled={receivePaymentDisabled}
                  style={[
                    styles.modeButton,
                    paymentDirection === "receive" && styles.modeButtonActive,
                    receivePaymentDisabled && styles.modeButtonDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.modeText,
                      paymentDirection === "receive" && styles.modeTextActive,
                      receivePaymentDisabled && styles.modeTextDisabled,
                    ]}
                  >
                    Receive
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (payoutPaymentDisabled) return;
                    setPaymentDirection("payout");
                  }}
                  disabled={payoutPaymentDisabled}
                  style={[
                    styles.modeButton,
                    paymentDirection === "payout" && styles.modeButtonActive,
                    payoutPaymentDisabled && styles.modeButtonDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.modeText,
                      paymentDirection === "payout" && styles.modeTextActive,
                      payoutPaymentDisabled && styles.modeTextDisabled,
                    ]}
                  >
                    Payout
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {hasCustomer && customerAlertLines.length > 0 ? (
            <View style={styles.alertBox}>
              {customerAlertLines.map((line) => (
                <Text key={line} style={styles.alertText}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}

          {currentAction === "replacement" ? (
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
          ) : null}

          {currentAction !== "payment" && currentAction !== "replacement" ? (
            <View style={styles.sectionCard}>
              <FieldLabel>Gas Type</FieldLabel>
              <Controller
                control={control}
                name="gas_type"
                rules={{ required: "Pick a gas type" }}
                render={({ field: { onChange, value } }) => (
                  <View style={styles.chipRow}>
                    {allowedGasTypes.map((g) => (
                      (() => {
                        const isGasDisabled =
                          isReturn &&
                          ((g === "12kg" && !hasReturnDebt12) ||
                            (g === "48kg" && !hasReturnDebt48));
                        return (
                      <Pressable
                        key={g}
                        onPress={() => {
                          if (isGasDisabled) return;
                          onChange(g);
                        }}
                        disabled={isGasDisabled}
                        accessibilityRole="button"
                        accessibilityState={{ selected: value === g, disabled: isGasDisabled }}
                        accessibilityLabel={`Gas type ${g}`}
                        accessibilityHint="Select gas type"
                        ref={(node) => {
                          if (node && value === g) {
                            inputRefs.current.gas_type = node as unknown as TextInput;
                          }
                        }}
                        style={[
                          styles.chip,
                          isGasDisabled && styles.chipDisabled,
                          value === g && {
                            backgroundColor: gasColor(g),
                            borderColor: gasColor(g),
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            isGasDisabled && styles.chipTextDisabled,
                            value === g ? styles.chipTextActive : { color: gasColor(g) },
                          ]}
                        >
                          {g}
                        </Text>
                      </Pressable>
                        );
                      })()
                    ))}
                  </View>
                )}
              />
              <FieldError message={errors.gas_type?.message} />
            </View>
          ) : null}

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
                {canEditInstalled ? (
                  <Pressable style={styles.stepperBtn} onPress={() => adjustInstalled(-1)}>
                    <Ionicons name="remove" size={10} color="#0a7ea4" />
                  </Pressable>
                ) : (
                  <View style={styles.stepperGhost} />
                )}
                <Controller
                  control={control}
                  name="cylinders_installed"
                  rules={{
                    validate: (val) => {
                      const count = Number(val) || 0;
                      if ((currentAction === "replacement" || isSellIron) && count <= 0) {
                        return "Installed must be greater than 0";
                      }
                      return true;
                    },
                  }}
                  render={({ field }) => (
                    <TextInput
                      style={[
                        styles.input,
                        styles.amountInput,
                        !canEditInstalled && styles.inputReadOnly,
                        errors.cylinders_installed && styles.inputError,
                      ]}
                      accessibilityLabel="Installed cylinders"
                      accessibilityHint="Enter number of cylinders installed"
                      keyboardType="numeric"
                      inputMode="numeric"
                      placeholder="0"
                      value={field.value}
                      {...doneInputProps}
                      editable={canEditInstalled}
                      ref={(node) => (inputRefs.current.cylinders_installed = node)}
                      onFocus={() => {
                        if (!canEditInstalled) return;
                        setAvoidKeyboard(true);
                        setFocusTarget("amounts");
                        scrollToAmountsAndTotals();
                      }}
                      onBlur={() => setFocusTarget(null)}
                      onChangeText={(t) => {
                        field.onChange(t);
                        if (currentAction === "replacement") {
                          setValue("cylinders_received", t);
                          setManualPrice(false);
                        }
                      }}
                    />
                  )}
                />
                {canEditInstalled ? (
                  <Pressable style={styles.stepperBtn} onPress={() => adjustInstalled(1)}>
                    <Ionicons name="add" size={10} color="#0a7ea4" />
                  </Pressable>
                ) : (
                  <View style={styles.stepperGhost} />
                )}
              </View>
            </View>

            <View style={styles.amountCell}>
              <Text style={styles.fieldName}>Received</Text>
              <View style={styles.amountGroup}>
                {canEditReceived ? (
                  <Pressable style={styles.stepperBtn} onPress={() => adjustReceived(-1)}>
                    <Ionicons name="remove" size={10} color="#0a7ea4" />
                  </Pressable>
                ) : (
                  <View style={styles.stepperGhost} />
                )}
                <Controller
                  control={control}
                  name="cylinders_received"
                  rules={{
                    validate: (val) =>
                      (Number(val) || 0) >= 0 || "Received cannot be negative",
                  }}
                  render={({ field }) => (
                    <TextInput
                      style={[
                        styles.input,
                        styles.amountInput,
                        !canEditReceived && styles.inputReadOnly,
                        errors.cylinders_received && styles.inputError,
                      ]}
                      accessibilityLabel="Received cylinders"
                      accessibilityHint="Enter number of cylinders received"
                      keyboardType="numeric"
                      inputMode="numeric"
                      placeholder="0"
                      value={field.value}
                      {...doneInputProps}
                      editable={canEditReceived}
                      ref={(node) => (inputRefs.current.cylinders_received = node)}
                      onFocus={() => {
                        if (!canEditReceived) return;
                        setAvoidKeyboard(true);
                        setFocusTarget("amounts");
                        scrollToAmountsAndTotals();
                      }}
                      onBlur={() => setFocusTarget(null)}
                      onChangeText={field.onChange}
                    />
                  )}
                />
                {canEditReceived ? (
                  <Pressable style={styles.stepperBtn} onPress={() => adjustReceived(1)}>
                    <Ionicons name="add" size={10} color="#0a7ea4" />
                  </Pressable>
                ) : (
                  <View style={styles.stepperGhost} />
                )}
              </View>
            </View>

            <View style={[styles.amountCell, styles.amountCellResult]}>
              <Text style={styles.fieldName}>Result</Text>
              <TextInput
                style={[styles.input, styles.inputReadOnly]}
                value={cylinderResult.toString()}
                editable={false}
                placeholder="0"
              />
            </View>
          </View>
          {currentAction === "replacement" || isReturn ? (
            <View style={[styles.amountsRow, styles.actionRow]}>
              <View style={styles.amountCell} />
              <View style={styles.amountCell}>
                {currentAction === "replacement" ? (
                  <View style={styles.inlineActionRow}>
                    <Pressable
                      style={[
                        styles.inlineActionButton,
                        received === 0 ? styles.inlineActionButtonSuccess : null,
                      ]}
                      onPress={() => {
                        if (received === 0) {
                          setValue("cylinders_received", String(installed), {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                        } else {
                          setValue("cylinders_received", "0", {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                        }
                      }}
                    >
                      <Text style={styles.inlineActionText}>
                        {received === 0 ? "Returned" : "Didnt return"}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
                {isReturn ? (
                  <View style={styles.inlineActionRow}>
                    {(() => {
                      const owed =
                        selectedGas === "48kg"
                          ? Math.max(0, cylinder48Before)
                          : Math.max(0, cylinder12Before);
                      const isReturned = owed > 0 && received === owed;
                      return (
                        <Pressable
                          style={[
                            styles.inlineActionButton,
                            isReturned ? null : styles.inlineActionButtonSuccess,
                          ]}
                          onPress={() => {
                            if (owed <= 0) return;
                            if (isReturned) {
                              setValue("cylinders_received", "0", {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
                              return;
                            }
                            setValue("cylinders_received", String(owed), {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                          }}
                        >
                          <Text style={styles.inlineActionText}>
                            {isReturned ? "Didnt return" : "Return all"}
                          </Text>
                        </Pressable>
                      );
                    })()}
                  </View>
                ) : null}
              </View>
              <View style={[styles.amountCell, styles.amountCellResult]} />
            </View>
          ) : null}

          {isSellIron ? (
            <>
              <View style={styles.amountsRow}>
                <View style={styles.amountCell}>
                  <Text style={styles.fieldName}>Gas Qty</Text>
                  <View style={styles.stackAlign}>
                    <TextInput
                      style={[styles.input, styles.inputReadOnly]}
                      value={installed.toString()}
                      editable={false}
                      placeholder="0"
                    />
                  </View>
                </View>
                <View style={styles.amountCell}>
                  <Text style={styles.fieldName}>Gas Price</Text>
                  <View style={styles.stepperColumn}>
                    <Pressable style={styles.stepperTiny} onPress={() => adjustGasPrice(50)}>
                      <Ionicons name="add" size={10} color="#0a7ea4" />
                    </Pressable>
                    <View style={styles.amountGroup}>
                      <Pressable style={styles.stepperBtn} onPress={() => adjustGasPrice(-10)}>
                        <Ionicons name="remove" size={10} color="#0a7ea4" />
                      </Pressable>
                      <TextInput
                        style={[styles.input, styles.amountInput]}
                        accessibilityLabel="Gas price"
                        accessibilityHint="Enter gas price per unit"
                        keyboardType="numeric"
                        inputMode="numeric"
                        placeholder="0"
                        value={gasPriceInput}
                        {...doneInputProps}
                        onFocus={() => {
                          setAvoidKeyboard(true);
                          setFocusTarget("payments");
                        }}
                        onBlur={() => setFocusTarget(null)}
                        onChangeText={(t) => {
                          setGasPriceDirty(true);
                          setGasPriceInput(t);
                        }}
                      />
                      <Pressable style={styles.stepperBtn} onPress={() => adjustGasPrice(10)}>
                        <Ionicons name="add" size={10} color="#0a7ea4" />
                      </Pressable>
                    </View>
                    <Pressable style={styles.stepperTiny} onPress={() => adjustGasPrice(-50)}>
                      <Ionicons name="remove" size={10} color="#0a7ea4" />
                    </Pressable>
                  </View>
                </View>
                <View style={[styles.amountCell, styles.amountCellResult]}>
                  <Text style={styles.fieldName}>Gas Total</Text>
                  <View style={styles.stackAlign}>
                    <TextInput
                      style={[styles.input, styles.inputReadOnly]}
                      value={gasLineTotal.toString()}
                      editable={false}
                      placeholder="0"
                    />
                  </View>
                </View>
              </View>
              <View style={styles.amountsRow}>
                <View style={styles.amountCell}>
                  <Text style={styles.fieldName}>Iron Qty</Text>
                  <View style={styles.stackAlign}>
                    <TextInput
                      style={[styles.input, styles.inputReadOnly]}
                      value={installed.toString()}
                      editable={false}
                      placeholder="0"
                    />
                  </View>
                </View>
                <View style={styles.amountCell}>
                  <Text style={styles.fieldName}>Iron Price</Text>
                  <View style={styles.stepperColumn}>
                    <Pressable style={styles.stepperTiny} onPress={() => adjustIronPrice(50)}>
                      <Ionicons name="add" size={10} color="#0a7ea4" />
                    </Pressable>
                    <View style={styles.amountGroup}>
                      <Pressable style={styles.stepperBtn} onPress={() => adjustIronPrice(-10)}>
                        <Ionicons name="remove" size={10} color="#0a7ea4" />
                      </Pressable>
                      <TextInput
                        style={[styles.input, styles.amountInput]}
                        accessibilityLabel="Iron price"
                        accessibilityHint="Enter iron price per unit"
                        keyboardType="numeric"
                        inputMode="numeric"
                        placeholder="0"
                        value={ironPriceInput}
                        {...doneInputProps}
                        onFocus={() => {
                          setAvoidKeyboard(true);
                          setFocusTarget("payments");
                        }}
                        onBlur={() => setFocusTarget(null)}
                        onChangeText={(t) => {
                          setIronPriceDirty(true);
                          setIronPriceInput(t);
                        }}
                      />
                      <Pressable style={styles.stepperBtn} onPress={() => adjustIronPrice(10)}>
                        <Ionicons name="add" size={10} color="#0a7ea4" />
                      </Pressable>
                    </View>
                    <Pressable style={styles.stepperTiny} onPress={() => adjustIronPrice(-50)}>
                      <Ionicons name="remove" size={10} color="#0a7ea4" />
                    </Pressable>
                  </View>
                </View>
                <View style={[styles.amountCell, styles.amountCellResult]}>
                  <Text style={styles.fieldName}>Iron Total</Text>
                  <View style={styles.stackAlign}>
                    <TextInput
                      style={[styles.input, styles.inputReadOnly]}
                      value={ironLineTotal.toString()}
                      editable={false}
                      placeholder="0"
                    />
                  </View>
                </View>
              </View>
            </>
          ) : null}

          {isBuyIron ? (
            <View style={styles.amountsRow}>
              <View style={styles.amountCell}>
                <Text style={styles.fieldName}>Iron Qty</Text>
                <View style={styles.stackAlign}>
                  <TextInput
                    style={[styles.input, styles.inputReadOnly]}
                    value={received.toString()}
                    editable={false}
                    placeholder="0"
                  />
                </View>
              </View>
              <View style={styles.amountCell}>
                <Text style={styles.fieldName}>Iron Price</Text>
                <View style={styles.stepperColumn}>
                  <Pressable style={styles.stepperTiny} onPress={() => adjustIronPrice(50)}>
                    <Ionicons name="add" size={10} color="#0a7ea4" />
                  </Pressable>
                  <View style={styles.amountGroup}>
                    <Pressable style={styles.stepperBtn} onPress={() => adjustIronPrice(-10)}>
                      <Ionicons name="remove" size={10} color="#0a7ea4" />
                    </Pressable>
                    <TextInput
                      style={[styles.input, styles.amountInput]}
                      accessibilityLabel="Iron price"
                      accessibilityHint="Enter iron price per unit"
                      keyboardType="numeric"
                      inputMode="numeric"
                      placeholder="0"
                      value={ironPriceInput}
                      {...doneInputProps}
                      onFocus={() => {
                        setAvoidKeyboard(true);
                        setFocusTarget("payments");
                      }}
                      onBlur={() => setFocusTarget(null)}
                      onChangeText={(t) => {
                        setIronPriceDirty(true);
                        setIronPriceInput(t);
                      }}
                    />
                    <Pressable style={styles.stepperBtn} onPress={() => adjustIronPrice(10)}>
                      <Ionicons name="add" size={10} color="#0a7ea4" />
                    </Pressable>
                  </View>
                  <Pressable style={styles.stepperTiny} onPress={() => adjustIronPrice(-50)}>
                    <Ionicons name="remove" size={10} color="#0a7ea4" />
                  </Pressable>
                </View>
              </View>
              <View style={[styles.amountCell, styles.amountCellResult]}>
                <Text style={styles.fieldName}>Iron Total</Text>
                <View style={styles.stackAlign}>
                  <TextInput
                    style={[styles.input, styles.inputReadOnly]}
                    value={ironLineTotal.toString()}
                    editable={false}
                    placeholder="0"
                  />
                </View>
              </View>
            </View>
          ) : null}

          <View
            style={[
              styles.amountsRow,
              styles.totalsRow,
              showStickyPayment ? styles.hidden : undefined,
            ]}
          >
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
                  validate: (val) =>
                    (Number(val) || 0) >= 0 || "Total cannot be negative",
                }}
                render={({ field }) =>
                  showTotalStepper ? (
                    <View style={styles.stepperStack}>
                      {canEditTotal ? (
                        <Pressable
                          style={styles.stepperTiny}
                          onPress={() => adjustPriceTotal(50)}
                          accessibilityLabel="Increase total by 50"
                        >
                          <Ionicons name="add" size={10} color="#0a7ea4" />
                        </Pressable>
                      ) : (
                        <View style={styles.stepperGhost} />
                      )}
                      <View style={styles.amountGroup}>
                        {canEditTotal ? (
                          <Pressable
                            style={styles.stepperBtn}
                            onPress={() => adjustPriceTotal(-10)}
                            accessibilityLabel="Decrease total by 10"
                          >
                            <Ionicons name="remove" size={10} color="#0a7ea4" />
                          </Pressable>
                        ) : (
                          <View style={styles.stepperGhost} />
                        )}
                        <TextInput
                          style={[
                            styles.input,
                            styles.amountInput,
                            !canEditTotal && styles.inputReadOnly,
                            errors.price_total && styles.inputError,
                          ]}
                          accessibilityLabel="Total price"
                          accessibilityHint="Enter total price"
                          keyboardType="numeric"
                          inputMode="numeric"
                          placeholder="0"
                          value={field.value}
                          {...doneInputProps}
                          editable={canEditTotal}
                          ref={(node) => (inputRefs.current.price_total = node)}
                          onFocus={() => {
                            if (!canEditTotal) return;
                            setAvoidKeyboard(true);
                            setFocusTarget("payments");
                          }}
                          onBlur={() => setFocusTarget(null)}
                          onChangeText={(t) => {
                            if (!canEditTotal) return;
                            setManualPrice(true);
                            field.onChange(t);
                            if (!paidDirty) {
                              setValue("paid_amount", t);
                            }
                          }}
                        />
                        {canEditTotal ? (
                          <Pressable
                            style={styles.stepperBtn}
                            onPress={() => adjustPriceTotal(10)}
                            accessibilityLabel="Increase total by 10"
                          >
                            <Ionicons name="add" size={10} color="#0a7ea4" />
                          </Pressable>
                        ) : (
                          <View style={styles.stepperGhost} />
                        )}
                      </View>
                      {canEditTotal ? (
                        <Pressable
                          style={styles.stepperTiny}
                          onPress={() => adjustPriceTotal(-50)}
                          accessibilityLabel="Decrease total by 50"
                        >
                          <Ionicons name="remove" size={10} color="#0a7ea4" />
                        </Pressable>
                      ) : (
                        <View style={styles.stepperGhost} />
                      )}
                    </View>
                  ) : (
                    <TextInput
                      style={[
                        styles.input,
                        !canEditTotal && styles.inputReadOnly,
                        errors.price_total && styles.inputError,
                      ]}
                      accessibilityLabel="Total price"
                      accessibilityHint="Enter total price"
                      keyboardType="numeric"
                      inputMode="numeric"
                      placeholder="0"
                      value={field.value}
                      {...doneInputProps}
                      editable={canEditTotal}
                      ref={(node) => (inputRefs.current.price_total = node)}
                      onFocus={() => {
                        if (!canEditTotal) return;
                        setAvoidKeyboard(true);
                        setFocusTarget("payments");
                      }}
                      onBlur={() => setFocusTarget(null)}
                      onChangeText={(t) => {
                        if (!canEditTotal) return;
                        setManualPrice(true);
                        field.onChange(t);
                        if (!paidDirty) {
                          setValue("paid_amount", t);
                        }
                      }}
                    />
                  )
                }
              />
            </View>

            <View style={styles.amountCell}>
              <Text style={styles.fieldName}>Paid</Text>
              <Controller
                control={control}
                name="paid_amount"
                rules={{
                  validate: (val) =>
                    (Number(val) || 0) >= 0 || "Paid cannot be negative",
                }}
                render={({ field }) =>
                  showPaidStepper ? (
                    <View style={styles.stepperStack}>
                      {canEditPaid ? (
                        <Pressable
                          style={styles.stepperTiny}
                          onPress={() => adjustPaidAmount(50)}
                          accessibilityLabel="Increase paid amount by 50"
                        >
                          <Ionicons name="add" size={10} color="#0a7ea4" />
                        </Pressable>
                      ) : (
                        <View style={styles.stepperGhost} />
                      )}
                      <View style={styles.amountGroup}>
                        {canEditPaid ? (
                          <Pressable
                            style={styles.stepperBtn}
                            onPress={() => adjustPaidAmount(-10)}
                            accessibilityLabel="Decrease paid amount by 10"
                          >
                            <Ionicons name="remove" size={10} color="#0a7ea4" />
                          </Pressable>
                        ) : (
                          <View style={styles.stepperGhost} />
                        )}
                        <TextInput
                          style={[
                            styles.input,
                            styles.amountInput,
                            !canEditPaid && styles.inputReadOnly,
                            errors.paid_amount && styles.inputError,
                          ]}
                          accessibilityLabel="Paid amount"
                          accessibilityHint="Enter amount paid"
                          keyboardType="numeric"
                          inputMode="numeric"
                          placeholder="0"
                          value={field.value}
                          {...doneInputProps}
                          editable={canEditPaid}
                          ref={(node) => (inputRefs.current.paid_amount = node)}
                          onFocus={() => {
                            if (!canEditPaid) return;
                            setPaidDirty(true);
                            setAvoidKeyboard(true);
                            setFocusTarget("payments");
                          }}
                          onBlur={() => setFocusTarget(null)}
                          onChangeText={(t) => {
                            if (!canEditPaid) return;
                            setPaidDirty(true);
                            field.onChange(t);
                          }}
                        />
                        {canEditPaid ? (
                          <Pressable
                            style={styles.stepperBtn}
                            onPress={() => adjustPaidAmount(10)}
                            accessibilityLabel="Increase paid amount by 10"
                          >
                            <Ionicons name="add" size={10} color="#0a7ea4" />
                          </Pressable>
                        ) : (
                          <View style={styles.stepperGhost} />
                        )}
                      </View>
                      {canEditPaid ? (
                        <Pressable
                          style={styles.stepperTiny}
                          onPress={() => adjustPaidAmount(-50)}
                          accessibilityLabel="Decrease paid amount by 50"
                        >
                          <Ionicons name="remove" size={10} color="#0a7ea4" />
                        </Pressable>
                      ) : (
                        <View style={styles.stepperGhost} />
                      )}
                    </View>
                  ) : (
                    <TextInput
                      style={[
                        styles.input,
                        !canEditPaid && styles.inputReadOnly,
                        errors.paid_amount && styles.inputError,
                      ]}
                      accessibilityLabel="Paid amount"
                      accessibilityHint="Enter amount paid"
                      keyboardType="numeric"
                      inputMode="numeric"
                      placeholder="0"
                      value={field.value}
                      {...doneInputProps}
                      editable={canEditPaid}
                      ref={(node) => (inputRefs.current.paid_amount = node)}
                      onFocus={() => {
                        if (!canEditPaid) return;
                        setAvoidKeyboard(true);
                        setFocusTarget("payments");
                      }}
                      onBlur={() => setFocusTarget(null)}
                      onChangeText={(t) => {
                        if (!canEditPaid) return;
                        setPaidDirty(true);
                        field.onChange(t);
                      }}
                    />
                  )
                }
              />
            </View>

            <View style={[styles.amountCell, styles.amountCellResult]}>
              <Text style={styles.fieldName}>Money Result</Text>
              <View style={styles.stackAlign}>
                <TextInput
                  style={[
                    styles.input,
                    styles.inputReadOnly,
                    moneyDeltaIsOutflow ? styles.negativeValue : styles.positiveValue,
                  ]}
                  value={moneyDeltaAbs.toString()}
                  editable={false}
                  placeholder="0"
                />
              </View>
            </View>
          </View>
          {canEditPaid ? (
            <View style={[styles.amountsRow, styles.actionRow]}>
              <View style={styles.amountCell} />
              <View style={styles.amountCell}>
                {isPayment ? (
                  <View style={styles.inlineActionRow}>
                    {(() => {
                      const owed =
                        paymentDirection === "payout"
                          ? Math.max(0, -balanceBefore)
                          : Math.max(0, balanceBefore);
                      const isPaid = owed > 0 && paidInput === owed;
                      const actionLabel = paymentDirection === "payout"
                        ? isPaid
                          ? "Didnt payout"
                          : "Payout all"
                        : isPaid
                          ? "Didnt receive"
                          : "Receive all";
                      return (
                        <Pressable
                          style={[
                            styles.inlineActionButton,
                            isPaid ? null : styles.inlineActionButtonSuccess,
                          ]}
                          onPress={() => {
                            if (owed <= 0) return;
                            setPaidDirty(true);
                            if (isPaid) {
                              setValue("paid_amount", "0", {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
                              return;
                            }
                            setValue("paid_amount", String(owed), {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                          }}
                        >
                          <Text style={styles.inlineActionText}>
                            {actionLabel}
                          </Text>
                        </Pressable>
                      );
                    })()}
                  </View>
                ) : (
                  <View style={styles.inlineActionRow}>
                    <Pressable
                      style={[
                        styles.inlineActionButton,
                        paidInput === 0 ? styles.inlineActionButtonSuccess : null,
                      ]}
                      onPress={() => {
                        if (paidInput === 0) {
                          setPaidDirty(true);
                          setValue("paid_amount", String(totalAmount), {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                        } else {
                          setPaidDirty(true);
                          setValue("paid_amount", "0", { shouldDirty: true, shouldValidate: true });
                        }
                      }}
                    >
                      <Text style={styles.inlineActionText}>
                        {paidInput === 0 ? "Paid" : "Didnt pay"}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
              <View style={[styles.amountCell, styles.amountCellResult]} />
            </View>
          ) : null}
          {selectedCustomerEntry ? <BalancePreviewCard lines={balancePreviewLines} /> : null}
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
            <View style={styles.footerRow}>
              <Pressable
                onPress={saveSecondaryHandler}
                disabled={saveDisabled}
                style={[
                  styles.footerSecondary,
                  saveDisabled && styles.footerButtonDisabled,
                ]}
              >
                <Text style={styles.footerSecondaryText}>Save & Add Another</Text>
              </Pressable>
              <Pressable
                onPress={savePrimaryHandler}
                disabled={saveDisabled}
                style={[
                  styles.footerPrimary,
                  saveDisabled && styles.footerButtonDisabled,
                ]}
              >
                <Text style={styles.footerPrimaryText}>
                  {saveBusy ? "Saving..." : savePrimaryLabel}
                </Text>
              </Pressable>
            </View>
          </View>
          {showStickyPayment && (
            <View
              style={[styles.stickyPayment, { bottom: footerHeight + 8 }]}
            >
              <Text style={styles.stickyLabel}>Total / Paid</Text>
              <View style={styles.amountsRow}>
                <View style={styles.amountCell}>
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
                          styles.inputReadOnly,
                          errors.price_total && styles.inputError,
                        ]}
                        keyboardType="numeric"
                        inputMode="numeric"
                        placeholder="Tot"
                        value={field.value}
                        editable={false}
                      />
                    )}
                  />
                </View>
                <View style={styles.amountCell}>
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
                          styles.inputReadOnly,
                          errors.paid_amount && styles.inputError,
                        ]}
                        keyboardType="numeric"
                        inputMode="numeric"
                        placeholder="Paid"
                        value={field.value}
                        editable={false}
                      />
                    )}
                  />
                </View>
                <View style={styles.amountCell}>
                  <TextInput
                    style={[styles.input, styles.inputReadOnly]}
                    value={unpaid.toString()}
                    editable={false}
                    placeholder="Unp"
                  />
                </View>
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
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6, marginBottom: 2 },
  modeButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
  },
  modeButtonActive: { backgroundColor: "#0a7ea4" },
  modeButtonDisabled: {
    backgroundColor: "#e2e8f0",
    opacity: 0.5,
  },
  modeText: { fontWeight: "700", color: "#1f2937" },
  modeTextActive: { color: "#fff" },
  modeTextDisabled: { color: "#94a3b8" },
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
  chipDisabled: { opacity: 0.4 },
  chipText: { fontWeight: "600", color: "#1f2937" },
  chipTextActive: { color: "#fff" },
  chipTextDisabled: { color: "#94a3b8" },
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
  positiveValue: {
    color: "#15803d",
    fontWeight: "700",
  },
  negativeValue: {
    color: "#b91c1c",
    fontWeight: "700",
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
    justifyContent: "center",
    gap: 4,
  },
  amountInput: {
    flex: 1,
    textAlign: "center",
    minWidth: 72,
    paddingHorizontal: 6,
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
  stepperGhost: {
    width: 22,
    height: 22,
    borderRadius: 7,
    opacity: 0,
  },
  stepperBtnDisabled: {
    opacity: 0.4,
  },
  stepperColumn: {
    alignItems: "center",
    gap: 6,
  },
  stepperTiny: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d7dde4",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperStack: {
    alignItems: "center",
    gap: 6,
  },
  stackAlign: {
    marginTop: 28,
  },
  amountsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  totalsRow: {
    marginTop: 12,
  },
  actionRow: {
    marginTop: 2,
  },
  amountCell: {
    flex: 1,
    gap: 6,
  },
  amountCellResult: {
    flex: 0.7,
  },
  fieldName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    textAlign: "center",
    alignSelf: "center",
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
  inlineActionStack: {
    marginTop: 8,
    gap: 6,
  },
  inlineActionRow: {
    marginTop: 8,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  inlineActionButton: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: "center",
    backgroundColor: "#dc2626",
    minWidth: 110,
    alignSelf: "center",
  },
  inlineActionButtonSuccess: {
    backgroundColor: "#16a34a",
  },
  inlineActionText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
  inlineActionButtonAlt: {
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: "#0a7ea4",
  },
  inlineActionButtonDanger: {
    backgroundColor: "#dc2626",
  },
  inlineActionTextAlt: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
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
