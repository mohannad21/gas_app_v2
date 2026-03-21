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

import BigBox from "@/components/entry/BigBox";
import FooterActions from "@/components/entry/FooterActions";
import { FieldCell, type FieldStepper } from "@/components/entry/FieldPair";
import InlineWalletFundingPrompt from "@/components/InlineWalletFundingPrompt";
import { ExpenseCreateInput } from "@/types/domain";
import { buildHappenedAt } from "@/lib/date";
import { CUSTOMER_WORDING } from "@/lib/wording";

const MODE_LABELS = {
  expense: "Expense",
  wallet_to_bank: "Wallet to Bank",
  bank_to_wallet: "Bank to Wallet",
} as const;

type ExpenseMode = keyof typeof MODE_LABELS;

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
  onTransferNow?: (shortfall: number) => void;
  expenseDate: string;
  setExpenseDate: (next: string) => void;
  expenseTime: string;
  setExpenseTime: (next: string) => void;
  expenseTimeOpen: boolean;
  setExpenseTimeOpen: (next: boolean) => void;
  expenseCalendarOpen: boolean;
  setExpenseCalendarOpen: (next: boolean) => void;
  expenseMode: ExpenseMode;
  setExpenseMode: (next: ExpenseMode) => void;
  expenseTypes: string[];
  expenseType: string;
  setExpenseType: (next: string) => void;
  expenseAmount: string;
  setExpenseAmount: (next: string) => void;
  expenseNote: string;
  setExpenseNote: (next: string) => void;
  transferAmount: string;
  setTransferAmount: (next: string) => void;
  transferNote: string;
  setTransferNote: (next: string) => void;
  accessoryId?: string;
  createExpense: { mutateAsync: (payload: ExpenseCreateInput) => Promise<unknown> };
  createBankDeposit: {
    mutateAsync: (payload: {
      date: string;
      time?: string;
      amount: number;
      direction?: "wallet_to_bank" | "bank_to_wallet";
      note?: string;
    }) => Promise<unknown>;
  };
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
const MONEY_STEPPERS: FieldStepper[] = [
  { delta: 20, label: "+20", position: "top" },
  { delta: -5, label: "-5", position: "left" },
  { delta: 5, label: "+5", position: "right" },
  { delta: -20, label: "-20", position: "bottom" },
];

function formatTransferHelperText(mode: Exclude<ExpenseMode, "expense">, wallet: number, amount: number) {
  if (mode === "bank_to_wallet") {
    if (amount <= 0) {
      return `You have ${wallet.toFixed(0)} shekels in the wallet.`;
    }
    const projected = wallet + amount;
    return `You will have ${projected.toFixed(0)} shekels in the wallet after moving ${amount.toFixed(
      0
    )} from bank. (was ${wallet.toFixed(0)})`;
  }

  if (amount <= 0) {
    return `You have ${wallet.toFixed(0)} shekels in the wallet. You can move up to ${wallet.toFixed(
      0
    )} to bank.`;
  }

  const projected = Math.max(wallet - amount, 0);
  return `You can move up to ${wallet.toFixed(0)} shekels from the wallet. You will have ${projected.toFixed(
    0
  )} shekels in the wallet after moving ${amount.toFixed(0)} to bank. (was ${wallet.toFixed(0)})`;
}

export default function CashExpensesView({
  cashBalance,
  onRefreshCash,
  onClose,
  onTransferNow,
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
  transferAmount,
  setTransferAmount,
  transferNote,
  setTransferNote,
  accessoryId,
  createExpense,
  createBankDeposit,
  CalendarModal,
  TimePickerModal,
  styles,
}: CashExpensesViewProps) {
  const walletValue = typeof cashBalance === "number" ? cashBalance : 0;
  const expenseAmountValue = Number(expenseAmount) || 0;
  const transferAmountValue = Number(transferAmount) || 0;
  const isExpense = expenseMode === "expense";
  const isBankToWallet = expenseMode === "bank_to_wallet";
  const isWalletToBank = expenseMode === "wallet_to_bank";
  const shortfall = isExpense ? Math.max(expenseAmountValue - walletValue, 0) : 0;
  const transferDisabled = isWalletToBank && transferAmountValue > walletValue;
  const walletAfter = isExpense
    ? walletValue - expenseAmountValue
    : isBankToWallet
      ? walletValue + transferAmountValue
      : walletValue - transferAmountValue;
  const canSaveExpense =
    isExpense
      ? Boolean(expenseType.trim()) && expenseAmountValue > 0
      : transferAmountValue > 0 && !transferDisabled;

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

  const stepTransferAmount = (delta: number) => {
    const current = Number(transferAmount) || 0;
    setTransferAmount(String(Math.max(current + delta, 0)));
  };

  const handleSave = async (resetAfter: boolean) => {
    const happened_at = buildHappenedAt({ date: expenseDate, time: expenseTime });
    if (isExpense) {
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
        happened_at,
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

    const amount = transferAmountValue;
    if (!amount || amount <= 0) {
      Alert.alert("Missing amount", "Enter a valid amount.");
      return;
    }
    if (transferDisabled) {
      Alert.alert("Insufficient wallet", "This transfer is limited by the current wallet balance.");
      return;
    }
    await createBankDeposit.mutateAsync({
      date: expenseDate,
      time: expenseTime,
      amount,
      direction: isBankToWallet ? "bank_to_wallet" : "wallet_to_bank",
      note: transferNote.trim() ? transferNote.trim() : undefined,
    });
    if (resetAfter) {
      setTransferAmount("");
      setTransferNote("");
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
        {(Object.keys(MODE_LABELS) as ExpenseMode[]).map((key) => (
          <Pressable
            key={key}
            style={[styles.modeButton, expenseMode === key && styles.modeButtonActive]}
            onPress={() => setExpenseMode(key)}
          >
            <Text style={[styles.modeText, expenseMode === key && styles.modeTextActive]}>
              {MODE_LABELS[key]}
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
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
        >
          <View style={styles.formCard}>
            {isExpense ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Expense type</Text>
                <View style={styles.expenseTypeGrid}>
                  {expenseTypes.map((type) => {
                    const selected = expenseType === type;
                    const iconName = EXPENSE_ICON_MAP[type] ?? "ellipse";
                    return (
                      <Pressable
                        key={type}
                        style={[styles.expenseTypeCard, selected && styles.expenseTypeCardActive]}
                        onPress={() => setExpenseType(type)}
                      >
                        <Ionicons name={iconName} size={18} color={selected ? "#fff" : "#0a7ea4"} />
                        <Text style={[styles.expenseTypeText, selected && styles.expenseTypeTextActive]}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <BigBox
                  title="Amount"
                  statusLine={`Wallet ${walletValue.toFixed(0)} to ${walletAfter.toFixed(0)}`}
                  statusIsAlert={walletAfter < 0}
                >
                  <View style={styles.standaloneFieldWrap}>
                    <FieldCell
                      title="Amount"
                      value={expenseAmountValue}
                      onIncrement={() => setExpenseAmount(String(Math.max(expenseAmountValue + 5, 0)))}
                      onDecrement={() => setExpenseAmount(String(Math.max(expenseAmountValue - 5, 0)))}
                      onChangeText={setExpenseAmount}
                      steppers={MONEY_STEPPERS}
                    />
                  </View>
                </BigBox>
                <InlineWalletFundingPrompt
                  walletAmount={walletValue}
                  shortfall={shortfall}
                  onTransferNow={shortfall > 0 ? () => onTransferNow?.(shortfall) : undefined}
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
                <BigBox
                  title={CUSTOMER_WORDING.money}
                  statusLine={formatTransferHelperText(expenseMode, walletValue, transferAmountValue)}
                  statusIsAlert={isWalletToBank && transferDisabled}
                >
                  <View style={styles.standaloneFieldWrap}>
                    <FieldCell
                      title="Amount"
                      value={transferAmountValue}
                      onIncrement={() => stepTransferAmount(5)}
                      onDecrement={() => stepTransferAmount(-5)}
                      onChangeText={setTransferAmount}
                      steppers={MONEY_STEPPERS}
                    />
                  </View>
                </BigBox>
                <Text style={styles.label}>Note (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Add a note"
                  value={transferNote}
                  onChangeText={setTransferNote}
                />
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </ScrollView>
      <FooterActions
        onSave={() => handleSave(false)}
        onSaveAndAdd={() => handleSave(true)}
        saveDisabled={!canSaveExpense}
      />
    </View>
  );
}
