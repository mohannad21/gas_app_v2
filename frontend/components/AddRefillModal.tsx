import { Ionicons } from "@expo/vector-icons";
import type { AxiosError } from "axios";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { gasColor } from "@/constants/gas";
import BigBox from "@/components/entry/BigBox";
import { FieldCell, type FieldStepper } from "@/components/entry/FieldPair";
import InlineWalletFundingPrompt from "@/components/InlineWalletFundingPrompt";
import { formatBalanceTransitions, makeBalanceTransition } from "@/lib/balanceTransitions";
import { formatDateLocale, formatTimeHM } from "@/lib/date";
import {
  calcCompanyCylinderLedgerDelta,
  calcMoneyUiResult,
} from "@/lib/ledgerMath";
import {
  useCreateRefill,
  useInitInventory,
  useInventoryRefillDetails,
  useInventorySnapshot,
  useUpdateRefill,
} from "@/hooks/useInventory";
import { usePriceSettings } from "@/hooks/usePrices";
import { useCompanyBalances } from "@/hooks/useCompanyBalances";
import { CUSTOMER_WORDING } from "@/lib/wording";

type SavedRefillEntry = {
  id: string;
  date: string;
  time: string;
  buy12: number;
  return12: number;
  buy48: number;
  return48: number;
  total_cost: number;
  paid_now: number;
};

type EditRefillEntry = {
  refill_id: string;
  date: string;
  time_of_day?: "morning" | "evening";
  effective_at?: string;
  buy12: number;
  return12: number;
  buy48: number;
  return48: number;
};

type AddRefillModalProps = {
  visible: boolean;
  onClose: () => void;
  onSaved: (entry: SavedRefillEntry) => void;
  accessoryId?: string;
  editEntry?: EditRefillEntry | null;
};

type InventoryNotInitializedDetail = {
  code?: string;
};

type InventoryNegativeDetail = {
  code?: string;
  gas_type?: string;
  field?: string;
  available?: number;
  attempt?: number;
};

function getNowDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNowTime() {
  const now = new Date();
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function normalizeIso(value: string) {
  const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value);
  return hasZone ? value : `${value}Z`;
}

function subtractSeconds(isoValue: string, seconds: number) {
  const parsed = new Date(normalizeIso(isoValue));
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setSeconds(parsed.getSeconds() - seconds);
  return parsed.toISOString();
}

function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined) return "--";
  return value.toString();
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "--";
  return Number(value).toFixed(0);
}

function sanitizeCountInput(value: string) {
  if (!value.trim()) return "";
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return "";
  return String(Math.max(0, parsed));
}

export function RefillForm({
  visible,
  onClose,
  onSaved,
  accessoryId,
  editEntry,
  showHeader = true,
  useCard = true,
  containerStyle,
  scrollStyle,
  mode = "refill",
  walletBalance = 0,
}: AddRefillModalProps & {
  showHeader?: boolean;
  useCard?: boolean;
  containerStyle?: any;
  scrollStyle?: any;
  mode?: "refill" | "buy" | "return";
  walletBalance?: number;
}) {
  const FIELD_MONEY_STEPPERS: FieldStepper[] = [
    { delta: 20, label: "+20", position: "top" },
    { delta: -5, label: "-5", position: "left" },
    { delta: 5, label: "+5", position: "right" },
    { delta: -20, label: "-20", position: "bottom" },
  ];
  const FIELD_QTY_STEPPERS: FieldStepper[] = [
    { delta: -1, label: "−", position: "left" },
    { delta: 1, label: "+", position: "right" },
  ];
  const createRefill = useCreateRefill();
  const updateRefill = useUpdateRefill();
  const initInventory = useInitInventory();
  const refillDetailsQuery = useInventoryRefillDetails(editEntry?.refill_id);
  const refillDetails = refillDetailsQuery.data;
  const pricesQuery = usePriceSettings();
  const [date, setDate] = useState(getNowDate());
  const [time, setTime] = useState(getNowTime());
  const companyBalancesQuery = useCompanyBalances();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [buy12, setBuy12] = useState("");
  const [ret12, setRet12] = useState("");
  const [buy48, setBuy48] = useState("");
  const [ret48, setRet48] = useState("");
  const [ret12Touched, setRet12Touched] = useState(false);
  const [ret48Touched, setRet48Touched] = useState(false);
  const [paidNow, setPaidNow] = useState("");
  const [paidTouched, setPaidTouched] = useState(false);
  const [initOpen, setInitOpen] = useState(false);
  const [initCounts, setInitCounts] = useState({ full12: "", empty12: "", full48: "", empty48: "" });
  const [price12Input, setPrice12Input] = useState("");
  const [price48Input, setPrice48Input] = useState("");
  const [price12Dirty, setPrice12Dirty] = useState(false);
  const [price48Dirty, setPrice48Dirty] = useState(false);
  const [ironPrice12Input, setIronPrice12Input] = useState("");
  const [ironPrice48Input, setIronPrice48Input] = useState("");
  const [notes, setNotes] = useState(""); // New state for notes
  const accessoryViewId = accessoryId;
  const paidAccessoryViewId = Platform.OS === "ios" ? "refillPaidAccessory" : undefined;
  const isBuyMode = mode === "buy";
  const isReturnMode = mode === "return";

  const prevVisible = useRef(visible);
  useEffect(() => {
    if (!prevVisible.current && visible) {
      if (editEntry) {
        setDate(editEntry.date);
        if (editEntry.effective_at) {
          const parsed = new Date(editEntry.effective_at);
          if (!Number.isNaN(parsed.getTime())) {
            setTime(formatTimeHM(parsed, { hour12: false }));
          }
        } else if (editEntry.time_of_day) {
          setTime(editEntry.time_of_day === "morning" ? "09:00" : "18:00");
        }
        setBuy12(String(editEntry.buy12));
        setRet12(String(editEntry.return12));
        setBuy48(String(editEntry.buy48));
        setRet48(String(editEntry.return48));
        setRet12Touched(true);
        setRet48Touched(true);
        setPaidTouched(false);
        setNotes(refillDetails?.notes ?? ""); // Initialize notes
        setPrice12Dirty(false);
        setPrice48Dirty(false);
        setIronPrice12Input("0");
        setIronPrice48Input("0");
      } else {
        setDate(getNowDate());
        setTime(getNowTime());
        setBuy12("");
        setRet12("");
        setBuy48("");
        setRet48("");
        setRet12Touched(false);
        setRet48Touched(false);
        setPaidNow("");
        setPaidTouched(false);
        setNotes(""); // Clear notes for new entry
        setPrice12Dirty(false);
        setPrice48Dirty(false);
        setIronPrice12Input("0");
        setIronPrice48Input("0");
      }
      if (isBuyMode) {
        setRet12("0");
        setRet48("0");
        setRet12Touched(true);
        setRet48Touched(true);
      }
      if (isReturnMode) {
        setBuy12("0");
        setBuy48("0");
      }
    }
    prevVisible.current = visible;
  }, [visible, editEntry, refillDetails, isBuyMode, isReturnMode]); // Added refillDetails to dependencies

  useEffect(() => {
    if (!visible || !editEntry?.effective_at) return;
    const parsed = new Date(editEntry.effective_at);
    if (Number.isNaN(parsed.getTime())) return;
    setTime(formatTimeHM(parsed, { hour12: false }));
  }, [visible, editEntry?.effective_at]);

  useEffect(() => {
    if (!visible || !isBuyMode) return;
    setRet12("0");
    setRet48("0");
    setRet12Touched(true);
    setRet48Touched(true);
  }, [isBuyMode, visible]);

  useEffect(() => {
    if (!visible || !isReturnMode) return;
    setBuy12("0");
    setBuy48("0");
  }, [isReturnMode, visible]);

  const snapshotAt = useMemo(() => {
    if (!editEntry?.effective_at) return null;
    return subtractSeconds(editEntry.effective_at, 1);
  }, [editEntry?.effective_at]);
  const snapshotQuery = useInventorySnapshot(
    visible ? (snapshotAt ? { at: snapshotAt } : { date, time }) : undefined
  );
  const base = useMemo(() => {
    if (editEntry?.refill_id) {
      if (!refillDetails) return null;
      return {
        as_of: refillDetails.effective_at,
        full12: refillDetails.before_full_12 ?? 0,
        empty12: refillDetails.before_empty_12 ?? 0,
        total12: (refillDetails.before_full_12 ?? 0) + (refillDetails.before_empty_12 ?? 0),
        full48: refillDetails.before_full_48 ?? 0,
        empty48: refillDetails.before_empty_48 ?? 0,
        total48: (refillDetails.before_full_48 ?? 0) + (refillDetails.before_empty_48 ?? 0),
        reason: null,
      };
    }
    return snapshotQuery.data ?? null;
  }, [editEntry?.refill_id, refillDetails, snapshotQuery.data]);
  const errorDetail = (snapshotQuery.error as AxiosError<{ detail?: InventoryNotInitializedDetail }>)?.response?.data
    ?.detail;
  const inventoryNotInitialized = !base && errorDetail?.code === "inventory_not_initialized";

  const resolveBuyingPrice = (gas: "12kg" | "48kg", target: Date) => {
    const prices = pricesQuery.data ?? [];
    const matches = prices.filter((entry) => {
      if (entry.gas_type !== gas) return false;
      if (entry.buying_price === null || entry.buying_price === undefined) return false;
      return new Date(entry.effective_from) <= target;
    });
    matches.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
    return matches[0]?.buying_price ?? 0;
  };

  const priceTarget = useMemo(() => {
    if (editEntry?.effective_at) {
      const parsed = new Date(normalizeIso(editEntry.effective_at));
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    const fallback = new Date(`${date}T${time}:00`);
    if (!Number.isNaN(fallback.getTime())) return fallback;
    return new Date(date);
  }, [editEntry?.effective_at, date, time]);

  const buy12Price = resolveBuyingPrice("12kg", priceTarget);
  const buy48Price = resolveBuyingPrice("48kg", priceTarget);
  useEffect(() => {
    if (price12Dirty) return;
    if (buy12Price > 0) {
      setPrice12Input(buy12Price.toString());
    }
  }, [buy12Price, price12Dirty]);
  useEffect(() => {
    if (price48Dirty) return;
    if (buy48Price > 0) {
      setPrice48Input(buy48Price.toString());
    }
  }, [buy48Price, price48Dirty]);

  const price12Value = Number(price12Input) || 0;
  const price48Value = Number(price48Input) || 0;
  const ironPrice12Value = Number(ironPrice12Input) || 0;
  const ironPrice48Value = Number(ironPrice48Input) || 0;

  const buy12Value = Number(buy12) || 0;
  const buy48Value = Number(buy48) || 0;
  const ret12Value = Number(ret12) || 0;
  const ret48Value = Number(ret48) || 0;
  const totalBuy12 = buy12Value;
  const totalBuy48 = buy48Value;

  const companyBalances = companyBalancesQuery.data ?? null;
  const companyBalanceReady = companyBalancesQuery.isSuccess;
  const originalMoneyResult = editEntry
    ? calcMoneyUiResult(Number(refillDetails?.total_cost ?? 0), Number(refillDetails?.paid_now ?? 0))
    : 0;
  const baseMoneyNet = Number(companyBalances?.company_money ?? 0) - originalMoneyResult;
  const line12Cost = totalBuy12 * price12Value;
  const line48Cost = totalBuy48 * price48Value;
  const ironLine12Cost = isBuyMode ? totalBuy12 * ironPrice12Value : 0;
  const ironLine48Cost = isBuyMode ? totalBuy48 * ironPrice48Value : 0;
  const totalCost = line12Cost + line48Cost + ironLine12Cost + ironLine48Cost;
  useEffect(() => {
    if (paidTouched) return;
    setPaidNow(totalCost ? totalCost.toString() : "");
  }, [totalCost, paidTouched]);

  const paidNowValue = Number(paidNow) || 0;
  const moneyResult = calcMoneyUiResult(totalCost, paidNowValue);

  const availableEmpty12 = base?.empty12 ?? 0;
  const availableEmpty48 = base?.empty48 ?? 0;
  const return12Invalid = ret12Value > availableEmpty12;
  const return48Invalid = ret48Value > availableEmpty48;
  const liveMoneyNet = baseMoneyNet + moneyResult;
  const liveMoneyGive = Math.max(liveMoneyNet, 0);
  const originalDelta12 = editEntry ? calcCompanyCylinderLedgerDelta(editEntry.buy12, editEntry.return12) : 0;
  const originalDelta48 = editEntry ? calcCompanyCylinderLedgerDelta(editEntry.buy48, editEntry.return48) : 0;
  // Only actual swaps affect company cylinders (new shells do not).
  const delta12 = isBuyMode ? 0 : calcCompanyCylinderLedgerDelta(buy12Value, ret12Value);
  const delta48 = isBuyMode ? 0 : calcCompanyCylinderLedgerDelta(buy48Value, ret48Value);

  // Recalculate net company balance for display purposes, excluding new shells from the 'buy' side that affect company debt
  const baseCompanyNet12 = Number(companyBalances?.company_cyl_12 ?? 0);
  const baseCompanyNet48 = Number(companyBalances?.company_cyl_48 ?? 0);
  const adjustedBase12 = baseCompanyNet12 - originalDelta12;
  const adjustedBase48 = baseCompanyNet48 - originalDelta48;
  const owedReturn12 = Math.max(-adjustedBase12, 0);
  const owedReturn48 = Math.max(-adjustedBase48, 0);
  const disableReturn12 = isReturnMode && owedReturn12 <= 0;
  const disableReturn48 = isReturnMode && owedReturn48 <= 0;
  const liveCompanyNet12 = adjustedBase12 + delta12;
  const liveCompanyNet48 = adjustedBase48 + delta48;
  const liveReceive12 = Math.max(liveCompanyNet12, 0);
  const liveReceive48 = Math.max(liveCompanyNet48, 0);
  const liveGive12 = Math.max(-liveCompanyNet12, 0);
  const liveGive48 = Math.max(-liveCompanyNet48, 0);
  const companyMoneyTransitionLines = formatBalanceTransitions(
    [makeBalanceTransition("company", "money", baseMoneyNet, liveMoneyNet)],
    {
      mode: "transition",
      collapseAllSettled: true,
      intent: isBuyMode ? "company_buy_iron" : isReturnMode ? "company_settle" : "company_refill",
      formatMoney,
    }
  );
  const company12TransitionLines = formatBalanceTransitions(
    [makeBalanceTransition("company", "cyl_12", adjustedBase12, liveCompanyNet12)],
    {
      mode: "transition",
      collapseAllSettled: true,
      intent: isBuyMode ? "company_buy_iron" : isReturnMode ? "company_settle" : "company_refill",
      formatMoney,
    }
  );
  const company48TransitionLines = formatBalanceTransitions(
    [makeBalanceTransition("company", "cyl_48", adjustedBase48, liveCompanyNet48)],
    {
      mode: "transition",
      collapseAllSettled: true,
      intent: isBuyMode ? "company_buy_iron" : isReturnMode ? "company_settle" : "company_refill",
      formatMoney,
    }
  );

  const balanceAlertLines = useMemo(() => {
    if (isReturnMode) {
      return [...company12TransitionLines, ...company48TransitionLines].filter(
        (line) => line !== "All settled \u2705"
      );
    }
    if (isBuyMode) {
      return companyMoneyTransitionLines;
    }
    return [...companyMoneyTransitionLines, ...company12TransitionLines, ...company48TransitionLines];
  }, [
    company12TransitionLines,
    company48TransitionLines,
    companyMoneyTransitionLines,
    isBuyMode,
    isReturnMode,
  ]);
  const cylinderStatusLine = !companyBalanceReady
    ? "Current company balances unavailable. Preview is disabled until balances load."
    : balanceAlertLines.length > 0
      ? balanceAlertLines.join("\n")
      : CUSTOMER_WORDING.cylinderSettled;
  const moneyStatusLine = !companyBalanceReady
    ? "Current company balances unavailable. Preview is disabled until balances load."
    : companyMoneyTransitionLines.length > 0
      ? companyMoneyTransitionLines.join("\n")
      : CUSTOMER_WORDING.moneySettled;

  useEffect(() => {
    if (disableReturn12 && ret12Value !== 0) {
      setRet12Touched(true);
      setRet12("0");
    }
  }, [disableReturn12, ret12Value]);

  useEffect(() => {
    if (disableReturn48 && ret48Value !== 0) {
      setRet48Touched(true);
      setRet48("0");
    }
  }, [disableReturn48, ret48Value]);

  const full12Color = totalBuy12 > 0 ? "#f97316" : "#64748b";
  const full48Color = totalBuy48 > 0 ? "#f97316" : "#64748b";
  const empty12Color = ret12Value > 0 ? "#f97316" : "#64748b";
  const empty48Color = ret48Value > 0 ? "#f97316" : "#64748b";

  const afterFull12 = base ? (base.full12 ?? 0) + totalBuy12 : null;
  const afterEmpty12 = base ? (base.empty12 ?? 0) - ret12Value : null;
  const afterFull48 = base ? (base.full48 ?? 0) + totalBuy48 : null;
  const afterEmpty48 = base ? (base.empty48 ?? 0) - ret48Value : null;
  const gasLabelStyle = (gas: "12kg" | "48kg") => ({
    color: gasColor(gas),
    fontWeight: "700" as const,
  });

  const disableSave =
    !companyBalanceReady ||
    inventoryNotInitialized ||
    !base ||
    return12Invalid ||
    return48Invalid ||
    createRefill.isPending ||
    updateRefill.isPending ||
    initInventory.isPending;

  const payloadBuy12 = isReturnMode ? 0 : buy12Value;
  const payloadBuy48 = isReturnMode ? 0 : buy48Value;
  const payloadReturn12 = isBuyMode ? 0 : ret12Value;
  const payloadReturn48 = isBuyMode ? 0 : ret48Value;

  const handleSave = async () => {
    if (!base || inventoryNotInitialized) {
      Alert.alert("Inventory not initialized", "Set starting inventory before adding a refill.");
      return;
    }
    if (return12Invalid) {
      Alert.alert(
        "Invalid return",
              {/* -- 12kg Cylinders -- */}
      );
      return;
    }
    if (return48Invalid) {
      Alert.alert(
        "Invalid return",
              {/* -- 48kg Cylinders -- */}
      );
      return;
    }

    try {
      if (editEntry?.refill_id) {
        await updateRefill.mutateAsync({
          refillId: editEntry.refill_id,
          buy12: payloadBuy12,
          return12: payloadReturn12,
          buy48: payloadBuy48,
          return48: payloadReturn48,
          notes: notes.trim() ? notes.trim() : undefined,
          total_cost: totalCost,
          debt_cash: liveMoneyGive,
          debt_cylinders_12: liveCompanyNet12,
          debt_cylinders_48: liveCompanyNet48,
        });
      } else {
        await createRefill.mutateAsync({
          date,
          time,
          buy12: payloadBuy12,
          return12: payloadReturn12,
          buy48: payloadBuy48,
          return48: payloadReturn48,
          paid_now: paidNowValue,
          notes: notes.trim() ? notes.trim() : undefined,
          total_cost: totalCost,
          debt_cash: liveMoneyGive,
          debt_cylinders_12: liveCompanyNet12,
          debt_cylinders_48: liveCompanyNet48,
        });
      }
      Keyboard.dismiss();
      onSaved({
        id: editEntry?.refill_id ?? `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        date,
        time,
        buy12: buy12Value,
        return12: ret12Value,
        buy48: buy48Value,
        return48: ret48Value,
        total_cost: totalCost,
        paid_now: paidNowValue,
      });
      onClose();
    } catch (err) {
      const detail = (err as AxiosError<{ detail?: InventoryNegativeDetail }>).response?.data?.detail;
      if (detail?.code === "inventory_negative" && detail.gas_type && detail.available !== undefined) {
        Alert.alert(
          "Invalid return",
          `You only have ${detail.available} empty ${detail.gas_type} cylinders. You entered return=${detail.attempt}.`
        );
        return;
      }
      Alert.alert("Save failed", "Please try again.");
    }
  };
  const handleBuy12Change = (value: string) => {
    if (isReturnMode) return;
    const next = sanitizeCountInput(value);
    setBuy12(next);
    if (!ret12Touched && !isBuyMode) {
      setRet12(next);
    }
  };
  const handleBuy48Change = (value: string) => {
    if (isReturnMode) return;
    const next = sanitizeCountInput(value);
    setBuy48(next);
    if (!ret48Touched && !isBuyMode) {
      setRet48(next);
    }
  };

  const canEditBuy = !isReturnMode;
  const canEditReturn = !isBuyMode;
  const canEditMoney = !isReturnMode;
  const refillWalletShortfall = canEditMoney ? Math.max(paidNowValue - walletBalance, 0) : 0;

  const adjustBuy12 = (delta: number) => {
    if (!canEditBuy) return;
    handleBuy12Change(String(Math.max(buy12Value + delta, 0)));
  };
  const adjustBuy48 = (delta: number) => {
    if (!canEditBuy) return;
    handleBuy48Change(String(Math.max(buy48Value + delta, 0)));
  };
  const adjustReturn12 = (delta: number) => {
    if (!canEditReturn) return;
    const next = Math.max(ret12Value + delta, 0);
    setRet12Touched(true);
    setRet12(String(next));
  };
  const adjustReturn48 = (delta: number) => {
    if (!canEditReturn) return;
    const next = Math.max(ret48Value + delta, 0);
    setRet48Touched(true);
    setRet48(String(next));
  };
  const adjustPaid = (delta: number) => {
    if (!canEditMoney) return;
    const current = Number(paidNow) || 0;
    const next = Math.max(current + delta, 0);
    setPaidTouched(true);
    setPaidNow(String(next));
  };
  const adjustIronPrice12 = (delta: number) => {
    if (!canEditMoney || !isBuyMode) return;
    const current = Number(ironPrice12Input) || 0;
    const next = Math.max(current + delta, 0);
    setIronPrice12Input(String(next));
  };
  const adjustIronPrice48 = (delta: number) => {
    if (!canEditMoney || !isBuyMode) return;
    const current = Number(ironPrice48Input) || 0;
    const next = Math.max(current + delta, 0);
    setIronPrice48Input(String(next));
  };

  const footerActions = (
    <View style={[styles.footerActions, !useCard && styles.footerInline]}>
      <Pressable style={styles.secondaryBtn} onPress={onClose}>
        <Text style={styles.secondaryText}>Cancel</Text>
      </Pressable>
      <Pressable
        style={[styles.primaryBtn, disableSave && styles.disabledBtn]}
        onPress={handleSave}
        disabled={disableSave}
      >
        <Text style={styles.primaryText}>{createRefill.isPending ? "Saving..." : "Save"}</Text>
      </Pressable>
    </View>
  );

  return (
    <>
      <View
        style={[
          useCard ? styles.modalCard : styles.modalInner,
          containerStyle,
          !useCard && styles.fullScreenWrap,
        ]}
      >
        {showHeader ? (
          <View style={styles.headerRow}>
            <Text style={styles.title}>{editEntry ? "Update Inventory" : "Add Inventory"}</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={20} color="#0f172a" />
            </Pressable>
          </View>
        ) : null}
        <ScrollView
          style={scrollStyle}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
              <View style={styles.section}>
                <Text style={styles.label}>Date & time</Text>
                <View style={styles.row}>
                  <Pressable
                    style={[styles.dateField, editEntry && styles.dateFieldDisabled]}
                    onPress={editEntry ? undefined : () => setCalendarOpen(true)}
                  >
                    <Text style={styles.dateText}>{date}</Text>
                    <Ionicons name="calendar-outline" size={16} color="#0a7ea4" />
                  </Pressable>
                  <Pressable
                    style={[styles.dateField, editEntry && styles.dateFieldDisabled]}
                    onPress={editEntry ? undefined : () => setTimeOpen(true)}
                  >
                    <Text style={styles.dateText}>{time}</Text>
                    <Ionicons name="time-outline" size={16} color="#0a7ea4" />
                  </Pressable>
                  <Pressable
                    style={[styles.nowButton, editEntry && styles.dateFieldDisabled]}
                    onPress={editEntry ? undefined : () => {
                      const now = new Date();
                      const year = now.getFullYear();
                      const month = String(now.getMonth() + 1).padStart(2, "0");
                      const day = String(now.getDate()).padStart(2, "0");
                      const hours = String(now.getHours()).padStart(2, "0");
                      const minutes = String(now.getMinutes()).padStart(2, "0");
                      setDate(`${year}-${month}-${day}`);
                      setTime(`${hours}:${minutes}`);
                    }}
                  >
                    <Text style={styles.nowButtonText}>Now</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.liveRow}>
                  <View style={styles.liveCard}>
                    <Text style={styles.liveTitle}>Live inventory</Text>
                    {inventoryNotInitialized ? (
                      <View style={styles.noticeInline}>
                        <Text style={styles.noticeText}>
                          Inventory not initialized. Set starting inventory first.
                        </Text>
                        <Pressable style={styles.noticeButton} onPress={() => setInitOpen(true)}>
                          <Text style={styles.noticeButtonText}>Initialize inventory</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <View style={styles.balanceBlock}>
                        <Text style={styles.balanceLine}>
                          <Text style={gasLabelStyle("12kg")}>12kg</Text> Full {formatCount(base?.full12)}{" "}
                          <Text style={styles.balanceArrow}>-&gt;</Text>{" "}
                          <Text style={[styles.balanceNew, { color: full12Color }]}>{formatCount(afterFull12)}</Text>
                        </Text>
                        {!isBuyMode ? (
                          <Text style={styles.balanceLine}>
                            <Text style={gasLabelStyle("12kg")}>12kg</Text> Empty {formatCount(base?.empty12)}{" "}
                            <Text style={styles.balanceArrow}>-&gt;</Text>{" "}
                            <Text style={[styles.balanceNew, { color: empty12Color }]}>{formatCount(afterEmpty12)}</Text>
                          </Text>
                        ) : null}
                        <Text style={styles.balanceLine}>
                          <Text style={gasLabelStyle("48kg")}>48kg</Text> Full {formatCount(base?.full48)}{" "}
                          <Text style={styles.balanceArrow}>-&gt;</Text>{" "}
                          <Text style={[styles.balanceNew, { color: full48Color }]}>{formatCount(afterFull48)}</Text>
                        </Text>
                        {!isBuyMode ? (
                          <Text style={styles.balanceLine}>
                            <Text style={gasLabelStyle("48kg")}>48kg</Text> Empty {formatCount(base?.empty48)}{" "}
                            <Text style={styles.balanceArrow}>-&gt;</Text>{" "}
                            <Text style={[styles.balanceNew, { color: empty48Color }]}>{formatCount(afterEmpty48)}</Text>
                          </Text>
                        ) : null}
                      </View>
                    )}
                  </View>
                  {!isBuyMode ? (
                    <View style={styles.companyCard}>
                      <Text style={styles.companyTitle}>Company balance</Text>
                      <Text
                        style={styles.companyLine}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.85}
                      >
                        <Text style={[styles.companyGasLabel, { color: gasColor("12kg") }]}>12kg</Text> company give:{" "}
                        <Text style={styles.companyAlertValue}>{liveReceive12}</Text>
                      </Text>
                      <Text
                        style={styles.companyLine}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.85}
                      >
                        <Text style={[styles.companyGasLabel, { color: gasColor("12kg") }]}>12kg</Text> you return:{" "}
                        <Text style={styles.companyAlertValue}>{liveGive12}</Text>
                      </Text>
                      <Text
                        style={styles.companyLine}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.85}
                      >
                        <Text style={[styles.companyGasLabel, { color: gasColor("48kg") }]}>48kg</Text> company give:{" "}
                        <Text style={styles.companyAlertValue}>{liveReceive48}</Text>
                      </Text>
                      <Text
                        style={styles.companyLine}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.85}
                      >
                        <Text style={[styles.companyGasLabel, { color: gasColor("48kg") }]}>48kg</Text> you return:{" "}
                        <Text style={styles.companyAlertValue}>{liveGive48}</Text>
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* ════════════════════════════════════════════
                  CYLINDERS
                  - Refill:  [Buy 12kg] [Return 12kg] side by side in ONE BigBox
                             [Buy 48kg] [Return 48kg] side by side in same BigBox
                  - Return:  [Return 12kg] centered  /  [Return 48kg] centered (2 BigBoxes)
                  - Buy:     ONE BigBox with [Buy 12kg left] [Buy 48kg right]
              ════════════════════════════════════════════ */}

              {isBuyMode ? (
                /* BUY — one Cylinders BigBox, 12kg left / 48kg right */
                <BigBox
                  title={CUSTOMER_WORDING.cylinders}
                  statusLine={cylinderStatusLine}
                  statusIsAlert={false}
                >
                  <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                    <FieldCell
                      title="12kg Buy"
                      value={buy12Value}
                      onIncrement={() => adjustBuy12(1)}
                      onDecrement={() => adjustBuy12(-1)}
                      onChangeText={handleBuy12Change}
                      steppers={FIELD_QTY_STEPPERS}
                    />
                    <FieldCell
                      title="48kg Buy"
                      value={buy48Value}
                      onIncrement={() => adjustBuy48(1)}
                      onDecrement={() => adjustBuy48(-1)}
                      onChangeText={handleBuy48Change}
                      steppers={FIELD_QTY_STEPPERS}
                    />
                  </View>
                </BigBox>
              ) : isReturnMode ? (
                /* RETURN — separate BigBox per gas type */
                <>
                  <BigBox
                    title="12kg Cylinders"
                    statusLine={cylinderStatusLine}
                    statusIsAlert={liveCompanyNet12 < 0}
                  >
                    <View style={styles.entryFieldPairSingle}>
                      <FieldCell
                        title="Return"
                        value={ret12Value}
                        onIncrement={() => adjustReturn12(1)}
                        onDecrement={() => adjustReturn12(-1)}
                        onChangeText={(text) => { setRet12Touched(true); setRet12(sanitizeCountInput(text)); }}
                        editable={!disableReturn12}
                        error={return12Invalid}
                        steppers={FIELD_QTY_STEPPERS}
                      />
                    </View>
                    {owedReturn12 > 0 ? (
                      <View style={styles.bigBoxActionRow}>
                        <Pressable
                          style={[
                            styles.inlineActionButton,
                            ret12Value === owedReturn12 ? null : styles.inlineActionButtonSuccess,
                          ]}
                          onPress={() => {
                            setRet12Touched(true);
                            setRet12(ret12Value === owedReturn12 ? "0" : String(owedReturn12));
                          }}
                        >
                          <Text style={styles.inlineActionText}>
                            {ret12Value === owedReturn12 ? CUSTOMER_WORDING.didntReturn : CUSTOMER_WORDING.returnAll}
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                    {return12Invalid ? (
                      <Text style={styles.errorText}>
                        Only {availableEmpty12} empty 12kg on hand. Entered {ret12Value}.
                      </Text>
                    ) : null}
                  </BigBox>

                  <BigBox
                    title="48kg Cylinders"
                    statusLine={cylinderStatusLine}
                    statusIsAlert={liveCompanyNet48 < 0}
                  >
                    <View style={styles.entryFieldPairSingle}>
                      <FieldCell
                        title="Return"
                        value={ret48Value}
                        onIncrement={() => adjustReturn48(1)}
                        onDecrement={() => adjustReturn48(-1)}
                        onChangeText={(text) => { setRet48Touched(true); setRet48(sanitizeCountInput(text)); }}
                        editable={!disableReturn48}
                        error={return48Invalid}
                        steppers={FIELD_QTY_STEPPERS}
                      />
                    </View>
                    {owedReturn48 > 0 ? (
                      <View style={styles.bigBoxActionRow}>
                        <Pressable
                          style={[
                            styles.inlineActionButton,
                            ret48Value === owedReturn48 ? null : styles.inlineActionButtonSuccess,
                          ]}
                          onPress={() => {
                            setRet48Touched(true);
                            setRet48(ret48Value === owedReturn48 ? "0" : String(owedReturn48));
                          }}
                        >
                          <Text style={styles.inlineActionText}>
                            {ret48Value === owedReturn48 ? CUSTOMER_WORDING.didntReturn : CUSTOMER_WORDING.returnAll}
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                    {return48Invalid ? (
                      <Text style={styles.errorText}>
                        Only {availableEmpty48} empty 48kg on hand. Entered {ret48Value}.
                      </Text>
                    ) : null}
                  </BigBox>
                </>
              ) : (
                /* REFILL — one BigBox, 12kg top / 48kg bottom */
                <BigBox
                  title={CUSTOMER_WORDING.cylinders}
                  statusLine={cylinderStatusLine}
                  statusIsAlert={liveCompanyNet12 < 0 || liveCompanyNet48 < 0}
                >
                  {/* 12kg row */}
                  <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                    <FieldCell
                      title="12kg Buy"
                      value={buy12Value}
                      onIncrement={() => adjustBuy12(1)}
                      onDecrement={() => adjustBuy12(-1)}
                      onChangeText={handleBuy12Change}
                      steppers={FIELD_QTY_STEPPERS}
                    />
                    <FieldCell
                      title="12kg Return"
                      value={ret12Value}
                      onIncrement={() => adjustReturn12(1)}
                      onDecrement={() => adjustReturn12(-1)}
                      onChangeText={(text) => { setRet12Touched(true); setRet12(sanitizeCountInput(text)); }}
                      error={return12Invalid}
                      steppers={FIELD_QTY_STEPPERS}
                    />
                  </View>
                  {/* 12kg Return toggle */}
                  <View style={styles.bigBoxActionRow}>
                    <Pressable
                      style={[
                        styles.inlineActionButton,
                        buy12Value > 0 && ret12Value === buy12Value ? null : styles.inlineActionButtonSuccess,
                      ]}
                      onPress={() => {
                        if (buy12Value <= 0) return;
                        setRet12Touched(true);
                        setRet12(buy12Value > 0 && ret12Value === buy12Value ? "0" : String(buy12Value));
                      }}
                    >
                      <Text style={styles.inlineActionText}>
                        {buy12Value > 0 && ret12Value === buy12Value ? CUSTOMER_WORDING.didntReturn : CUSTOMER_WORDING.returned}
                      </Text>
                    </Pressable>
                  </View>
                  {return12Invalid ? (
                    <Text style={styles.errorText}>
                      Only {availableEmpty12} empty 12kg on hand. Entered {ret12Value}.
                    </Text>
                  ) : null}

                  {/* 48kg row */}
                  <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", marginTop: 12 }}>
                    <FieldCell
                      title="48kg Buy"
                      value={buy48Value}
                      onIncrement={() => adjustBuy48(1)}
                      onDecrement={() => adjustBuy48(-1)}
                      onChangeText={handleBuy48Change}
                      steppers={FIELD_QTY_STEPPERS}
                    />
                    <FieldCell
                      title="48kg Return"
                      value={ret48Value}
                      onIncrement={() => adjustReturn48(1)}
                      onDecrement={() => adjustReturn48(-1)}
                      onChangeText={(text) => { setRet48Touched(true); setRet48(sanitizeCountInput(text)); }}
                      error={return48Invalid}
                      steppers={FIELD_QTY_STEPPERS}
                    />
                  </View>
                  {/* 48kg Return toggle */}
                  <View style={styles.bigBoxActionRow}>
                    <Pressable
                      style={[
                        styles.inlineActionButton,
                        buy48Value > 0 && ret48Value === buy48Value ? null : styles.inlineActionButtonSuccess,
                      ]}
                      onPress={() => {
                        if (buy48Value <= 0) return;
                        setRet48Touched(true);
                        setRet48(buy48Value > 0 && ret48Value === buy48Value ? "0" : String(buy48Value));
                      }}
                    >
                      <Text style={styles.inlineActionText}>
                        {buy48Value > 0 && ret48Value === buy48Value ? CUSTOMER_WORDING.didntReturn : CUSTOMER_WORDING.returned}
                      </Text>
                    </Pressable>
                  </View>
                  {return48Invalid ? (
                    <Text style={styles.errorText}>
                      Only {availableEmpty48} empty 48kg on hand. Entered {ret48Value}.
                    </Text>
                  ) : null}
                </BigBox>
              )}

              {/* ════════════════════════════════════════════
                  GAS PRICE + IRON PRICE + MONEY
                  Only shown on Refill and Buy tabs (not Return)
              ════════════════════════════════════════════ */}
              {!isReturnMode ? (
                <>
                  {/* Gas Price 12kg
                      QTY and TOTAL are plain text (tradeStatCell style).
                      Price is a read-only FieldCell (grey, no buttons).
                      A "Set price" button below navigates to the config page
                      (that page is not yet built — the button is a placeholder). */}
                  <BigBox title="Gas Price 12kg">
                    <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                      <View style={styles.tradeStatCell}>
                        <Text style={styles.tradeStatLabel}>QTY</Text>
                        <Text style={styles.tradeStatValue}>{totalBuy12}</Text>
                      </View>
                      <FieldCell
                        title="Price"
                        value={price12Value}
                        onIncrement={() => {}}
                        onDecrement={() => {}}
                        editable={false}
                      />
                      <View style={styles.tradeStatCell}>
                        <Text style={styles.tradeStatLabel}>TOTAL</Text>
                        <Text style={styles.tradeStatValue}>{line12Cost.toFixed(0)}</Text>
                      </View>
                    </View>
                    <View style={styles.bigBoxActionRow}>
                      <Pressable
                        style={[styles.inlineActionButton, styles.inlineActionButtonAlt]}
                        onPress={() => {
                          // TODO: navigate to price config page when implemented
                          // router.push({ pathname: "/prices/config" });
                        }}
                      >
                        <Text style={styles.inlineActionText}>Set price</Text>
                      </Pressable>
                    </View>
                  </BigBox>

                  {/* Gas Price 48kg — same structure */}
                  <BigBox title="Gas Price 48kg">
                    <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                      <View style={styles.tradeStatCell}>
                        <Text style={styles.tradeStatLabel}>QTY</Text>
                        <Text style={styles.tradeStatValue}>{totalBuy48}</Text>
                      </View>
                      <FieldCell
                        title="Price"
                        value={price48Value}
                        onIncrement={() => {}}
                        onDecrement={() => {}}
                        editable={false}
                      />
                      <View style={styles.tradeStatCell}>
                        <Text style={styles.tradeStatLabel}>TOTAL</Text>
                        <Text style={styles.tradeStatValue}>{line48Cost.toFixed(0)}</Text>
                      </View>
                    </View>
                    <View style={styles.bigBoxActionRow}>
                      <Pressable
                        style={[styles.inlineActionButton, styles.inlineActionButtonAlt]}
                        onPress={() => {
                          // TODO: navigate to price config page when implemented
                        }}
                      >
                        <Text style={styles.inlineActionText}>Set price</Text>
                      </Pressable>
                    </View>
                  </BigBox>

                  {/* Iron Price — Buy tab only.
                      QTY and TOTAL are plain text at the same vertical level as
                      the Iron Price FieldCell buttons (alignItems: "center"). */}
                  {isBuyMode ? (
                    <>
                      <BigBox title="Iron Price 12kg">
                        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                          <View style={styles.tradeStatCell}>
                            <Text style={styles.tradeStatLabel}>QTY</Text>
                            <Text style={styles.tradeStatValue}>{totalBuy12}</Text>
                          </View>
                          <FieldCell
                            title="Iron Price"
                            value={ironPrice12Value}
                            onIncrement={() => adjustIronPrice12(5)}
                            onDecrement={() => adjustIronPrice12(-5)}
                            onChangeText={(t) => setIronPrice12Input(t)}
                            steppers={FIELD_MONEY_STEPPERS}
                          />
                          <View style={styles.tradeStatCell}>
                            <Text style={styles.tradeStatLabel}>TOTAL</Text>
                            <Text style={styles.tradeStatValue}>{ironLine12Cost.toFixed(0)}</Text>
                          </View>
                        </View>
                      </BigBox>

                      <BigBox title="Iron Price 48kg">
                        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                          <View style={styles.tradeStatCell}>
                            <Text style={styles.tradeStatLabel}>QTY</Text>
                            <Text style={styles.tradeStatValue}>{totalBuy48}</Text>
                          </View>
                          <FieldCell
                            title="Iron Price"
                            value={ironPrice48Value}
                            onIncrement={() => adjustIronPrice48(5)}
                            onDecrement={() => adjustIronPrice48(-5)}
                            onChangeText={(t) => setIronPrice48Input(t)}
                            steppers={FIELD_MONEY_STEPPERS}
                          />
                          <View style={styles.tradeStatCell}>
                            <Text style={styles.tradeStatLabel}>TOTAL</Text>
                            <Text style={styles.tradeStatValue}>{ironLine48Cost.toFixed(0)}</Text>
                          </View>
                        </View>
                      </BigBox>
                    </>
                  ) : null}

                  {/* Money BigBox.
                      statusLine shows the money debt/credit alert (red if owing).
                      Total is read-only. Paid is adjustable.
                      Toggle button: when paid=0 → "Paid all" (green) sets paid=total.
                                     when paid>0 → "Didn't pay" (red) sets paid=0.
                      InlineWalletFundingPrompt shows if wallet is short. */}
                  <BigBox
                    title={CUSTOMER_WORDING.money}
                    statusLine={moneyStatusLine}
                    statusIsAlert={liveMoneyNet > 0}
                  >
                    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                      <FieldCell
                        title={CUSTOMER_WORDING.total}
                        value={totalCost}
                        onIncrement={() => {}}
                        onDecrement={() => {}}
                        editable={false}
                      />
                      <FieldCell
                        title={CUSTOMER_WORDING.paid}
                        value={paidNowValue}
                        onIncrement={() => adjustPaid(5)}
                        onDecrement={() => adjustPaid(-5)}
                        onChangeText={(text) => {
                          if (!canEditMoney) return;
                          setPaidTouched(true);
                          setPaidNow(text);
                        }}
                        editable={canEditMoney}
                        steppers={FIELD_MONEY_STEPPERS}
                      />
                    </View>
                    <View style={styles.bigBoxActionRow}>
                      <Pressable
                        style={[
                          styles.inlineActionButton,
                          paidNowValue === 0 ? styles.inlineActionButtonSuccess : null,
                        ]}
                        onPress={() => {
                          setPaidTouched(true);
                          setPaidNow(paidNowValue === 0 ? String(totalCost) : "0");
                        }}
                      >
                        <Text style={styles.inlineActionText}>
                          {paidNowValue === 0 ? "Paid all" : CUSTOMER_WORDING.didntPay}
                        </Text>
                      </Pressable>
                    </View>
                    {canEditMoney ? (
                      <InlineWalletFundingPrompt
                        walletAmount={walletBalance}
                        shortfall={refillWalletShortfall}
                        onTransferNow={
                          refillWalletShortfall > 0
                            ? () =>
                                router.push({
                                  pathname: "/expenses/new",
                                  params: {
                                    tab: "bank_to_wallet",
                                    amount: refillWalletShortfall.toFixed(0),
                                  },
                                })
                            : undefined
                        }
                      />
                    ) : null}
                  </BigBox>
                </>
              ) : null}
              <View style={styles.section}>
                <Text style={styles.label}>Notes</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Optional notes for this refill"
                  value={notes}
                  onChangeText={setNotes}
                  inputAccessoryViewID={accessoryViewId}
                  multiline
                  numberOfLines={3}
                />
              </View>
              {!useCard ? footerActions : null}

        </ScrollView>
        {useCard ? footerActions : null}
      </View>

      {paidAccessoryViewId ? (
        <InputAccessoryView nativeID={paidAccessoryViewId}>
          <View style={styles.accessoryRow}>
            <Pressable onPress={() => Keyboard.dismiss()} style={styles.accessoryButton}>
              <Text style={styles.accessoryText}>Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}

      <CalendarModal
        visible={calendarOpen}
        value={date}
        onSelect={(next) => {
          setDate(next);
          setCalendarOpen(false);
        }}
        onClose={() => setCalendarOpen(false)}
      />
      <TimePickerModal
        visible={timeOpen}
        value={time}
        onSelect={(next) => {
          setTime(next);
          setTimeOpen(false);
        }}
        onClose={() => setTimeOpen(false)}
      />
      <InitInventoryModal
        visible={initOpen}
        date={date}
        counts={initCounts}
        onChangeCounts={setInitCounts}
        onClose={() => setInitOpen(false)}
        onSave={async () => {
          await initInventory.mutateAsync({
            date,
            full12: Number(initCounts.full12) || 0,
            empty12: Number(initCounts.empty12) || 0,
            full48: Number(initCounts.full48) || 0,
            empty48: Number(initCounts.empty48) || 0,
            reason: "initial",
          });
          Keyboard.dismiss();
          setInitOpen(false);
        }}
        accessoryId={accessoryViewId}
      />
    </>
  );
}

export default function AddRefillModal({
  visible,
  onClose,
  onSaved,
  accessoryId,
  editEntry,
}: AddRefillModalProps) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
        >
          <RefillForm
            visible={visible}
            onClose={onClose}
            onSaved={onSaved}
            accessoryId={accessoryId}
            editEntry={editEntry}
            showHeader
          />
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export function CalendarModal({
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

  const today = new Date();
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
              <Ionicons name="chevron-back" size={18} color="#0a7ea4" />
            </Pressable>
            <Text style={styles.calendarTitle}>{monthLabel}</Text>
            <Pressable
              style={styles.calendarNav}
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              <Ionicons name="chevron-forward" size={18} color="#0a7ea4" />
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

export function TimePickerModal({
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

function InitInventoryModal({
  visible,
  date,
  counts,
  onChangeCounts,
  onClose,
  onSave,
  accessoryId,
}: {
  visible: boolean;
  date: string;
  counts: { full12: string; empty12: string; full48: string; empty48: string };
  onChangeCounts: (next: { full12: string; empty12: string; full48: string; empty48: string }) => void;
  onClose: () => void;
  onSave: () => void;
  accessoryId?: string;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={styles.modalCard}>
              <Text style={styles.title}>Initialize inventory</Text>
              <Text style={styles.meta}>Date: {date}</Text>
              <View style={styles.row}>
                <View style={styles.half}>
                  <Text style={styles.fieldLabel}>12kg Full</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    keyboardType="numeric"
                    value={counts.full12}
                    onChangeText={(value) => onChangeCounts({ ...counts, full12: value })}
                    inputAccessoryViewID={accessoryId}
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.fieldLabel}>12kg Empty</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    keyboardType="numeric"
                    value={counts.empty12}
                    onChangeText={(value) => onChangeCounts({ ...counts, empty12: value })}
                    inputAccessoryViewID={accessoryId}
                  />
                </View>
              </View>
              <View style={styles.row}>
                <View style={styles.half}>
                  <Text style={styles.fieldLabel}>48kg Full</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    keyboardType="numeric"
                    value={counts.full48}
                    onChangeText={(value) => onChangeCounts({ ...counts, full48: value })}
                    inputAccessoryViewID={accessoryId}
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.fieldLabel}>48kg Empty</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    keyboardType="numeric"
                    value={counts.empty48}
                    onChangeText={(value) => onChangeCounts({ ...counts, empty48: value })}
                    inputAccessoryViewID={accessoryId}
                  />
                </View>
              </View>
              <View style={styles.footerActions}>
                <Pressable style={styles.secondaryBtn} onPress={onClose}>
                  <Text style={styles.secondaryText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.primaryBtn} onPress={onSave}>
                  <Text style={styles.primaryText}>Save inventory</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  modalInner: {
    gap: 12,
  },
  fullScreenWrap: {
    flex: 1,
    position: "relative",
    backgroundColor: "#f3f5f7",
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1c1c1c",
  },
  content: {
    gap: 12,
    paddingBottom: 84,
  },
  section: {
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  label: {
    fontWeight: "700",
    color: "#2c3e50",
    fontSize: 12,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  half: {
    flex: 1,
  },
  third: {
    flex: 1,
  },
  dateField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  dateFieldDisabled: {
    opacity: 0.6,
  },
  dateText: {
    color: "#1f2937",
    fontWeight: "600",
  },
  nowButton: {
    alignSelf: "stretch",
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#0a7ea4",
    alignItems: "center",
    justifyContent: "center",
  },
  nowButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  inputBlock: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  inputTitle: {
    fontWeight: "700",
    color: "#0f172a",
  },
  alertBox: {
    backgroundColor: "#fdecea",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#f5c6cb",
    gap: 4,
  },
  alertText: {
    color: "#b00020",
    fontWeight: "700",
    fontSize: 12,
  },
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
  inputError: {
    borderColor: "#b00020",
  },
  errorText: {
    color: "#b00020",
    fontSize: 11,
    marginTop: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 4,
  },
  fieldBox: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    gap: 4,
  },
  gasTitle: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  amountsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 6,
    gap: 12,
  },
  helperText: {
    fontSize: 10,
    color: "#6b7280",
    lineHeight: 12,
  },
  meta: {
    color: "#444",
    fontSize: 13,
  },
  noticeInline: {
    gap: 6,
  },
  noticeText: {
    color: "#2c3e50",
    fontSize: 12,
  },
  noticeButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#0a7ea4",
    borderRadius: 8,
  },
  noticeButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  balanceBlock: {
    gap: 6,
  },
  liveRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "stretch",
    flexWrap: "wrap",
  },
  liveCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    gap: 6,
  },
  companyCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    gap: 4,
  },
  liveTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2c3e50",
  },
  companyTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2c3e50",
  },
  companyMoneyRow: {
    gap: 4,
  },
  companyMoneyText: {
    fontSize: 12,
    color: "#2c3e50",
    fontWeight: "600",
  },
  companyMoneyTextMuted: {
    fontSize: 12,
    color: "#94a3b8",
  },
  companyEmptyText: {
    fontSize: 12,
    color: "#64748b",
  },
  balanceLine: {
    fontSize: 12,
    color: "#2c3e50",
    fontWeight: "600",
  },
  balanceArrow: {
    color: "#1f2937",
    fontWeight: "700",
  },
  balanceNew: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  companyLine: {
    fontSize: 12,
    color: "#2c3e50",
    fontWeight: "600",
    lineHeight: 16,
    flexShrink: 1,
  },
  companyGasLabel: {
    fontWeight: "700",
  },
  companyAlertValue: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  inlineActionRow: {
    marginTop: 8,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  entryFieldPairSingle: {
    width: "50%",
    minWidth: 160,
    alignSelf: "center",
  },
  bigBoxActionRow: {
    marginTop: 8,
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
  inlineActionButtonAlt: {
    backgroundColor: "#0a7ea4",
  },
  inlineActionText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
  positiveValue: {
    color: "#15803d",
    fontWeight: "700",
  },
  negativeValue: {
    color: "#b91c1c",
    fontWeight: "700",
  },
  remainingExtraStack: {
    gap: 6,
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  statusChipRemaining: {
    backgroundColor: "#fee2e2",
    borderColor: "#fca5a5",
  },
  statusChipRemainingText: {
    color: "#b91c1c",
  },
  statusChipExtra: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
  },
  statusChipExtraText: {
    color: "#166534",
  },
  settledText: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600",
  },
  sectionDisabled: {
    opacity: 0.45,
  },
  footerActions: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 10,
  },
  footerInline: {
    paddingBottom: 12,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#e8eef1",
    alignItems: "center",
  },
  secondaryText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#0a7ea4",
    alignItems: "center",
  },
  primaryText: {
    color: "#fff",
    fontWeight: "700",
  },
  moneyHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  moneyHeaderActions: {
    flexDirection: "row",
    gap: 8,
  },
  moneyRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 6,
  },
  moneyRowFields: {
    flexDirection: "row",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  moneyGasLabel: {
    fontSize: 12,
    fontWeight: "700",
    minWidth: 48,
  },
  moneyQty: {
    flex: 1.2,
  },
  moneyPrice: {
    flex: 1,
  },
  moneyIron: {
    flex: 1,
  },
  moneyTotal: {
    flex: 1,
  },
  moneyValue: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    fontWeight: "700",
    color: "#1f2937",
    textAlign: "center",
    width: "100%",
  },
  editPriceButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#e8eef1",
  },
  editPriceText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
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
  disabledBtn: {
    opacity: 0.6,
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
  tradeStatCell: {
    width: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
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
});

