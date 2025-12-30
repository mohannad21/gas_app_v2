import React from "react";
import { Alert, KeyboardAvoidingView, Pressable, Text, TextInput, View, Platform } from "react-native";
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

type CashEntry = {
  kind: "expense" | "deposit";
  id: string;
  amount: number;
  label: string;
  note?: string;
  timestamp: string;
  date: string;
  expenseType?: string;
};

type CashExpensesViewProps = {
  expenseDate: string;
  setExpenseDate: (next: string) => void;
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
  cashEntries: CashEntry[];
  createExpense: { mutateAsync: (payload: ExpenseCreateInput) => Promise<unknown> };
  createBankDeposit: { mutateAsync: (payload: { date: string; amount: number; note?: string }) => Promise<unknown> };
  deleteExpense: { mutate: (payload: { date: string; expense_type: string }) => void };
  deleteBankDeposit: { mutate: (payload: { id: string; date: string }) => void };
  CalendarModal: React.ComponentType<CalendarModalProps>;
  formatDateTime: (value?: string) => string;
  styles: Record<string, any>;
};

export default function CashExpensesView({
  expenseDate,
  setExpenseDate,
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
  cashEntries,
  createExpense,
  createBankDeposit,
  deleteExpense,
  deleteBankDeposit,
  CalendarModal,
  formatDateTime,
  styles,
}: CashExpensesViewProps) {
  return (
    <View style={styles.formCard}>
      <Text style={styles.formTitle}>Cash & Expenses</Text>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Date</Text>
          <Pressable style={styles.dateField} onPress={() => setExpenseCalendarOpen(true)}>
            <Text style={styles.dateText}>{expenseDate}</Text>
            <Ionicons name="calendar-outline" size={16} color="#0a7ea4" />
          </Pressable>
          <CalendarModal
            visible={expenseCalendarOpen}
            value={expenseDate}
            onSelect={(next) => {
              setExpenseDate(next);
              setExpenseCalendarOpen(false);
            }}
            onClose={() => setExpenseCalendarOpen(false)}
          />
        </View>
        <View style={styles.modeToggle}>
          {Object.entries(MODE_LABELS).map(([key, label]) => (
            <Pressable
              key={key}
              style={[styles.modeChip, expenseMode === key && styles.modeChipActive]}
              onPress={() => setExpenseMode(key as "expense" | "deposit")}
            >
              <Text style={[styles.modeChipText, expenseMode === key && styles.modeChipTextActive]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        {expenseMode === "expense" ? (
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Expense type</Text>
            <View style={styles.chipRow}>
              {expenseTypes.map((type) => (
                <Pressable
                  key={type}
                  style={[styles.chip, expenseType === type && styles.chipActive]}
                  onPress={() => setExpenseType(type)}
                >
                  <Text style={[styles.chipText, expenseType === type && styles.chipTextActive]}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </Pressable>
              ))}
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
            <Pressable
              style={styles.primary}
              onPress={async () => {
                const amount = Number(expenseAmount);
                if (!amount || amount <= 0) {
                  Alert.alert("Missing amount", "Enter a valid amount.");
                  return;
                }
                const type = expenseType.trim();
                await createExpense.mutateAsync({
                  date: expenseDate,
                  expense_type: type,
                  amount,
                  note: expenseNote.trim() ? expenseNote.trim() : undefined,
                });
                setExpenseAmount("");
                setExpenseNote("");
              }}
            >
              <Text style={styles.primaryText}>Save</Text>
            </Pressable>
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
            <Pressable
              style={styles.primary}
              onPress={async () => {
                const amount = Number(depositAmount);
                if (!amount || amount <= 0) {
                  Alert.alert("Missing amount", "Enter a valid amount.");
                  return;
                }
                await createBankDeposit.mutateAsync({
                  date: expenseDate,
                  amount,
                  note: depositNote.trim() ? depositNote.trim() : undefined,
                });
                setDepositAmount("");
                setDepositNote("");
              }}
            >
              <Text style={styles.primaryText}>Save</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.listBlock}>
          {cashEntries.map((item) => (
            <View key={`${item.kind}-${item.id}`} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.titleBlock}>
                  <Text style={styles.name}>{item.label}</Text>
                  <Text style={styles.metaLine}>For date: {item.date}</Text>
                  {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
                </View>
                <View style={styles.headerRight}>
                  <Text style={styles.time}>{formatDateTime(item.timestamp)}</Text>
                  <View style={styles.inlineActions}>
                    <Pressable
                      accessibilityLabel={`Remove ${item.kind}`}
                      onPress={() => {
                        if (item.kind === "expense" && item.expenseType) {
                          deleteExpense.mutate({ date: item.date, expense_type: item.expenseType });
                          return;
                        }
                        if (item.kind === "deposit") {
                          deleteBankDeposit.mutate({ id: item.id, date: item.date });
                        }
                      }}
                      style={styles.iconBtn}
                    >
                      <Ionicons name="trash-outline" size={16} color="#b00020" />
                    </Pressable>
                    <Text style={styles.expenseAmount}>-{item.amount.toFixed(0)}</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
          {cashEntries.length === 0 && <Text style={styles.meta}>No entries yet.</Text>}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
