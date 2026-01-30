import React from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ExpenseCreateInput } from "@/types/domain";

const MODE_LABELS = {
  expense: "Expense",
  deposit: "Bank deposit",
};

type CalendarModalProps = {
  visible: boolean;
  value: string;
  onSelect: (next: string) => void;
  onClose: () => void;
};

type CashExpensesViewProps = {
  cashBalance?: number | null;
  onRefreshCash?: () => void;
  onClose?: () => void;
  expenseDate: string;
  setExpenseDate: (next: string) => void;
  expenseTime: string;
  setExpenseTime: (next: string) => void;
  expenseTimeOpen: boolean;
  setExpenseTimeOpen: (next: boolean) => void;
  expenseCalendarOpen: boolean;
  setExpenseCalendarOpen: (next: boolean) => void;
  expenseMode: "expense" | "deposit";
  setExpenseMode: (next: "expense" | "deposit") => void;
  expenseTypes: string[];
  expenseType: string;
  setExpenseType: (next: string) => void;
  expenseAmount: string;
  setExpenseAmount: (next: string) => void;
  expenseNote: string;
  setExpenseNote: (next: string) => void;
  depositAmount: string;
  setDepositAmount: (next: string) => void;
  depositNote: string;
  setDepositNote: (next: string) => void;
  accessoryId?: string;
  createExpense: { mutateAsync: (payload: ExpenseCreateInput) => Promise<unknown> };
  createBankDeposit: { mutateAsync: (payload: { date: string; amount: number; note?: string }) => Promise<unknown> };
  CalendarModal: React.ComponentType<CalendarModalProps>;
  TimePickerModal: React.ComponentType<{
    visible: boolean;
    value: string;
    onSelect: (next: string) => void;
    onClose: () => void;
  }>;
  styles: Record<string, any>;
};

const EXPENSE_ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  fuel: "flame",
  food: "restaurant",
  insurance: "shield-checkmark",
  car: "car-sport",
  other: "ellipsis-horizontal",
};

export default function CashExpensesView({
  cashBalance,
  onRefreshCash,
  onClose,
  expenseDate,
  setExpenseDate,
  expenseTime,
  setExpenseTime,
  expenseTimeOpen,
  setExpenseTimeOpen,
  expenseCalendarOpen,
  setExpenseCalendarOpen,
  expenseMode,
  setExpenseMode,
  expenseTypes,
  expenseType,
  setExpenseType,
  expenseAmount,
  setExpenseAmount,
  expenseNote,
  setExpenseNote,
  depositAmount,
  setDepositAmount,
  depositNote,
  setDepositNote,
  accessoryId,
  createExpense,
  createBankDeposit,
  CalendarModal,
  TimePickerModal,
  styles,
}: CashExpensesViewProps) {
  const cashValue = typeof cashBalance === "number" ? cashBalance : 0;
  const expenseAmountValue = Number(expenseAmount) || 0;
  const depositAmountValue = Number(depositAmount) || 0;
  const activeAmount = expenseMode === "expense" ? expenseAmountValue : depositAmountValue;
  const walletAfter = cashValue - activeAmount;
  const showOverCash = expenseMode === "expense" && expenseAmountValue > cashValue;
  const canSaveExpense =
    expenseMode === "expense"
      ? Boolean(expenseType.trim()) && expenseAmountValue > 0
      : depositAmountValue > 0;

  const setExpenseNow = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    setExpenseDate(`${year}-${month}-${day}`);
    setExpenseTime(`${hours}:${minutes}`);
  };

  const handleSave = async (resetAfter: boolean) => {
    if (expenseMode === "expense") {
      const amount = expenseAmountValue;
      if (!amount || amount <= 0 || !expenseType.trim()) {
        Alert.alert("Missing data", "Select an expense type and enter a valid amount.");
        return;
      }
      await createExpense.mutateAsync({
        date: expenseDate,
        expense_type: expenseType.trim(),
        amount,
        note: expenseNote.trim() ? expenseNote.trim() : undefined,
      });
      if (resetAfter) {
        setExpenseAmount("");
        setExpenseNote("");
      }
      onRefreshCash?.();
      if (!resetAfter) {
        onClose?.();
        Keyboard.dismiss();
      }
      return;
    }

    const amount = depositAmountValue;
    if (!amount || amount <= 0) {
      Alert.alert("Missing amount", "Enter a valid amount.");
      return;
    }
    await createBankDeposit.mutateAsync({
      date: expenseDate,
      amount,
      note: depositNote.trim() ? depositNote.trim() : undefined,
    });
    if (resetAfter) {
      setDepositAmount("");
      setDepositNote("");
    }
    onRefreshCash?.();
    if (!resetAfter) {
      onClose?.();
      Keyboard.dismiss();
    }
  };

  return (
    <View style={styles.expenseScreen}>
      <View style={styles.expensePageHeader}>
        <Text style={styles.expenseTitle}>Add Expense</Text>
      </View>
      <View style={styles.modeRow}>
        {Object.entries(MODE_LABELS).map(([key, label]) => (
          <Pressable
            key={key}
            style={[styles.modeButton, expenseMode === key && styles.modeButtonActive]}
            onPress={() => setExpenseMode(key as "expense" | "deposit")}
          >
            <Text style={[styles.modeText, expenseMode === key && styles.modeTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.expenseContent} keyboardShouldPersistTaps="handled">
        <View style={styles.formCard}>
          <Text style={styles.label}>Date & time</Text>
          <View style={styles.row}>
            <Pressable style={[styles.input, styles.half]} onPress={() => setExpenseCalendarOpen(true)}>
              <Text style={styles.dateText}>{expenseDate}</Text>
            </Pressable>
            <Pressable style={[styles.input, styles.half]} onPress={() => setExpenseTimeOpen(true)}>
              <Text style={styles.dateText}>{expenseTime}</Text>
            </Pressable>
            <Pressable style={styles.nowButton} onPress={setExpenseNow}>
              <Text style={styles.nowButtonText}>Now</Text>
            </Pressable>
          </View>
          <CalendarModal
            visible={expenseCalendarOpen}
            value={expenseDate}
            onSelect={(next) => {
              setExpenseDate(next);
              setExpenseCalendarOpen(false);
            }}
            onClose={() => setExpenseCalendarOpen(false)}
          />
          <TimePickerModal
            visible={expenseTimeOpen}
            value={expenseTime}
            onSelect={(next) => {
              setExpenseTime(next);
              setExpenseTimeOpen(false);
            }}
            onClose={() => setExpenseTimeOpen(false)}
          />
        </View>
        <Text style={styles.walletSentence}>You have {cashValue.toFixed(0)}₪ in cash.</Text>
        {showOverCash ? (
          <View style={styles.walletWarning}>
            <Text style={styles.walletWarningText}>Amount exceeds current truck cash</Text>
          </View>
        ) : null}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
        >
          <View style={styles.formCard}>
            {expenseMode === "expense" ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Expense type</Text>
                <View style={styles.expenseTypeGrid}>
                  {expenseTypes.map((type) => {
                    const selected = expenseType === type;
                    const iconName = EXPENSE_ICON_MAP[type] ?? "ellipse";
                    return (
                      <Pressable
                        key={type}
                        style={[
                          styles.expenseTypeCard,
                          selected && styles.expenseTypeCardActive,
                        ]}
                        onPress={() => setExpenseType(type)}
                      >
                        <Ionicons
                          name={iconName}
                          size={18}
                          color={selected ? "#fff" : "#0a7ea4"}
                        />
                        <Text
                          style={[
                            styles.expenseTypeText,
                            selected && styles.expenseTypeTextActive,
                          ]}
                        >
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.label}>Amount</Text>
                <TextInput
                  style={styles.expenseAmountInput}
                  placeholder="0"
                  keyboardType="numeric"
                  value={expenseAmount}
                  onChangeText={setExpenseAmount}
                  inputAccessoryViewID={accessoryId}
                />
                <Text style={styles.label}>Note (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Add a note"
                  value={expenseNote}
                  onChangeText={setExpenseNote}
                />
              </View>
            ) : (
              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Amount</Text>
                <TextInput
                  style={styles.expenseAmountInput}
                  placeholder="0"
                  keyboardType="numeric"
                  value={depositAmount}
                  onChangeText={setDepositAmount}
                  inputAccessoryViewID={accessoryId}
                />
                <Text style={styles.label}>Note (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Add a note"
                  value={depositNote}
                  onChangeText={setDepositNote}
                />
              </View>
            )}
            <View style={styles.walletTransition}>
              <Text style={styles.walletTransitionLabel}>Wallet:</Text>
              <Text style={styles.walletTransitionValue}>
                {cashValue.toFixed(0)} -> {walletAfter.toFixed(0)}
              </Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </ScrollView>
      <View style={styles.expenseFooterPage}>
        <View style={styles.expenseFooterRow}>
          <Pressable
            onPress={() => handleSave(true)}
            disabled={!canSaveExpense}
            style={[
              styles.expenseFooterSecondary,
              !canSaveExpense && styles.expenseFooterDisabled,
            ]}
          >
            <Text style={styles.expenseFooterSecondaryText}>Save & Add Another</Text>
          </Pressable>
          <Pressable
            onPress={() => handleSave(false)}
            disabled={!canSaveExpense}
            style={[
              styles.expenseFooterPrimary,
              !canSaveExpense && styles.expenseFooterDisabled,
            ]}
          >
            <Text style={styles.expenseFooterPrimaryText}>Save</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
