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

import { useCustomerBalance, useCustomers } from "@/hooks/useCustomers";
import { useCreateOrder } from "@/hooks/useOrders";
import { useCreateCollection } from "@/hooks/useCollections";
import { useInventoryLatest, useInitInventory } from "@/hooks/useInventory";
import { usePriceSettings } from "@/hooks/usePrices";
import { useDailyReportsV2 } from "@/hooks/useReports";
import { useSystems } from "@/hooks/useSystems";
import { useOrderDateTimeState } from "@/hooks/useOrderDateTimeState";
import { useInitInventoryModal } from "@/hooks/useInitInventoryModal";
import { useOrderPriceOverride } from "@/hooks/useOrderPriceOverride";
import { useOrderKeyboardLayout } from "@/hooks/useOrderKeyboardLayout";
import InlineWalletFundingPrompt from "@/components/InlineWalletFundingPrompt";
import BigBox from "@/components/entry/BigBox";
import FooterActions from "@/components/entry/FooterActions";
import { FieldCell, type FieldStepper } from "@/components/entry/FieldPair";
import MinuteTimePickerModal from "@/components/MinuteTimePickerModal";
import StandaloneField from "@/components/entry/StandaloneField";
import { getOrderWhatsappLink } from "@/lib/api";
import { getUserFacingApiError, logApiError } from "@/lib/apiErrors";
import { formatBalanceTransitions, makeBalanceTransition } from "@/lib/balanceTransitions";
import { buildActivityHappenedAt, formatDateLocale } from "@/lib/date";
import { calcCustomerCylinderDelta, calcCustomerMoneyDelta, calcMoneyUiResult } from "@/lib/ledgerMath";
import { CUSTOMER_WORDING } from "@/lib/wording";
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

function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLedgerNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return Number(value).toFixed(0);
}

type ReplacementToggleState = "matched" | "with_old" | "none" | "custom";

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
  const dailyReportQuery = useDailyReportsV2(getTodayDate(), getTodayDate());
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

  // Extract price override state into custom hook
  const {
    manualPrice,
    setManualPrice,
    gasPriceInput,
    setGasPriceInput,
    gasPriceDirty,
    setGasPriceDirty,
    ironPriceInput,
    setIronPriceInput,
    ironPriceDirty,
    setIronPriceDirty,
    paidDirty,
    setPaidDirty,
    resetPriceOverrides,
  } = useOrderPriceOverride();

  const [whatsappOrderId, setWhatsappOrderId] = useState<string | null>(null);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [whatsappBusy, setWhatsappBusy] = useState(false);
  const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false);
  const [customerInputArmed, setCustomerInputArmed] = useState(false);
  const [customerTyping, setCustomerTyping] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const inputRefs = useRef<Record<string, TextInput | null>>({});

  // Extract keyboard/scroll layout state into custom hook
  const {
    keyboardHeight,
    avoidKeyboard,
    setAvoidKeyboard,
    scrollViewHeight,
    setScrollViewHeight,
    focusTarget,
    setFocusTarget,
    amountsLayoutY,
    setAmountsLayoutY,
    totalsLayout,
    setTotalsLayout,
    effectiveKeyboardHeight,
    contentBottomPadding,
  } = useOrderKeyboardLayout();
  // Extract date/time state into custom hook
  const {
    deliveryDate,
    setDeliveryDate,
    deliveryDateOpen,
    setDeliveryDateOpen,
    deliveryTime,
    setDeliveryTime,
    deliveryTimeOpen,
    setDeliveryTimeOpen,
    collectionDate,
    setCollectionDate,
    collectionDateOpen,
    setCollectionDateOpen,
    collectionTime,
    setCollectionTime,
    collectionTimeOpen,
    setCollectionTimeOpen,
  } = useOrderDateTimeState(setValue);

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
  const walletBalance = dailyReportQuery.data?.[0]?.cash_end ?? 0;
  const inventoryBaseFullForGas =
    selectedGas === "48kg"
      ? inventoryLatest.data?.full48 ?? null
      : selectedGas === "12kg"
        ? inventoryLatest.data?.full12 ?? null
        : null;
  const inventoryBaseEmptyForGas =
    selectedGas === "48kg"
      ? inventoryLatest.data?.empty48 ?? null
      : selectedGas === "12kg"
        ? inventoryLatest.data?.empty12 ?? null
        : null;

  const installed = Number(watch("cylinders_installed")) || 0;
  const received = Number(watch("cylinders_received")) || 0;
  const totalAmount = Number(watch("price_total")) || 0;
  const paidInput = Number(watch("paid_amount")) || 0;
  const inventoryFullAfterInstalled =
    inventoryBaseFullForGas === null ? null : inventoryBaseFullForGas - installed;
  const inventoryEmptyAfterReceived =
    inventoryBaseEmptyForGas === null ? null : inventoryBaseEmptyForGas + received;
  const walletAfterCustomerInflow = walletBalance + paidInput;
  const walletAfterCustomerOutflow = walletBalance - paidInput;
  const walletAfterPayment = paymentDirection === "payout"
    ? walletBalance - paidInput
    : walletBalance + paidInput;
  const cylinderResult = calcCustomerCylinderDelta(currentAction, installed, received);
  const baseMoneyDelta = calcCustomerMoneyDelta(currentAction, totalAmount, paidInput);
  const paymentDelta =
    paymentDirection === "payout" ? calcMoneyUiResult(paidInput, 0) : calcMoneyUiResult(0, paidInput);
  const moneyDelta = currentAction === "payment" ? paymentDelta : baseMoneyDelta;
  const canEditTotal = currentAction === "replacement";
  const canEditPaid = !isReturn;
  const unpaid = moneyDelta;
  const moneyDeltaAbs = Math.abs(unpaid);
  const moneyDeltaIsOutflow = unpaid < 0;
  const payoutWalletShortfall =
    isPayment && paymentDirection === "payout" ? Math.max(paidInput - walletBalance, 0) : 0;
  const moneyResultLabel =
    unpaid > 0 ? "Customer owes (debt)" : unpaid < 0 ? "Customer credit" : "Settled";
  const cylinderResultLabel =
    cylinderResult > 0 ? "Customer owes (debt)" : cylinderResult < 0 ? "Customer credit" : "Settled";
  const inventoryInitBlocked = inventoryLatest.data === null;

  // Extract init inventory modal state into custom hook
  const {
    initModalVisible,
    setInitModalVisible,
    initCounts,
    setInitCounts,
    initDateOpen,
    setInitDateOpen,
    initDate,
    setInitDate,
    inventoryPromptedRef,
  } = useInitInventoryModal();
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
  const customerBalanceQuery = useCustomerBalance(selectedCustomer || undefined);
  const customerBalance = selectedCustomer ? customerBalanceQuery.data ?? null : null;
  const customerPreviewReady = !selectedCustomer || customerBalanceQuery.isSuccess;
  const customerPreviewStatusLine = selectedCustomer
    ? customerBalanceQuery.isLoading
      ? "Loading current customer balances..."
      : customerBalanceQuery.isError
        ? "Current customer balances unavailable. Preview is disabled until balances load."
        : null
    : null;
  const hasCustomer = Boolean(selectedCustomerEntry);
  const showOrderTabs = hasCustomer;
  const showSystemSection = hasCustomer && (currentAction === "replacement" || currentAction === "sell_iron");
  const showOrderDetails =
    hasCustomer && (currentAction !== "replacement" || Boolean(selectedSystemId));
  const balanceBefore = customerBalance?.money_balance ?? 0;
  const balanceAfter = balanceBefore + unpaid;
  const cylinder12Before = customerBalance?.cylinder_balance_12kg ?? 0;
  const cylinder48Before = customerBalance?.cylinder_balance_48kg ?? 0;
  const hasMoneyDebt = balanceBefore > 0;
  const hasMoneyCredit = balanceBefore < 0;
  const paymentTabEnabled = customerPreviewReady && (hasMoneyDebt || hasMoneyCredit);
  const receivePaymentDisabled = !customerPreviewReady || balanceBefore <= 0;
  const payoutPaymentDisabled = !customerPreviewReady || balanceBefore >= 0;
  const hasReturnDebt12 = cylinder12Before > 0;
  const hasReturnDebt48 = cylinder48Before > 0;
  const returnTabEnabled = customerPreviewReady && (hasReturnDebt12 || hasReturnDebt48);
  const orderCylinderDelta = cylinderResult;
  const orderCylinderAfter12 =
    selectedGas === "12kg" ? cylinder12Before + orderCylinderDelta : cylinder12Before;
  const orderCylinderAfter48 =
    selectedGas === "48kg" ? cylinder48Before + orderCylinderDelta : cylinder48Before;
  const collectionBusy = createCollection.isPending;
  const previousCustomerRef = useRef<string | undefined>(undefined);
  const formatMoneyAmount = useCallback((value: number) => Math.abs(value).toFixed(0), []);
  const refreshCustomerPreview = useCallback(async () => {
    if (!selectedCustomer) return;
    await customerBalanceQuery.refetch();
  }, [customerBalanceQuery, selectedCustomer]);
  const sharedCustomerPreviewTransitions = useMemo(() => {
    if (!selectedCustomerEntry || !customerPreviewReady) return [];
    const transitions = [
      makeBalanceTransition("customer", "money", balanceBefore, balanceAfter),
      makeBalanceTransition("customer", "cyl_12", cylinder12Before, orderCylinderAfter12),
      makeBalanceTransition("customer", "cyl_48", cylinder48Before, orderCylinderAfter48),
    ];
    if (isPayment) return [transitions[0]];
    if (isReturn) return [transitions[1], transitions[2]];
    return transitions;
  }, [
    balanceAfter,
    balanceBefore,
    cylinder12Before,
    cylinder48Before,
    customerPreviewReady,
    isPayment,
    isReturn,
    orderCylinderAfter12,
    orderCylinderAfter48,
    selectedCustomerEntry,
  ]);
  const sharedCustomerAlertLines = useMemo(
    () =>
      formatBalanceTransitions(sharedCustomerPreviewTransitions, {
        mode: "current",
        formatMoney: formatMoneyAmount,
      }),
    [formatMoneyAmount, sharedCustomerPreviewTransitions]
  );
  const cylinderDebtBeforeForGas = selectedGas === "48kg" ? Math.max(cylinder48Before, 0) : Math.max(cylinder12Before, 0);
  const cylinderDebtAfterForGas = selectedGas === "48kg" ? orderCylinderAfter48 : orderCylinderAfter12;
  const moneyDebtBefore = Math.max(balanceBefore, 0);
  const cylinderStatusLine =
    cylinderDebtAfterForGas > 0
      ? CUSTOMER_WORDING.cylinderDebt(cylinderDebtAfterForGas, selectedGas || "12kg")
      : cylinderDebtAfterForGas < 0
        ? CUSTOMER_WORDING.cylinderCredit(Math.abs(cylinderDebtAfterForGas), selectedGas || "12kg")
        : CUSTOMER_WORDING.cylinderSettled;
  const cylinderStatusIsAlert = cylinderDebtAfterForGas > 0;
  const moneyStatusLine =
    balanceAfter > 0
      ? CUSTOMER_WORDING.moneyDebt(formatMoneyAmount(balanceAfter))
      : balanceAfter < 0
        ? CUSTOMER_WORDING.moneyCredit(formatMoneyAmount(Math.abs(balanceAfter)))
        : CUSTOMER_WORDING.moneySettled;
  const moneyStatusIsAlert = balanceAfter > 0;
  const replacementReceivedToggleState: ReplacementToggleState =
    received === installed
      ? "matched"
      : cylinderDebtBeforeForGas > 0 && received === installed + cylinderDebtBeforeForGas
        ? "with_old"
        : received === 0
          ? "none"
          : "custom";
  const replacementPaidToggleState: ReplacementToggleState =
    paidInput === totalAmount
      ? "matched"
      : moneyDebtBefore > 0 && paidInput === totalAmount + moneyDebtBefore
        ? "with_old"
        : paidInput === 0
          ? "none"
          : "custom";
  const paymentModeStatusLine =
    balanceAfter > 0
      ? CUSTOMER_WORDING.moneyDebt(formatMoneyAmount(balanceAfter))
      : balanceAfter < 0
        ? CUSTOMER_WORDING.moneyCredit(formatMoneyAmount(Math.abs(balanceAfter)))
        : CUSTOMER_WORDING.moneySettled;
  const returnModeStatusLine =
    cylinderDebtAfterForGas > 0
      ? CUSTOMER_WORDING.cylinderDebt(cylinderDebtAfterForGas, selectedGas || "12kg")
      : cylinderDebtAfterForGas < 0
        ? CUSTOMER_WORDING.cylinderCredit(Math.abs(cylinderDebtAfterForGas), selectedGas || "12kg")
        : CUSTOMER_WORDING.cylinderSettled;
  const replacementMoneySteppers: FieldStepper[] = [
    { delta: 20, label: "+20", position: "top" },
    { delta: -5, label: "-5", position: "left" },
    { delta: 5, label: "+5", position: "right" },
    { delta: -20, label: "-20", position: "bottom" },
  ];
  const quantitySteppers: FieldStepper[] = [
    { delta: -1, label: "-1", position: "left" },
    { delta: 1, label: "+1", position: "right" },
  ];

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

  const customerQueryRefetchRef = useRef(customersQuery.refetch);
  customerQueryRefetchRef.current = customersQuery.refetch;

  useFocusEffect(
    useCallback(() => {
      customerQueryRefetchRef.current();
    }, [])
  );

  useEffect(() => {
    if (isCustomerSearchOpen) {
      customerQueryRefetchRef.current();
    }
  }, [isCustomerSearchOpen]);

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
    if ((orderMode === "replacement" || orderMode === "sell_iron") && !values.system_id) {
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
    const moneyDeltaValue = calcCustomerMoneyDelta(orderMode, total, paid);
    const balanceBeforeValue = customerBalance?.money_balance ?? 0;
    const balanceAfterValue = balanceBeforeValue + moneyDeltaValue;
    const cylDelta = calcCustomerCylinderDelta(orderMode, installedCount, receivedCount);
    const balanceBeforeCyl =
      gasType === "12kg"
        ? customerBalance?.cylinder_balance_12kg ?? 0
        : customerBalance?.cylinder_balance_48kg ?? 0;
    const balanceAfterCyl = balanceBeforeCyl + cylDelta;
    const overpay = orderMode === "replacement" ? Math.max(paid - total, 0) : 0;
    const paidEarlier = orderMode === "replacement" ? Math.min(overpay, Math.max(balanceBeforeValue, 0)) : 0;
    const extraCredit = orderMode === "replacement" ? Math.max(overpay - paidEarlier, 0) : 0;
    const guardrailLines: string[] = [];
    if (overpay > 0) {
      if (paidEarlier > 0) {
        guardrailLines.push(`Includes ${formatMoneyAmount(paidEarlier)}â‚ª paid earlier`);
      }
      if (extraCredit > 0) {
        guardrailLines.push(`Creates ${formatMoneyAmount(extraCredit)}â‚ª extra credit`);
      }
      if (guardrailLines.length === 0) {
        guardrailLines.push(`Paid exceeds total by ${formatMoneyAmount(overpay)}â‚ª`);
      }
    }
    const alertLines = formatBalanceTransitions(
      [
        makeBalanceTransition("customer", "money", balanceBeforeValue, balanceAfterValue),
        makeBalanceTransition(
          "customer",
          gasType === "12kg" ? "cyl_12" : "cyl_48",
          balanceBeforeCyl,
          balanceAfterCyl
        ),
      ],
      {
        mode: "transition",
        collapseAllSettled: true,
        intent: "customer_order",
        formatMoney: formatMoneyAmount,
      }
    );
    const alertMessage = alertLines.join("\n");

    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const orderPayload: OrderCreateInput = {
      customer_id: values.customer_id,
      ...(orderMode === "replacement" || orderMode === "sell_iron" ? { system_id: values.system_id } : {}),
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
      request_id: requestId,
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
        logApiError("[new order submit] error", err);
        Alert.alert("Error", getUserFacingApiError(err, "Failed to create order. Please try again."));
      } finally {
        setSubmitting(false);
      }
    };

    if (guardrailLines.length > 0 || balanceAfterValue !== 0 || balanceAfterCyl !== 0) {
      const moneyLine = `Money balance (before + this order = after): ${balanceBeforeValue.toFixed(
        0
      )} + ${moneyDeltaValue.toFixed(0)} = ${balanceAfterValue.toFixed(0)}`;
      const cylLine = `Cylinder balance (before + this order = after): ${balanceBeforeCyl.toFixed(
        0
      )} + ${cylDelta.toFixed(0)} = ${balanceAfterCyl.toFixed(0)}`;
      const headerBlock = guardrailLines.length ? `${guardrailLines.join("\n")}\n\n` : "";
      Alert.alert(
        "Confirm settlement",
        `${headerBlock}${alertMessage}

${moneyLine}
${cylLine}
`,
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

  const navigateToTodayReport = () => {
    router.replace({ pathname: "/(tabs)/reports", params: { date: getTodayDate() } });
  };

  const runSavePayment = async (resetAfter = false) => {
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
      const effectiveAt = buildActivityHappenedAt({ date: collectionDate, time: collectionTime });
      const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await createCollection.mutateAsync({
        customer_id: selectedCustomer,
        action_type: paymentDirection === "payout" ? "payout" : "payment",
        amount_money: paid,
        debt_cash: balanceAfter,
        debt_cylinders_12: cylinder12Before,
        debt_cylinders_48: cylinder48Before,
        effective_at: effectiveAt,
        note: values.note || undefined,
        request_id: requestId,
      });
      if (resetAfter) {
        setValue("paid_amount", "");
        setValue("note", "");
        setPaidDirty(false);
        await refreshCustomerPreview();
      } else {
        navigateToTodayReport();
      }
    } catch (err) {
      const axiosError = err as AxiosError;
      logApiError("[new order payment] error", err);
      Alert.alert("Payment failed", getUserFacingApiError(axiosError, "Failed to save payment."));
    }
  };

  const runSaveReturn = async (resetAfter = false) => {
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
      const effectiveAt = buildActivityHappenedAt({ date: collectionDate, time: collectionTime });
      const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
        request_id: requestId,
      });
      if (resetAfter) {
        setValue("cylinders_received", "");
        setValue("note", "");
        await refreshCustomerPreview();
      } else {
        navigateToTodayReport();
      }
    } catch (err) {
      const axiosError = err as AxiosError;
      logApiError("[new order return] error", err);
      Alert.alert("Return failed", getUserFacingApiError(axiosError, "Failed to save return."));
    }
  };

  const handleSavePayment = () => runSavePayment(false);
  const handleSavePaymentAndAddAnother = () => runSavePayment(true);
  const handleSaveReturn = () => runSaveReturn(false);
  const handleSaveReturnAndAddAnother = () => runSaveReturn(true);
  const savePrimaryLabel = "Save";
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
  const saveDisabled = isOrderAction
    ? submitting || orderSaveDisabled || !customerPreviewReady
    : collectionBusy || !customerPreviewReady;
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

  const cycleReplacementReceived = () => {
    if (cylinderDebtBeforeForGas <= 0) {
      const next = replacementReceivedToggleState === "matched" ? 0 : installed;
      setValue("cylinders_received", String(next), { shouldDirty: true, shouldValidate: true });
      return;
    }
    const next =
      replacementReceivedToggleState === "matched"
        ? installed + cylinderDebtBeforeForGas
        : replacementReceivedToggleState === "with_old"
          ? 0
          : installed;
    setValue("cylinders_received", String(next), { shouldDirty: true, shouldValidate: true });
  };

  const cycleReplacementPaid = () => {
    setPaidDirty(true);
    if (moneyDebtBefore <= 0) {
      const next = replacementPaidToggleState === "matched" ? 0 : totalAmount;
      setValue("paid_amount", String(next), { shouldDirty: true, shouldValidate: true });
      return;
    }
    const next =
      replacementPaidToggleState === "matched"
        ? totalAmount + moneyDebtBefore
        : replacementPaidToggleState === "with_old"
          ? 0
          : totalAmount;
    setValue("paid_amount", String(next), { shouldDirty: true, shouldValidate: true });
  };

  const togglePaymentModeAmount = () => {
    setPaidDirty(true);
    const settleAmount =
      paymentDirection === "payout" ? Math.max(0, Math.abs(balanceBefore)) : Math.max(0, balanceBefore);
    const next = paidInput === settleAmount ? 0 : settleAmount;
    setValue("paid_amount", String(next), { shouldDirty: true, shouldValidate: true });
  };

  const toggleReturnModeAmount = () => {
    const settleAmount = Math.max(0, cylinderDebtBeforeForGas);
    const next = received === settleAmount ? 0 : settleAmount;
    setValue("cylinders_received", String(next), { shouldDirty: true, shouldValidate: true });
  };

  const exitAfterWhatsApp = () => {
    setWhatsappOpen(false);
    setWhatsappOrderId(null);
    navigateToTodayReport();
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

  const dateTimeSection = (
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
  );

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoider}
      behavior={Platform.OS === "ios" ? (avoidKeyboard ? "padding" : undefined) : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 120 : 0}
    >
      <View style={styles.headerBlock}>
        <Text style={styles.title}>Add Order</Text>
        {showOrderTabs ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.modeRow}
          >
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
                        ? "Sell Full"
                        : mode === "buy_iron"
                          ? "Buy Empty"
                          : mode === "payment"
                            ? "Payment"
                            : "Return"}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>
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
      {(currentAction === "replacement" || currentAction === "sell_iron") && hasCustomer ? dateTimeSection : null}

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
                    <Text style={[styles.chipText, value === s.id && styles.chipTextActive]}>{s.name}</Text>
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

          {currentAction !== "replacement" ? dateTimeSection : null}

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

          {hasCustomer && !isPayment && !isReturn && !isSellIron && !isBuyIron && currentAction !== "replacement" && customerPreviewStatusLine ? (
            <View style={styles.alertBox}>
              <Text style={styles.alertText}>{customerPreviewStatusLine}</Text>
            </View>
          ) : null}

          {hasCustomer &&
          !isPayment &&
          !isReturn &&
          !isSellIron &&
          !isBuyIron &&
          currentAction !== "replacement" &&
          !customerPreviewStatusLine &&
          sharedCustomerAlertLines.length > 0 ? (
            <View style={styles.alertBox}>
              {sharedCustomerAlertLines.map((line, index) => (
                <Text key={`${line}-${index}`} style={styles.alertText}>
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

          {currentAction === "replacement" ? (
            <>
              <View
                onLayout={(event) => {
                  setAmountsLayoutY(event.nativeEvent.layout.y);
                }}
              >
                <BigBox
                  title={CUSTOMER_WORDING.cylinders}
                  statusLine={customerPreviewStatusLine ?? cylinderStatusLine}
                  statusIsAlert={customerPreviewStatusLine ? true : cylinderStatusIsAlert}
                  defaultExpanded
                >
                  <View style={styles.entryFieldPair}>
                    <Controller
                      control={control}
                      name="cylinders_installed"
                      rules={{
                        validate: (val) => (Number(val) || 0) > 0 || "Installed must be greater than 0",
                      }}
                      render={({ field }) => (
                        <FieldCell
                          title={CUSTOMER_WORDING.installed}
                          comment={`Full ${formatLedgerNumber(inventoryBaseFullForGas)} -> ${formatLedgerNumber(inventoryFullAfterInstalled)}`}
                          value={Number(field.value) || 0}
                          onIncrement={() => adjustInstalled(1)}
                          onDecrement={() => adjustInstalled(-1)}
                          onChangeText={(text) => {
                            field.onChange(text);
                            setValue("cylinders_received", text);
                            setManualPrice(false);
                          }}
                          error={Boolean(errors.cylinders_installed)}
                          inputRef={(node) => {
                            inputRefs.current.cylinders_installed = node;
                          }}
                          onFocus={() => {
                            setAvoidKeyboard(true);
                            setFocusTarget("amounts");
                            scrollToAmountsAndTotals();
                          }}
                          onBlur={() => setFocusTarget(null)}
                          steppers={quantitySteppers}
                        />
                      )}
                    />
                    <Controller
                      control={control}
                      name="cylinders_received"
                      rules={{
                        validate: (val) => (Number(val) || 0) >= 0 || "Received cannot be negative",
                      }}
                      render={({ field }) => (
                        <FieldCell
                          title={CUSTOMER_WORDING.received}
                          comment={`Empty ${formatLedgerNumber(inventoryBaseEmptyForGas)} -> ${formatLedgerNumber(inventoryEmptyAfterReceived)}`}
                          value={Number(field.value) || 0}
                          onIncrement={() => adjustReceived(1)}
                          onDecrement={() => adjustReceived(-1)}
                          onChangeText={field.onChange}
                          error={Boolean(errors.cylinders_received)}
                          inputRef={(node) => {
                            inputRefs.current.cylinders_received = node;
                          }}
                          onFocus={() => {
                            setAvoidKeyboard(true);
                            setFocusTarget("amounts");
                            scrollToAmountsAndTotals();
                          }}
                          onBlur={() => setFocusTarget(null)}
                          steppers={quantitySteppers}
                        />
                      )}
                    />
                  </View>
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
                    <View style={{ flex: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Pressable
                        style={[
                          styles.inlineActionButton,
                          { width: "100%", alignSelf: "stretch", minWidth: 0 },
                          replacementReceivedToggleState === "none"
                            ? styles.inlineActionButtonDanger
                            : replacementReceivedToggleState === "with_old"
                              ? styles.inlineActionButtonAlt
                              : styles.inlineActionButtonSuccess,
                        ]}
                        onPress={cycleReplacementReceived}
                      >
                        <Text style={styles.inlineActionText}>
                          {replacementReceivedToggleState === "with_old"
                            ? CUSTOMER_WORDING.returnedWithOld
                            : replacementReceivedToggleState === "none"
                              ? CUSTOMER_WORDING.didntReturn
                              : CUSTOMER_WORDING.returned}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </BigBox>
                <BigBox
                  title={CUSTOMER_WORDING.money}
                  statusLine={customerPreviewStatusLine ?? moneyStatusLine}
                  statusIsAlert={customerPreviewStatusLine ? true : moneyStatusIsAlert}
                  defaultExpanded
                >
                  <View
                    style={styles.entryFieldPair}
                    onLayout={(event) => {
                      const { y, height } = event.nativeEvent.layout;
                      setTotalsLayout({ y, height });
                    }}
                  >
                    <Controller
                      control={control}
                      name="price_total"
                      rules={{
                        validate: (val) => (Number(val) || 0) >= 0 || "Total cannot be negative",
                      }}
                      render={({ field }) => (
                        <FieldCell
                          title={CUSTOMER_WORDING.total}
                          comment=" "
                          value={Number(field.value) || 0}
                          onIncrement={() => adjustPriceTotal(5)}
                          onDecrement={() => adjustPriceTotal(-5)}
                          onChangeText={(text) => {
                            setManualPrice(true);
                            field.onChange(text);
                            if (!paidDirty) {
                              setValue("paid_amount", text);
                            }
                          }}
                          error={Boolean(errors.price_total)}
                          inputRef={(node) => {
                            inputRefs.current.price_total = node;
                          }}
                          onFocus={() => {
                            setAvoidKeyboard(true);
                            setFocusTarget("payments");
                          }}
                          onBlur={() => setFocusTarget(null)}
                          steppers={replacementMoneySteppers}
                        />
                      )}
                    />
                    <Controller
                      control={control}
                      name="paid_amount"
                      rules={{
                        validate: (val) => (Number(val) || 0) >= 0 || "Paid cannot be negative",
                      }}
                      render={({ field }) => (
                        <FieldCell
                          title={CUSTOMER_WORDING.paid}
                          comment={`Wallet ${formatLedgerNumber(walletBalance)} -> ${formatLedgerNumber(walletAfterCustomerInflow)}`}
                          value={Number(field.value) || 0}
                          onIncrement={() => adjustPaidAmount(5)}
                          onDecrement={() => adjustPaidAmount(-5)}
                          onChangeText={(text) => {
                            setPaidDirty(true);
                            field.onChange(text);
                          }}
                          error={Boolean(errors.paid_amount)}
                          inputRef={(node) => {
                            inputRefs.current.paid_amount = node;
                          }}
                          onFocus={() => {
                            setAvoidKeyboard(true);
                            setFocusTarget("payments");
                          }}
                          onBlur={() => setFocusTarget(null)}
                          steppers={replacementMoneySteppers}
                        />
                      )}
                    />
                  </View>
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
                    <View style={{ flex: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Pressable
                        style={[
                          styles.inlineActionButton,
                          { width: "100%", alignSelf: "stretch", minWidth: 0 },
                          replacementPaidToggleState === "none"
                            ? styles.inlineActionButtonDanger
                            : replacementPaidToggleState === "with_old"
                              ? styles.inlineActionButtonAlt
                              : styles.inlineActionButtonSuccess,
                        ]}
                        onPress={cycleReplacementPaid}
                      >
                        <Text style={styles.inlineActionText}>
                          {replacementPaidToggleState === "with_old"
                            ? CUSTOMER_WORDING.paidWithDebt
                            : replacementPaidToggleState === "none"
                              ? CUSTOMER_WORDING.didntPay
                              : CUSTOMER_WORDING.paid_}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </BigBox>
              </View>
              <FieldError message={errors.cylinders_installed?.message} />
              <FieldError message={errors.cylinders_received?.message} />
              <FieldError message={errors.price_total?.message} />
              <FieldError message={errors.paid_amount?.message} />
            </>
          ) : null}

          {isPayment ? (
            <>
              <BigBox
                title={CUSTOMER_WORDING.money}
                statusLine={customerPreviewStatusLine ?? paymentModeStatusLine}
                statusIsAlert={customerPreviewStatusLine ? true : balanceAfter > 0}
                defaultExpanded
              >
                <StandaloneField>
                  <Controller
                    control={control}
                    name="paid_amount"
                    rules={{
                      validate: (val) => (Number(val) || 0) >= 0 || "Paid cannot be negative",
                    }}
                    render={({ field }) => (
                      <FieldCell
                        title={CUSTOMER_WORDING.paid}
                        comment={`Wallet ${formatLedgerNumber(walletBalance)} -> ${formatLedgerNumber(walletAfterPayment)}`}
                        value={Number(field.value) || 0}
                        onIncrement={() => adjustPaidAmount(5)}
                        onDecrement={() => adjustPaidAmount(-5)}
                        onChangeText={(text) => {
                          setPaidDirty(true);
                          field.onChange(text);
                        }}
                        error={Boolean(errors.paid_amount)}
                        inputRef={(node) => {
                          inputRefs.current.paid_amount = node;
                        }}
                        onFocus={() => {
                          setPaidDirty(true);
                          setAvoidKeyboard(true);
                          setFocusTarget("payments");
                        }}
                        onBlur={() => setFocusTarget(null)}
                        steppers={replacementMoneySteppers}
                      />
                    )}
                  />
                </StandaloneField>
                <View style={styles.bigBoxActionRow}>
                  <StandaloneField>
                    <Pressable
                      style={[
                        styles.inlineActionButton,
                        { width: "100%", alignSelf: "stretch", minWidth: 0 },
                        paidInput === 0 ? styles.inlineActionButtonDanger : styles.inlineActionButtonSuccess,
                      ]}
                      onPress={togglePaymentModeAmount}
                    >
                      <Text style={styles.inlineActionText}>
                        {paidInput === 0
                          ? paymentDirection === "payout"
                            ? "Pay all"
                            : "Receive all"
                          : CUSTOMER_WORDING.didntPay}
                      </Text>
                    </Pressable>
                  </StandaloneField>
                </View>
              </BigBox>
              <FieldError message={errors.paid_amount?.message} />
            </>
          ) : null}

          {isReturn ? (
            <>
              <BigBox
                title={CUSTOMER_WORDING.cylinders}
                statusLine={customerPreviewStatusLine ?? returnModeStatusLine}
                statusIsAlert={customerPreviewStatusLine ? true : cylinderDebtAfterForGas > 0}
                defaultExpanded
              >
                <StandaloneField>
                  <Controller
                    control={control}
                    name="cylinders_received"
                    rules={{
                      validate: (val) => (Number(val) || 0) >= 0 || "Received cannot be negative",
                    }}
                    render={({ field }) => (
                      <FieldCell
                        title={CUSTOMER_WORDING.received}
                        value={Number(field.value) || 0}
                        onIncrement={() => adjustReceived(1)}
                        onDecrement={() => adjustReceived(-1)}
                        onChangeText={field.onChange}
                        error={Boolean(errors.cylinders_received)}
                        inputRef={(node) => {
                          inputRefs.current.cylinders_received = node;
                        }}
                        onFocus={() => {
                          setAvoidKeyboard(true);
                          setFocusTarget("amounts");
                          scrollToAmountsAndTotals();
                        }}
                        onBlur={() => setFocusTarget(null)}
                        steppers={quantitySteppers}
                      />
                    )}
                  />
                </StandaloneField>
                <View style={styles.bigBoxActionRow}>
                  <StandaloneField>
                    <Pressable
                      style={[
                        styles.inlineActionButton,
                        { width: "100%", alignSelf: "stretch", minWidth: 0 },
                        received === 0 ? styles.inlineActionButtonDanger : styles.inlineActionButtonSuccess,
                      ]}
                      onPress={toggleReturnModeAmount}
                    >
                      <Text style={styles.inlineActionText}>
                        {received === Math.max(0, cylinderDebtBeforeForGas)
                          ? CUSTOMER_WORDING.didntReturn
                          : CUSTOMER_WORDING.returnAll}
                      </Text>
                    </Pressable>
                  </StandaloneField>
                </View>
              </BigBox>
              <FieldError message={errors.cylinders_received?.message} />
            </>
          ) : null}
          {isPayment && paymentDirection === "payout" ? (
            <InlineWalletFundingPrompt
              walletAmount={walletBalance}
              shortfall={payoutWalletShortfall}
              onTransferNow={
                payoutWalletShortfall > 0
                  ? () =>
                      router.push({
                        pathname: "/expenses/new",
                        params: {
                          tab: "bank_to_wallet",
                          amount: payoutWalletShortfall.toFixed(0),
                        },
                      })
                  : undefined
              }
            />
          ) : null}
        <FieldError message={errors.cylinders_installed?.message} />
        <FieldError message={errors.cylinders_received?.message} />
        <FieldError message={errors.price_total?.message} />
        <FieldError message={errors.paid_amount?.message} />

          {isSellIron ? (
            <>
              {/* Cylinders — user enters how many installed */}
              <BigBox title={CUSTOMER_WORDING.cylinders} defaultExpanded>
                <StandaloneField>
                  <Controller
                    control={control}
                    name="cylinders_installed"
                    rules={{
                      validate: (val) => (Number(val) || 0) > 0 || "Installed must be greater than 0",
                    }}
                    render={({ field }) => (
                      <FieldCell
                        title={CUSTOMER_WORDING.installed}
                        comment={`Full ${formatLedgerNumber(inventoryBaseFullForGas)} -> ${formatLedgerNumber(inventoryFullAfterInstalled)}`}
                        value={Number(field.value) || 0}
                        onIncrement={() => adjustInstalled(1)}
                        onDecrement={() => adjustInstalled(-1)}
                        onChangeText={field.onChange}
                        error={Boolean(errors.cylinders_installed)}
                        inputRef={(node) => { inputRefs.current.cylinders_installed = node; }}
                        onFocus={() => { setAvoidKeyboard(true); setFocusTarget("amounts"); scrollToAmountsAndTotals(); }}
                        onBlur={() => setFocusTarget(null)}
                        steppers={quantitySteppers}
                      />
                    )}
                  />
                </StandaloneField>
              </BigBox>

              {/* Iron — QTY mirrors installed, Iron Price adjustable, Total computed */}
              <BigBox title="Iron Selling Price">
                <View style={styles.tradeEquationRow}>
                  <View style={[styles.tradeStatCell, styles.tradeStatCellNarrow]}>
                    <Text style={styles.tradeStatLabel}>QTY</Text>
                    <View style={styles.tradeStatValueWrap}>
                      <Text style={styles.tradeStatValue}>{installed}</Text>
                    </View>
                  </View>
                  <View style={styles.tradeOperatorCell}>
                    <View style={styles.tradeOperatorTopSpacer} />
                    <View style={styles.tradeStatValueWrap}>
                      <Text style={styles.tradeOperator}>x</Text>
                    </View>
                  </View>
                  <FieldCell
                    title="Iron Price"
                    value={Number(ironPriceInput) || 0}
                    onIncrement={() => adjustIronPrice(5)}
                    onDecrement={() => adjustIronPrice(-5)}
                    onChangeText={(t) => { setIronPriceDirty(true); setIronPriceInput(t); }}
                    steppers={replacementMoneySteppers}
                    onFocus={() => { setAvoidKeyboard(true); setFocusTarget("payments"); }}
                    onBlur={() => setFocusTarget(null)}
                  />
                  <View style={styles.tradeOperatorCell}>
                    <View style={styles.tradeOperatorTopSpacer} />
                    <View style={styles.tradeStatValueWrap}>
                      <Text style={styles.tradeOperator}>=</Text>
                    </View>
                  </View>
                  <View style={[styles.tradeStatCell, styles.tradeStatCellNarrow]}>
                    <Text style={styles.tradeStatLabel}>TOTAL</Text>
                    <View style={styles.tradeStatValueWrap}>
                      <Text style={styles.tradeStatValue}>{ironLineTotal}</Text>
                    </View>
                  </View>
                </View>
              </BigBox>

              {/* Gas Price — QTY mirrors installed, Gas Price adjustable, Total computed */}
              <BigBox title="Gas Selling Price">
                <View style={styles.tradeEquationRow}>
                  <View style={[styles.tradeStatCell, styles.tradeStatCellNarrow]}>
                    <Text style={styles.tradeStatLabel}>QTY</Text>
                    <View style={styles.tradeStatValueWrap}>
                      <Text style={styles.tradeStatValue}>{installed}</Text>
                    </View>
                  </View>
                  <View style={styles.tradeOperatorCell}>
                    <View style={styles.tradeOperatorTopSpacer} />
                    <View style={styles.tradeStatValueWrap}>
                      <Text style={styles.tradeOperator}>x</Text>
                    </View>
                  </View>
                  <FieldCell
                    title="Gas Price"
                    value={Number(gasPriceInput) || 0}
                    onIncrement={() => adjustGasPrice(5)}
                    onDecrement={() => adjustGasPrice(-5)}
                    onChangeText={(t) => { setGasPriceDirty(true); setGasPriceInput(t); }}
                    steppers={replacementMoneySteppers}
                    onFocus={() => { setAvoidKeyboard(true); setFocusTarget("payments"); }}
                    onBlur={() => setFocusTarget(null)}
                  />
                  <View style={styles.tradeOperatorCell}>
                    <View style={styles.tradeOperatorTopSpacer} />
                    <View style={styles.tradeStatValueWrap}>
                      <Text style={styles.tradeOperator}>=</Text>
                    </View>
                  </View>
                  <View style={[styles.tradeStatCell, styles.tradeStatCellNarrow]}>
                    <Text style={styles.tradeStatLabel}>TOTAL</Text>
                    <View style={styles.tradeStatValueWrap}>
                      <Text style={styles.tradeStatValue}>{gasLineTotal}</Text>
                    </View>
                  </View>
                </View>
              </BigBox>

              {/* Money — Total is read-only (auto from computedTradeTotal), Paid is editable */}
              <BigBox title={CUSTOMER_WORDING.money} defaultExpanded>
                <View
                  style={styles.entryFieldPair}
                  onLayout={(event) => {
                    const { y, height } = event.nativeEvent.layout;
                    setTotalsLayout({ y, height });
                  }}
                >
                  <FieldCell
                    title={CUSTOMER_WORDING.total}
                    comment=" "
                    value={computedTradeTotal}
                    onIncrement={() => {}}
                    onDecrement={() => {}}
                    editable={false}
                  />
                  <Controller
                    control={control}
                    name="paid_amount"
                    rules={{
                      validate: (val) => (Number(val) || 0) >= 0 || "Paid cannot be negative",
                    }}
                    render={({ field }) => (
                      <FieldCell
                        title={CUSTOMER_WORDING.paid}
                        comment={`Wallet ${formatLedgerNumber(walletBalance)} -> ${formatLedgerNumber(walletAfterCustomerInflow)}`}
                        value={Number(field.value) || 0}
                        onIncrement={() => adjustPaidAmount(5)}
                        onDecrement={() => adjustPaidAmount(-5)}
                        onChangeText={(text) => { setPaidDirty(true); field.onChange(text); }}
                        error={Boolean(errors.paid_amount)}
                        inputRef={(node) => { inputRefs.current.paid_amount = node; }}
                        onFocus={() => { setPaidDirty(true); setAvoidKeyboard(true); setFocusTarget("payments"); }}
                        onBlur={() => setFocusTarget(null)}
                        steppers={replacementMoneySteppers}
                      />
                    )}
                  />
                </View>
              </BigBox>
              <FieldError message={errors.cylinders_installed?.message} />
              <FieldError message={errors.paid_amount?.message} />
            </>
          ) : null}

          {isBuyIron ? (
            <>
              {/* Cylinders — user enters how many received (buying empty cylinders) */}
              <BigBox title={CUSTOMER_WORDING.cylinders} defaultExpanded>
                <StandaloneField>
                  <Controller
                    control={control}
                    name="cylinders_received"
                    rules={{
                      validate: (val) => (Number(val) || 0) > 0 || "Received must be greater than 0",
                    }}
                    render={({ field }) => (
                      <FieldCell
                        title={CUSTOMER_WORDING.received}
                        comment={`Empty ${formatLedgerNumber(inventoryBaseEmptyForGas)} -> ${formatLedgerNumber(inventoryEmptyAfterReceived)}`}
                        value={Number(field.value) || 0}
                        onIncrement={() => adjustReceived(1)}
                        onDecrement={() => adjustReceived(-1)}
                        onChangeText={field.onChange}
                        error={Boolean(errors.cylinders_received)}
                        inputRef={(node) => { inputRefs.current.cylinders_received = node; }}
                        onFocus={() => { setAvoidKeyboard(true); setFocusTarget("amounts"); scrollToAmountsAndTotals(); }}
                        onBlur={() => setFocusTarget(null)}
                        steppers={quantitySteppers}
                      />
                    )}
                  />
                </StandaloneField>
              </BigBox>

              {/* Iron — QTY mirrors received, Iron Price adjustable, Total computed */}
              <BigBox title="Iron Buying Price - From Customer">
                <View style={styles.tradeEquationRow}>
                  <View style={[styles.tradeStatCell, styles.tradeStatCellNarrow]}>
                    <Text style={styles.tradeStatLabel}>QTY</Text>
                    <View style={styles.tradeStatValueWrap}>
                      <Text style={styles.tradeStatValue}>{received}</Text>
                    </View>
                  </View>
                  <View style={styles.tradeOperatorCell}>
                    <View style={styles.tradeOperatorTopSpacer} />
                    <View style={styles.tradeStatValueWrap}>
                      <Text style={styles.tradeOperator}>x</Text>
                    </View>
                  </View>
                  <FieldCell
                    title="Iron Price"
                    value={Number(ironPriceInput) || 0}
                    onIncrement={() => adjustIronPrice(5)}
                    onDecrement={() => adjustIronPrice(-5)}
                    onChangeText={(t) => { setIronPriceDirty(true); setIronPriceInput(t); }}
                    steppers={replacementMoneySteppers}
                    onFocus={() => { setAvoidKeyboard(true); setFocusTarget("payments"); }}
                    onBlur={() => setFocusTarget(null)}
                  />
                  <View style={styles.tradeOperatorCell}>
                    <View style={styles.tradeOperatorTopSpacer} />
                    <View style={styles.tradeStatValueWrap}>
                      <Text style={styles.tradeOperator}>=</Text>
                    </View>
                  </View>
                  <View style={[styles.tradeStatCell, styles.tradeStatCellNarrow]}>
                    <Text style={styles.tradeStatLabel}>TOTAL</Text>
                    <View style={styles.tradeStatValueWrap}>
                      <Text style={styles.tradeStatValue}>{ironLineTotal}</Text>
                    </View>
                  </View>
                </View>
              </BigBox>

              {/* Money — Total is read-only (auto from computedTradeTotal), Paid is editable */}
              <BigBox title={CUSTOMER_WORDING.money} defaultExpanded>
                <View
                  style={styles.entryFieldPair}
                  onLayout={(event) => {
                    const { y, height } = event.nativeEvent.layout;
                    setTotalsLayout({ y, height });
                  }}
                >
                  <FieldCell
                    title={CUSTOMER_WORDING.total}
                    comment=" "
                    value={computedTradeTotal}
                    onIncrement={() => {}}
                    onDecrement={() => {}}
                    editable={false}
                  />
                  <Controller
                    control={control}
                    name="paid_amount"
                    rules={{
                      validate: (val) => (Number(val) || 0) >= 0 || "Paid cannot be negative",
                    }}
                    render={({ field }) => (
                      <FieldCell
                        title={CUSTOMER_WORDING.paid}
                        comment={`Wallet ${formatLedgerNumber(walletBalance)} -> ${formatLedgerNumber(walletAfterCustomerOutflow)}`}
                        value={Number(field.value) || 0}
                        onIncrement={() => adjustPaidAmount(5)}
                        onDecrement={() => adjustPaidAmount(-5)}
                        onChangeText={(text) => { setPaidDirty(true); field.onChange(text); }}
                        error={Boolean(errors.paid_amount)}
                        inputRef={(node) => { inputRefs.current.paid_amount = node; }}
                        onFocus={() => { setPaidDirty(true); setAvoidKeyboard(true); setFocusTarget("payments"); }}
                        onBlur={() => setFocusTarget(null)}
                        steppers={replacementMoneySteppers}
                      />
                    )}
                  />
                </View>
              </BigBox>
              <FieldError message={errors.cylinders_received?.message} />
              <FieldError message={errors.paid_amount?.message} />
            </>
          ) : null}

      <View style={styles.sectionCard}>
        <FieldLabel>{CUSTOMER_WORDING.notes}</FieldLabel>
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
        <FooterActions
          onSave={savePrimaryHandler}
          onSaveAndAdd={saveSecondaryHandler}
          saveLabel={savePrimaryLabel}
          saveDisabled={saveDisabled}
          saving={saveBusy}
        />
      ) : null}
      {hasCustomer ? (
        <>
          {showStickyPayment && (
            <View
              style={[styles.stickyPayment, { bottom: 8 }]}
            >
              <Text style={styles.stickyLabel}>Total / Paid</Text>
              <View style={styles.entryFieldPair}>
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
  return <MinuteTimePickerModal visible={visible} value={value} onSelect={onSelect} onClose={onClose} />;
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
  headerBlock: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 4,
    backgroundColor: "#f3f5f7",
  },
  title: { fontSize: 26, fontWeight: "800", color: "#0f172a" },
  modeRow: { flexDirection: "row", gap: 8, marginTop: 6, marginBottom: 2, paddingRight: 14 },
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
  entryFieldPair: {
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
  },
  entryFieldPairSingle: {
    width: "50%",
    minWidth: 160,
    alignSelf: "center",
  },
  bigBoxActionRow: {
    marginTop: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  nowButton: {
    alignSelf: "stretch",
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#0a7ea4",
    alignItems: "center",
    justifyContent: "center",
  },
  nowButtonText: { color: "#fff", fontWeight: "700" },
  amountInput: {
    flex: 1,
    textAlign: "center",
    minWidth: 72,
    paddingHorizontal: 6,
  },
  stepperBtnDisabled: {
    opacity: 0.4,
  },
  amountCell: {
    flex: 1,
    gap: 6,
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
  tradeEquationRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  tradeStatCell: {
    width: 84,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    alignItems: "stretch",
    gap: 8,
  },
  tradeStatCellNarrow: {
    width: 72,
  },
  tradeStatValueWrap: {
    width: "100%",
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  tradeStatLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    textAlign: "center",
  },
  tradeStatValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#94a3b8",
    textAlign: "center",
  },
  tradeOperatorCell: {
    width: 20,
    paddingTop: 12,
    alignItems: "center",
    gap: 8,
  },
  tradeOperatorTopSpacer: {
    height: 14,
  },
  tradeOperator: {
    fontSize: 22,
    fontWeight: "700",
    color: "#94a3b8",
    textAlign: "center",
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

