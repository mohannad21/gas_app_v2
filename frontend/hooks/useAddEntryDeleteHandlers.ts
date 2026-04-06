import { Alert } from "react-native";
import { BankDeposit, CashAdjustment, Expense, InventoryAdjustment } from "@/types/domain";
import { UseQueryResult, useMutation } from "@tanstack/react-query";
import { UseMutationResult } from "@tanstack/react-query";

interface DeleteHandlersArgs {
  deleteRefill: UseMutationResult<void, Error, string, unknown>;
  deleteInventoryAdjust: UseMutationResult<void, Error, string, unknown>;
  deleteCashAdjust: UseMutationResult<void, Error, string, unknown>;
  deleteExpense: UseMutationResult<void, Error, { id: string; date: string }, unknown>;
  deleteBankDeposit: UseMutationResult<void, Error, { id: string; date: string }, unknown>;
  markDeleting: (id: string) => void;
  unmarkDeleting: (id: string) => void;
  todayDate: string;
}

export function useAddEntryDeleteHandlers(args: DeleteHandlersArgs) {
  const {
    deleteRefill,
    deleteInventoryAdjust,
    deleteCashAdjust,
    deleteExpense,
    deleteBankDeposit,
    markDeleting,
    unmarkDeleting,
    todayDate,
  } = args;

  const handleRemoveRefill = (refillId: string) => {
    Alert.alert("Remove company activity?", "This will delete the company activity entry.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          markDeleting(refillId);
          try {
            await deleteRefill.mutateAsync(refillId);
          } catch (error) {
            console.error("[add] delete refill failed", error);
            Alert.alert("Failed to delete", "Try again later.");
          } finally {
            unmarkDeleting(refillId);
          }
        },
      },
    ]);
  };

  const handleDeleteInventoryAdjustment = (entry: InventoryAdjustment) => {
    Alert.alert("Remove adjustment?", "This will delete the adjustment entry.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          markDeleting(entry.id);
          try {
            await deleteInventoryAdjust.mutateAsync(entry.id);
          } catch (error) {
            console.error("[add] delete inventory adjustment failed", error);
            Alert.alert("Failed to delete", "Try again later.");
          } finally {
            unmarkDeleting(entry.id);
          }
        },
      },
    ]);
  };

  const handleDeleteCashAdjustment = (entry: CashAdjustment) => {
    Alert.alert("Remove adjustment?", "This will delete the wallet adjustment.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          markDeleting(entry.id);
          try {
            await deleteCashAdjust.mutateAsync(entry.id);
          } catch (error) {
            console.error("[add] delete cash adjustment failed", error);
            Alert.alert("Failed to delete", "Try again later.");
          } finally {
            unmarkDeleting(entry.id);
          }
        },
      },
    ]);
  };

  const handleDeleteExpense = (entry: Expense) => {
    Alert.alert("Remove expense?", "This will delete the expense entry.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          markDeleting(entry.id);
          try {
            await deleteExpense.mutateAsync({ id: entry.id, date: entry.date });
          } catch (error) {
            console.error("[add] delete expense failed", error);
            Alert.alert("Failed to delete", "Try again later.");
          } finally {
            unmarkDeleting(entry.id);
          }
        },
      },
    ]);
  };

  const handleDeleteBankTransfer = (entry: BankDeposit) => {
    const date = (entry.happened_at ?? "").slice(0, 10) || todayDate;
    Alert.alert("Remove transfer?", "This will delete the wallet/bank transfer entry.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          markDeleting(entry.id);
          try {
            await deleteBankDeposit.mutateAsync({ id: entry.id, date });
          } catch (error) {
            console.error("[add] delete bank transfer failed", error);
            Alert.alert("Failed to delete", "Try again later.");
          } finally {
            unmarkDeleting(entry.id);
          }
        },
      },
    ]);
  };

  return {
    handleRemoveRefill,
    handleDeleteInventoryAdjustment,
    handleDeleteCashAdjustment,
    handleDeleteExpense,
    handleDeleteBankTransfer,
  };
}
