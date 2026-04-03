import { Ionicons } from "@expo/vector-icons";
import type { AxiosError } from "axios";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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

import BigBox from "@/components/entry/BigBox";
import FooterActions from "@/components/entry/FooterActions";
import { FieldCell, type FieldStepper } from "@/components/entry/FieldPair";
import MinuteTimePickerModal from "@/components/MinuteTimePickerModal";
import StandaloneField from "@/components/entry/StandaloneField";
import InlineWalletFundingPrompt from "@/components/InlineWalletFundingPrompt";
import { formatBalanceTransitions, makeBalanceTransition } from "@/lib/balanceTransitions";
import { buildActivityHappenedAt, formatDateLocale, getCurrentLocalDate, getCurrentLocalTime } from "@/lib/date";
import {
  calcCompanyCylinderLedgerDelta,
  calcMoneyUiResult,
} from "@/lib/ledgerMath";
import {
  useCreateCompanyBuyIron,
  useCreateRefill,
  useInitInventory,
  useInventoryLatest,
  useInventoryRefillDetails,
  useInventorySnapshot,
  useUpdateRefill,
} from "@/hooks/useInventory";
import { usePriceSettings } from "@/hooks/usePrices";
import { useCompanyBalances } from "@/hooks/useCompanyBalances";
import { useRefillFormState, type EditRefillEntry } from "@/hooks/useRefillFormState";
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

function sanitizeCountInputMax(value: string, max: number) {
  if (!value.trim()) return "";
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return "";
  return String(Math.min(Math.max(0, parsed), Math.max(0, max)));
}

export function sanitizeBuyCountInput(value: string, max: number | null | undefined, isBuyMode: boolean) {
  if (isBuyMode || typeof max !== "number") {
    return sanitizeCountInput(value);
  }
  return sanitizeCountInputMax(value, max);
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
    { delta: -1, label: "-", position: "left" },
    { delta: 1, label: "+", position: "right" },
  ];
  const createCompanyBuyIron = useCreateCompanyBuyIron();
  const createRefill = useCreateRefill();
  const updateRefill = useUpdateRefill();
  const initInventory = useInitInventory();
  const inventoryLatestQuery = useInventoryLatest();
  const refillDetailsQuery = useInventoryRefillDetails(editEntry?.refill_id);
  const refillDetails = refillDetailsQuery.data;
  const pricesQuery = usePriceSettings();
  const companyBalancesQuery = useCompanyBalances();
  const accessoryViewId = accessoryId;
  const paidAccessoryViewId = Platform.OS === "ios" ? "refillPaidAccessory" : undefined;

  const formState = useRefillFormState(visible, mode, editEntry, refillDetails?.notes ?? undefined);

  const snapshotAt = useMemo(() => {
    if (!editEntry?.effective_at) return null;
    return subtractSeconds(editEntry.effective_at, 1);
  }, [editEntry?.effective_at]);
  const snapshotQuery = useInventorySnapshot(
    visible ? (snapshotAt ? { at: snapshotAt } : { date: formState.date, time: formState.time }) : undefined
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
    return snapshotQuery.data ?? inventoryLatestQuery.data ?? null;
  }, [editEntry?.refill_id, refillDetails, snapshotQuery.data, inventoryLatestQuery.data]);
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
    const fallbackValue = buildActivityHappenedAt({ date: formState.date, time: formState.time });
    const fallback = fallbackValue ? new Date(fallbackValue) : new Date(formState.date);
    if (!Number.isNaN(fallback.getTime())) return fallback;
    return new Date(formState.date);
  }, [editEntry?.effective_at, formState.date, formState.time]);

  const buy12Price = resolveBuyingPrice("12kg", priceTarget);
  const buy48Price = resolveBuyingPrice("48kg", priceTarget);
  useEffect(() => {
    if (formState.price12Dirty) return;
    if (buy12Price > 0) {
      formState.setPrice12Input(buy12Price.toString());
    }
  }, [buy12Price, formState.price12Dirty, formState.setPrice12Input]);
  useEffect(() => {
    if (formState.price48Dirty) return;
    if (buy48Price > 0) {
      formState.setPrice48Input(buy48Price.toString());
    }
  }, [buy48Price, formState.price48Dirty, formState.setPrice48Input]);

  const price12Value = Number(formState.price12Input) || 0;
  const price48Value = Number(formState.price48Input) || 0;
  const ironPrice12Value = Number(formState.ironPrice12Input) || 0;
  const ironPrice48Value = Number(formState.ironPrice48Input) || 0;

  const buy12Value = Number(formState.buy12) || 0;
  const buy48Value = Number(formState.buy48) || 0;
  const ret12Value = Number(formState.ret12) || 0;
  const ret48Value = Number(formState.ret48) || 0;
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
  const ironLine12Cost = formState.isBuyMode ? totalBuy12 * ironPrice12Value : 0;
  const ironLine48Cost = formState.isBuyMode ? totalBuy48 * ironPrice48Value : 0;
  const totalCost = line12Cost + line48Cost + ironLine12Cost + ironLine48Cost;
  useEffect(() => {
    if (formState.paidTouched) return;
    formState.setPaidNow(totalCost ? totalCost.toString() : "");
  }, [totalCost, formState.paidTouched, formState.setPaidNow]);

  const paidNowValue = Number(formState.paidNow) || 0;
  const moneyResult = calcMoneyUiResult(totalCost, paidNowValue);

  const availableEmpty12 = typeof base?.empty12 === "number" ? base.empty12 : null;
  const availableEmpty48 = typeof base?.empty48 === "number" ? base.empty48 : null;
  const return12Invalid = availableEmpty12 !== null && ret12Value > availableEmpty12;
  const return48Invalid = availableEmpty48 !== null && ret48Value > availableEmpty48;
  const liveMoneyNet = baseMoneyNet + moneyResult;
  const liveMoneyGive = Math.max(liveMoneyNet, 0);
  const originalDelta12 = editEntry ? calcCompanyCylinderLedgerDelta(editEntry.buy12, editEntry.return12) : 0;
  const originalDelta48 = editEntry ? calcCompanyCylinderLedgerDelta(editEntry.buy48, editEntry.return48) : 0;
  // Only actual swaps affect company cylinders (new shells do not).
  const delta12 = formState.isBuyMode ? 0 : calcCompanyCylinderLedgerDelta(buy12Value, ret12Value);
  const delta48 = formState.isBuyMode ? 0 : calcCompanyCylinderLedgerDelta(buy48Value, ret48Value);

  // Recalculate net company balance for display purposes, excluding new shells from the 'buy' side that affect company debt
  const baseCompanyNet12 = Number(companyBalances?.company_cyl_12 ?? 0);
  const baseCompanyNet48 = Number(companyBalances?.company_cyl_48 ?? 0);
  const adjustedBase12 = baseCompanyNet12 - originalDelta12;
  const adjustedBase48 = baseCompanyNet48 - originalDelta48;
  const owedReturn12 = Math.max(-adjustedBase12, 0);
  const owedReturn48 = Math.max(-adjustedBase48, 0);
  const disableReturn12 = formState.isReturnMode && owedReturn12 <= 0;
  const disableReturn48 = formState.isReturnMode && owedReturn48 <= 0;
  const liveCompanyNet12 = adjustedBase12 + delta12;
  const liveCompanyNet48 = adjustedBase48 + delta48;
  const companyMoneyTransitionLines = formatBalanceTransitions(
    [makeBalanceTransition("company", "money", baseMoneyNet, liveMoneyNet)],
    {
      mode: "transition",
      collapseAllSettled: true,
      intent: formState.isBuyMode ? "company_buy_iron" : formState.isReturnMode ? "company_settle" : "company_refill",
      formatMoney,
    }
  );
  const company12TransitionLines = formatBalanceTransitions(
    [makeBalanceTransition("company", "cyl_12", adjustedBase12, liveCompanyNet12)],
    {
      mode: "transition",
      collapseAllSettled: true,
      intent: formState.isBuyMode ? "company_buy_iron" : formState.isReturnMode ? "company_settle" : "company_refill",
      formatMoney,
    }
  );
  const company48TransitionLines = formatBalanceTransitions(
    [makeBalanceTransition("company", "cyl_48", adjustedBase48, liveCompanyNet48)],
    {
      mode: "transition",
      collapseAllSettled: true,
      intent: formState.isBuyMode ? "company_buy_iron" : formState.isReturnMode ? "company_settle" : "company_refill",
      formatMoney,
    }
  );

  // Cylinder-only status: excludes money lines so they don't bleed into Cylinder BigBox
  const cylinderOnlyLines = [...company12TransitionLines, ...company48TransitionLines].filter(
    (line) => line !== "All settled \u2705"
  );
  const cylinderOnlyStatusLine = !companyBalanceReady
    ? "Current company balances unavailable."
    : cylinderOnlyLines.length > 0
      ? cylinderOnlyLines.join("\n")
      : CUSTOMER_WORDING.cylinderSettled;
  const return12Lines = company12TransitionLines.filter((line) => line !== "All settled \u2705");
  const return48Lines = company48TransitionLines.filter((line) => line !== "All settled \u2705");
  const return12StatusLine = !companyBalanceReady
    ? "Current company balances unavailable."
    : return12Lines.length > 0
      ? return12Lines.join("\n")
      : CUSTOMER_WORDING.cylinderSettled;
  const return48StatusLine = !companyBalanceReady
    ? "Current company balances unavailable."
    : return48Lines.length > 0
      ? return48Lines.join("\n")
      : CUSTOMER_WORDING.cylinderSettled;
  const moneyStatusLine = !companyBalanceReady
    ? "Current company balances unavailable. Preview is disabled until balances load."
    : companyMoneyTransitionLines.length > 0
      ? companyMoneyTransitionLines.join("\n")
      : CUSTOMER_WORDING.moneySettled;

  useEffect(() => {
    if (disableReturn12 && ret12Value !== 0) {
      formState.setRet12Touched(true);
      formState.setRet12("0");
    }
  }, [disableReturn12, ret12Value, formState.setRet12Touched, formState.setRet12]);

  useEffect(() => {
    if (disableReturn48 && ret48Value !== 0) {
      formState.setRet48Touched(true);
      formState.setRet48("0");
    }
  }, [disableReturn48, ret48Value, formState.setRet48Touched, formState.setRet48]);

  const afterFull12 = base ? (base.full12 ?? 0) + totalBuy12 : null;
  const afterFull48 = base ? (base.full48 ?? 0) + totalBuy48 : null;
  const refillBuyEmpty12 = availableEmpty12 === null ? null : Math.max(availableEmpty12 - buy12Value, 0);
  const refillBuyEmpty48 = availableEmpty48 === null ? null : Math.max(availableEmpty48 - buy48Value, 0);
  const afterEmpty12 = availableEmpty12 === null ? null : Math.max(availableEmpty12 - ret12Value, 0);
  const afterEmpty48 = availableEmpty48 === null ? null : Math.max(availableEmpty48 - ret48Value, 0);
  const walletAfterPaid = walletBalance - paidNowValue;

  const disableSave =
    !companyBalanceReady ||
    inventoryNotInitialized ||
    !base ||
    return12Invalid ||
    return48Invalid ||
    createCompanyBuyIron.isPending ||
    createRefill.isPending ||
    updateRefill.isPending ||
    initInventory.isPending;

  const payloadBuy12 = formState.isReturnMode ? 0 : buy12Value;
  const payloadBuy48 = formState.isReturnMode ? 0 : buy48Value;
  const payloadReturn12 = formState.isBuyMode ? 0 : ret12Value;
  const payloadReturn48 = formState.isBuyMode ? 0 : ret48Value;

  const handleSave = async (resetAfter = false) => {
    if (!base || inventoryNotInitialized) {
      Alert.alert("Inventory not initialized", "Set starting inventory before adding a refill.");
      return;
    }
    if (return12Invalid) {
      Alert.alert(
        "Invalid return",
        `You only have ${availableEmpty12} empty 12kg cylinders. Entered ${ret12Value}.`
      );
      return;
    }
    if (return48Invalid) {
      Alert.alert(
        "Invalid return",
        `You only have ${availableEmpty48} empty 48kg cylinders. Entered ${ret48Value}.`
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
          notes: formState.notes.trim() ? formState.notes.trim() : undefined,
          total_cost: totalCost,
          debt_cash: liveMoneyGive,
          debt_cylinders_12: liveCompanyNet12,
          debt_cylinders_48: liveCompanyNet48,
        });
      } else if (formState.isBuyMode) {
        await createCompanyBuyIron.mutateAsync({
          date: formState.date,
          time: formState.time,
          new12: payloadBuy12,
          new48: payloadBuy48,
          total_cost: totalCost,
          paid_now: paidNowValue,
          note: formState.notes.trim() ? formState.notes.trim() : undefined,
        });
      } else {
        await createRefill.mutateAsync({
          date: formState.date,
          time: formState.time,
          buy12: payloadBuy12,
          return12: payloadReturn12,
          buy48: payloadBuy48,
          return48: payloadReturn48,
          paid_now: paidNowValue,
          notes: formState.notes.trim() ? formState.notes.trim() : undefined,
          total_cost: totalCost,
          debt_cash: liveMoneyGive,
          debt_cylinders_12: liveCompanyNet12,
          debt_cylinders_48: liveCompanyNet48,
        });
      }
      Keyboard.dismiss();
      const savedEntry = {
        id: editEntry?.refill_id ?? `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        date: formState.date,
        time: formState.time,
        buy12: buy12Value,
        return12: ret12Value,
        buy48: buy48Value,
        return48: ret48Value,
        total_cost: totalCost,
        paid_now: paidNowValue,
      };
      if (resetAfter && !editEntry?.refill_id) {
        formState.resetFormForCurrentMode();
      } else {
        onSaved(savedEntry);
        onClose();
      }
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
    if (formState.isReturnMode) return;
    const next = sanitizeBuyCountInput(value, availableEmpty12, formState.isBuyMode);
    const delta = Number(next || 0) - buy12Value;
    formState.setBuy12(next);
    if (!formState.isBuyMode && delta > 0) {
      formState.setRet12(String(ret12Value + delta));
    }
  };
  const handleBuy48Change = (value: string) => {
    if (formState.isReturnMode) return;
    const next = sanitizeBuyCountInput(value, availableEmpty48, formState.isBuyMode);
    const delta = Number(next || 0) - buy48Value;
    formState.setBuy48(next);
    if (!formState.isBuyMode && delta > 0) {
      formState.setRet48(String(ret48Value + delta));
    }
  };

  const canEditBuy = !formState.isReturnMode;
  const canEditReturn = !formState.isBuyMode;
  const canEditMoney = !formState.isReturnMode;
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
    formState.setRet12Touched(true);
    formState.setRet12(String(next));
  };
  const adjustReturn48 = (delta: number) => {
    if (!canEditReturn) return;
    const next = Math.max(ret48Value + delta, 0);
    formState.setRet48Touched(true);
    formState.setRet48(String(next));
  };
  const adjustPaid = (delta: number) => {
    if (!canEditMoney) return;
    const current = Number(formState.paidNow) || 0;
    const next = Math.max(current + delta, 0);
    formState.setPaidTouched(true);
    formState.setPaidNow(String(next));
  };
  const adjustIronPrice12 = (delta: number) => {
    if (!canEditMoney || !formState.isBuyMode) return;
    const current = Number(formState.ironPrice12Input) || 0;
    const next = Math.max(current + delta, 0);
    formState.setIronPrice12Input(String(next));
  };
  const adjustIronPrice48 = (delta: number) => {
    if (!canEditMoney || !formState.isBuyMode) return;
    const current = Number(formState.ironPrice48Input) || 0;
    const next = Math.max(current + delta, 0);
    formState.setIronPrice48Input(String(next));
  };

  const footerActions = (
    <FooterActions
      onSave={() => handleSave(false)}
      onSaveAndAdd={!useCard ? () => handleSave(true) : undefined}
      saveDisabled={disableSave}
      saving={formState.isBuyMode ? createCompanyBuyIron.isPending : createRefill.isPending}
    />
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
                    onPress={editEntry ? undefined : () => formState.setCalendarOpen(true)}
                  >
                    <Text style={styles.dateText}>{formState.date}</Text>
                    <Ionicons name="calendar-outline" size={16} color="#0a7ea4" />
                  </Pressable>
                  <Pressable
                    style={[styles.dateField, editEntry && styles.dateFieldDisabled]}
                    onPress={editEntry ? undefined : () => formState.setTimeOpen(true)}
                  >
                    <Text style={styles.dateText}>{formState.time}</Text>
                    <Ionicons name="time-outline" size={16} color="#0a7ea4" />
                  </Pressable>
                  <Pressable
                    style={[styles.nowButton, editEntry && styles.dateFieldDisabled]}
                    onPress={editEntry ? undefined : () => {
                      formState.setDate(getCurrentLocalDate());
                      formState.setTime(getCurrentLocalTime({ includeSeconds: true }));
                    }}
                  >
                    <Text style={styles.nowButtonText}>Now</Text>
                  </Pressable>
                </View>
              </View>


              {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
                  CYLINDERS
                  - Refill:  [Buy 12kg] [Return 12kg] side by side in ONE BigBox
                             [Buy 48kg] [Return 48kg] side by side in same BigBox
                  - Return:  [Return 12kg] centered  /  [Return 48kg] centered (2 BigBoxes)
                  - Buy:     ONE BigBox with [Buy 12kg left] [Buy 48kg right]
              Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}

              {formState.isBuyMode ? (
                /* BUY Ã¢â‚¬â€ one Cylinders BigBox, 12kg left / 48kg right */
                <BigBox
                  title={CUSTOMER_WORDING.cylinders}
                  statusLine={undefined}
                  statusIsAlert={false}
                  defaultExpanded
                >
                  <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                    <FieldCell
                      title="12kg Buy"
                      comment={`Full ${formatCount(base?.full12)} -> ${formatCount(afterFull12)}`}
                      value={buy12Value}
                      onIncrement={() => adjustBuy12(1)}
                      onDecrement={() => adjustBuy12(-1)}
                      onChangeText={handleBuy12Change}
                      steppers={FIELD_QTY_STEPPERS}
                    />
                    <FieldCell
                      title="48kg Buy"
                      comment={`Full ${formatCount(base?.full48)} -> ${formatCount(afterFull48)}`}
                      value={buy48Value}
                      onIncrement={() => adjustBuy48(1)}
                      onDecrement={() => adjustBuy48(-1)}
                      onChangeText={handleBuy48Change}
                      steppers={FIELD_QTY_STEPPERS}
                    />
                  </View>
                </BigBox>
              ) : formState.isReturnMode ? (
                /* RETURN Ã¢â‚¬â€ separate BigBox per gas type */
                <>
                  <BigBox
                    title="12kg Cylinders"
                    statusLine={return12StatusLine}
                    statusIsAlert={liveCompanyNet12 < 0}
                    defaultExpanded
                  >
                    <StandaloneField>
                      <FieldCell
                        title="Return"
                        comment={`Empty ${formatCount(availableEmpty12)} -> ${formatCount(afterEmpty12)}`}
                        value={ret12Value}
                        onIncrement={() => adjustReturn12(1)}
                        onDecrement={() => adjustReturn12(-1)}
                        onChangeText={(text) => { formState.setRet12Touched(true); formState.setRet12(sanitizeCountInput(text)); }}
                        editable={!disableReturn12}
                        error={return12Invalid}
                        steppers={FIELD_QTY_STEPPERS}
                      />
                    </StandaloneField>
                    {owedReturn12 > 0 ? (
                      <View style={{ marginTop: 8, alignItems: "center", justifyContent: "center" }}>
                        <StandaloneField>
                          <Pressable
                            style={[
                              styles.inlineActionButton,
                              { width: "100%", alignSelf: "stretch", minWidth: 0 },
                              ret12Value === owedReturn12 ? null : styles.inlineActionButtonSuccess,
                            ]}
                            onPress={() => {
                              formState.setRet12Touched(true);
                              formState.setRet12(ret12Value === owedReturn12 ? "0" : String(owedReturn12));
                            }}
                          >
                            <Text style={styles.inlineActionText}>
                              {ret12Value === owedReturn12 ? CUSTOMER_WORDING.didntReturn : CUSTOMER_WORDING.returnAll}
                            </Text>
                          </Pressable>
                        </StandaloneField>
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
                    statusLine={return48StatusLine}
                    statusIsAlert={liveCompanyNet48 < 0}
                    defaultExpanded
                  >
                    <StandaloneField>
                      <FieldCell
                        title="Return"
                        comment={`Empty ${formatCount(availableEmpty48)} -> ${formatCount(afterEmpty48)}`}
                        value={ret48Value}
                        onIncrement={() => adjustReturn48(1)}
                        onDecrement={() => adjustReturn48(-1)}
                        onChangeText={(text) => { formState.setRet48Touched(true); formState.setRet48(sanitizeCountInput(text)); }}
                        editable={!disableReturn48}
                        error={return48Invalid}
                        steppers={FIELD_QTY_STEPPERS}
                      />
                    </StandaloneField>
                    {owedReturn48 > 0 ? (
                      <View style={{ marginTop: 8, alignItems: "center", justifyContent: "center" }}>
                        <StandaloneField>
                          <Pressable
                            style={[
                              styles.inlineActionButton,
                              { width: "100%", alignSelf: "stretch", minWidth: 0 },
                              ret48Value === owedReturn48 ? null : styles.inlineActionButtonSuccess,
                            ]}
                            onPress={() => {
                              formState.setRet48Touched(true);
                              formState.setRet48(ret48Value === owedReturn48 ? "0" : String(owedReturn48));
                            }}
                          >
                            <Text style={styles.inlineActionText}>
                              {ret48Value === owedReturn48 ? CUSTOMER_WORDING.didntReturn : CUSTOMER_WORDING.returnAll}
                            </Text>
                          </Pressable>
                        </StandaloneField>
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
                /* REFILL Ã¢â‚¬â€ one BigBox, 12kg top / 48kg bottom */
                <BigBox
                  title={CUSTOMER_WORDING.cylinders}
                  statusLine={cylinderOnlyStatusLine}
                  statusIsAlert={liveCompanyNet12 < 0 || liveCompanyNet48 < 0}
                  defaultExpanded
                >
                  {/* 12kg row */}
                  <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                    <FieldCell
                      title="12kg Buy"
                      comment={`${refillBuyEmpty12} empties on hand\nFull ${formatCount(base?.full12)} -> ${formatCount(afterFull12)}`}
                      value={buy12Value}
                      onIncrement={() => adjustBuy12(1)}
                      onDecrement={() => adjustBuy12(-1)}
                      onChangeText={handleBuy12Change}
                      steppers={FIELD_QTY_STEPPERS}
                    />
                    <FieldCell
                      title="12kg Return"
                      comment={` \nEmpty ${formatCount(availableEmpty12)} -> ${formatCount(afterEmpty12)}`}
                      value={ret12Value}
                      onIncrement={() => adjustReturn12(1)}
                      onDecrement={() => adjustReturn12(-1)}
                      onChangeText={(text) => { formState.setRet12Touched(true); formState.setRet12(sanitizeCountInput(text)); }}
                      error={return12Invalid}
                      steppers={FIELD_QTY_STEPPERS}
                    />
                  </View>
                  {/* 12kg Return toggle — aligned under Return (right) field */}
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
                    <View style={{ flex: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Pressable
                        style={[
                          styles.inlineActionButton,
                          { width: "100%", alignSelf: "stretch", minWidth: 0 },
                          buy12Value > 0 && ret12Value === buy12Value ? null : styles.inlineActionButtonSuccess,
                        ]}
                        onPress={() => {
                          if (buy12Value <= 0) return;
                          formState.setRet12Touched(true);
                          formState.setRet12(buy12Value > 0 && ret12Value === buy12Value ? "0" : String(buy12Value));
                        }}
                      >
                        <Text style={styles.inlineActionText}>
                          {buy12Value > 0 && ret12Value === buy12Value ? CUSTOMER_WORDING.didntReturn : CUSTOMER_WORDING.returned}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                  {return12Invalid ? (
                    <Text style={styles.errorText}>
                      Only {availableEmpty12} empty 12kg on hand. Entered {ret12Value}.
                    </Text>
                  ) : null}

                  {/* 48kg row */}
                  <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", marginTop: 16 }}>
                    <FieldCell
                      title="48kg Buy"
                      comment={`${refillBuyEmpty48} empties on hand\nFull ${formatCount(base?.full48)} -> ${formatCount(afterFull48)}`}
                      value={buy48Value}
                      onIncrement={() => adjustBuy48(1)}
                      onDecrement={() => adjustBuy48(-1)}
                      onChangeText={handleBuy48Change}
                      steppers={FIELD_QTY_STEPPERS}
                    />
                    <FieldCell
                      title="48kg Return"
                      comment={` \nEmpty ${formatCount(availableEmpty48)} -> ${formatCount(afterEmpty48)}`}
                      value={ret48Value}
                      onIncrement={() => adjustReturn48(1)}
                      onDecrement={() => adjustReturn48(-1)}
                      onChangeText={(text) => { formState.setRet48Touched(true); formState.setRet48(sanitizeCountInput(text)); }}
                      error={return48Invalid}
                      steppers={FIELD_QTY_STEPPERS}
                    />
                  </View>
                  {/* 48kg Return toggle — aligned under Return (right) field */}
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
                    <View style={{ flex: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Pressable
                        style={[
                          styles.inlineActionButton,
                          { width: "100%", alignSelf: "stretch", minWidth: 0 },
                          buy48Value > 0 && ret48Value === buy48Value ? null : styles.inlineActionButtonSuccess,
                        ]}
                        onPress={() => {
                          if (buy48Value <= 0) return;
                          formState.setRet48Touched(true);
                          formState.setRet48(buy48Value > 0 && ret48Value === buy48Value ? "0" : String(buy48Value));
                        }}
                      >
                        <Text style={styles.inlineActionText}>
                          {buy48Value > 0 && ret48Value === buy48Value ? CUSTOMER_WORDING.didntReturn : CUSTOMER_WORDING.returned}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                  {return48Invalid ? (
                    <Text style={styles.errorText}>
                      Only {availableEmpty48} empty 48kg on hand. Entered {ret48Value}.
                    </Text>
                  ) : null}

                </BigBox>
              )}

              {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
                  GAS PRICE + IRON PRICE + MONEY
                  Only shown on Refill and Buy tabs (not Return)
              Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
              {!formState.isReturnMode ? (
                <>
                  {/* Gas Price 12kg
                      QTY and TOTAL are plain text (tradeStatCell style).
                      Price is a read-only FieldCell (grey, no buttons).
                      A "Set price" button below navigates to the config page
                      (that page is not yet built Ã¢â‚¬â€ the button is a placeholder). */}
                  <BigBox title="Gas Buying Price 12kg">
                    <View style={styles.tradeEquationRow}>
                      <View style={styles.tradeStatCell}>
                        <Text style={styles.tradeStatLabel}>QTY</Text>
                        <View style={styles.tradeStatValueWrap}>
                          <Text style={styles.tradeStatValue}>{totalBuy12}</Text>
                        </View>
                      </View>
                      <View style={styles.tradeOperatorCell}>
                        <View style={styles.tradeOperatorTopSpacer} />
                        <View style={styles.tradeStatValueWrap}>
                          <Text style={styles.tradeOperator}>x</Text>
                        </View>
                      </View>
                      <View style={styles.tradeReadonlyPriceCell}>
                        <Text style={styles.tradeReadonlyPriceTitle}>PRICE</Text>
                        <View style={styles.tradeReadonlyPriceValueWrap}>
                          <Text style={styles.tradeReadonlyPriceValue}>{price12Value}</Text>
                        </View>
                      </View>
                      <View style={styles.tradeOperatorCell}>
                        <View style={styles.tradeOperatorTopSpacer} />
                        <View style={styles.tradeStatValueWrap}>
                          <Text style={styles.tradeOperator}>=</Text>
                        </View>
                      </View>
                      <View style={styles.tradeStatCell}>
                        <Text style={styles.tradeStatLabel}>TOTAL</Text>
                        <View style={styles.tradeStatValueWrap}>
                          <Text style={styles.tradeStatValue}>{line12Cost.toFixed(0)}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.tradeActionRow}>
                      <View style={styles.tradeActionStatSpacer} />
                      <View style={styles.tradeActionOperatorSpacer} />
                      <View style={styles.tradeActionButtonWrap}>
                        <Pressable
                          style={[styles.inlineActionButton, styles.inlineActionButtonAlt, styles.tradeActionButton]}
                          onPress={() => {
                            // TODO: navigate to price config page when implemented
                            // router.push({ pathname: "/prices/config" });
                          }}
                        >
                          <Text style={styles.inlineActionText}>Set price</Text>
                        </Pressable>
                      </View>
                      <View style={styles.tradeActionOperatorSpacer} />
                      <View style={styles.tradeActionStatSpacer} />
                    </View>
                  </BigBox>

                  {/* Gas Price 48kg Ã¢â‚¬â€ same structure */}
                  <BigBox title="Gas Buying Price 48kg">
                    <View style={styles.tradeEquationRow}>
                      <View style={styles.tradeStatCell}>
                        <Text style={styles.tradeStatLabel}>QTY</Text>
                        <View style={styles.tradeStatValueWrap}>
                          <Text style={styles.tradeStatValue}>{totalBuy48}</Text>
                        </View>
                      </View>
                      <View style={styles.tradeOperatorCell}>
                        <View style={styles.tradeOperatorTopSpacer} />
                        <View style={styles.tradeStatValueWrap}>
                          <Text style={styles.tradeOperator}>x</Text>
                        </View>
                      </View>
                      <View style={styles.tradeReadonlyPriceCell}>
                        <Text style={styles.tradeReadonlyPriceTitle}>PRICE</Text>
                        <View style={styles.tradeReadonlyPriceValueWrap}>
                          <Text style={styles.tradeReadonlyPriceValue}>{price48Value}</Text>
                        </View>
                      </View>
                      <View style={styles.tradeOperatorCell}>
                        <View style={styles.tradeOperatorTopSpacer} />
                        <View style={styles.tradeStatValueWrap}>
                          <Text style={styles.tradeOperator}>=</Text>
                        </View>
                      </View>
                      <View style={styles.tradeStatCell}>
                        <Text style={styles.tradeStatLabel}>TOTAL</Text>
                        <View style={styles.tradeStatValueWrap}>
                          <Text style={styles.tradeStatValue}>{line48Cost.toFixed(0)}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.tradeActionRow}>
                      <View style={styles.tradeActionStatSpacer} />
                      <View style={styles.tradeActionOperatorSpacer} />
                      <View style={styles.tradeActionButtonWrap}>
                        <Pressable
                          style={[styles.inlineActionButton, styles.inlineActionButtonAlt, styles.tradeActionButton]}
                          onPress={() => {
                            // TODO: navigate to price config page when implemented
                          }}
                        >
                          <Text style={styles.inlineActionText}>Set price</Text>
                        </Pressable>
                      </View>
                      <View style={styles.tradeActionOperatorSpacer} />
                      <View style={styles.tradeActionStatSpacer} />
                    </View>
                  </BigBox>

                  {/* Iron Price Ã¢â‚¬â€ Buy tab only.
                      QTY and TOTAL are plain text at the same vertical level as
                      the Iron Price FieldCell buttons (alignItems: "center"). */}
                  {formState.isBuyMode ? (
                    <>
                      <BigBox title="Iron Buying Price 12kg">
                        <View style={styles.tradeEquationRow}>
                          <View style={[styles.tradeStatCell, styles.tradeStatCellNarrow]}>
                            <Text style={styles.tradeStatLabel}>QTY</Text>
                            <View style={styles.tradeStatValueWrap}>
                              <Text style={styles.tradeStatValue}>{totalBuy12}</Text>
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
                            value={ironPrice12Value}
                            onIncrement={() => adjustIronPrice12(5)}
                            onDecrement={() => adjustIronPrice12(-5)}
                            onChangeText={(t) => formState.setIronPrice12Input(sanitizeCountInput(t))}
                            steppers={FIELD_MONEY_STEPPERS}
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
                              <Text style={styles.tradeStatValue}>{ironLine12Cost.toFixed(0)}</Text>
                            </View>
                          </View>
                        </View>
                      </BigBox>

                      <BigBox title="Iron Buying Price 48kg">
                        <View style={styles.tradeEquationRow}>
                          <View style={[styles.tradeStatCell, styles.tradeStatCellNarrow]}>
                            <Text style={styles.tradeStatLabel}>QTY</Text>
                            <View style={styles.tradeStatValueWrap}>
                              <Text style={styles.tradeStatValue}>{totalBuy48}</Text>
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
                            value={ironPrice48Value}
                            onIncrement={() => adjustIronPrice48(5)}
                            onDecrement={() => adjustIronPrice48(-5)}
                            onChangeText={(t) => formState.setIronPrice48Input(sanitizeCountInput(t))}
                            steppers={FIELD_MONEY_STEPPERS}
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
                              <Text style={styles.tradeStatValue}>{ironLine48Cost.toFixed(0)}</Text>
                            </View>
                          </View>
                        </View>
                      </BigBox>
                    </>
                  ) : null}

                  {/* Money BigBox.
                      statusLine shows the money debt/credit alert (red if owing).
                      Total is read-only. Paid is adjustable.
                      Toggle button: when paid=0 Ã¢â€ â€™ "Paid all" (green) sets paid=total.
                                     when paid>0 Ã¢â€ â€™ "Didn't pay" (red) sets paid=0.
                      InlineWalletFundingPrompt shows if wallet is short. */}
                  <BigBox
                    title={CUSTOMER_WORDING.money}
                    statusLine={formState.isBuyMode ? undefined : moneyStatusLine}
                    statusIsAlert={!formState.isBuyMode && liveMoneyNet > 0}
                    defaultExpanded
                  >
                    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                      <FieldCell
                        title={CUSTOMER_WORDING.total}
                        comment=" "
                        value={totalCost}
                        onIncrement={() => {}}
                        onDecrement={() => {}}
                        editable={false}
                      />
                      <FieldCell
                        title={CUSTOMER_WORDING.paid}
                        comment={`Wallet ${formatMoney(walletBalance)} -> ${formatMoney(walletAfterPaid)}`}
                        value={paidNowValue}
                        onIncrement={() => adjustPaid(5)}
                        onDecrement={() => adjustPaid(-5)}
                        onChangeText={(text) => {
                          if (!canEditMoney) return;
                          formState.setPaidTouched(true);
                          formState.setPaidNow(sanitizeCountInput(text));
                        }}
                        editable={canEditMoney}
                        steppers={FIELD_MONEY_STEPPERS}
                      />
                    </View>
                    {/* Paid all toggle — aligned under Paid (right) field */}
                    <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
                      <View style={{ flex: 1 }} />
                      <View style={{ flex: 1 }}>
                        <Pressable
                          style={[
                            styles.inlineActionButton,
                            { width: "100%", alignSelf: "stretch", minWidth: 0 },
                            paidNowValue === 0 ? styles.inlineActionButtonSuccess : null,
                          ]}
                          onPress={() => {
                            formState.setPaidTouched(true);
                            formState.setPaidNow(paidNowValue === 0 ? String(totalCost) : "0");
                          }}
                        >
                          <Text style={styles.inlineActionText}>
                            {paidNowValue === 0 ? "Paid all" : CUSTOMER_WORDING.didntPay}
                          </Text>
                        </Pressable>
                      </View>
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
                  value={formState.notes}
                  onChangeText={formState.setNotes}
                  inputAccessoryViewID={accessoryViewId}
                  multiline
                  numberOfLines={3}
                />
              </View>

        </ScrollView>
        {footerActions}
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
        visible={formState.calendarOpen}
        value={formState.date}
        onSelect={(next) => {
          formState.setDate(next);
          formState.setCalendarOpen(false);
        }}
        onClose={() => formState.setCalendarOpen(false)}
      />
      <TimePickerModal
        visible={formState.timeOpen}
        value={formState.time}
        onSelect={(next) => {
          formState.setTime(next);
          formState.setTimeOpen(false);
        }}
        onClose={() => formState.setTimeOpen(false)}
      />
      <InitInventoryModal
        visible={formState.initOpen}
        date={formState.date}
        counts={formState.initCounts}
        onChangeCounts={formState.setInitCounts}
        onClose={() => formState.setInitOpen(false)}
        saveDisabled={initInventory.isPending}
        saving={initInventory.isPending}
        onSave={async () => {
          await initInventory.mutateAsync({
            date: formState.date,
            full12: Number(formState.initCounts.full12) || 0,
            empty12: Number(formState.initCounts.empty12) || 0,
            full48: Number(formState.initCounts.full48) || 0,
            empty48: Number(formState.initCounts.empty48) || 0,
            reason: "initial",
          });
          Keyboard.dismiss();
          formState.setInitOpen(false);
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
  return <MinuteTimePickerModal visible={visible} value={value} onSelect={onSelect} onClose={onClose} />;
}

function InitInventoryModal({
  visible,
  date,
  counts,
  onChangeCounts,
  onClose,
  onSave,
  saveDisabled = false,
  saving = false,
  accessoryId,
}: {
  visible: boolean;
  date: string;
  counts: { full12: string; empty12: string; full48: string; empty48: string };
  onChangeCounts: (next: { full12: string; empty12: string; full48: string; empty48: string }) => void;
  onClose: () => void;
  onSave: () => void;
  saveDisabled?: boolean;
  saving?: boolean;
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
              <FooterActions
                onCancel={onClose}
                onSave={onSave}
                saveLabel="Save inventory"
                saveDisabled={saveDisabled}
                saving={saving}
              />
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
    paddingBottom: 120,
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
  tradeReadonlyPriceCell: {
    flex: 1,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    gap: 8,
  },
  tradeReadonlyPriceTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    textAlign: "center",
  },
  tradeReadonlyPriceValueWrap: {
    width: "100%",
    height: 48,
    borderRadius: 10,
    backgroundColor: "#f0f4f8",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d7dde4",
    alignItems: "center",
    justifyContent: "center",
  },
  tradeReadonlyPriceValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#94a3b8",
    textAlign: "center",
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
  tradeActionRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  tradeActionStatSpacer: {
    width: 84,
  },
  tradeActionOperatorSpacer: {
    width: 20,
  },
  tradeActionButtonWrap: {
    flex: 1,
  },
  tradeActionButton: {
    width: "100%",
    alignSelf: "stretch",
    minWidth: 0,
  },
  inventoryHintRow: {
    marginBottom: 4,
  },
  inventoryHint: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
    textAlign: "center",
  },
});
