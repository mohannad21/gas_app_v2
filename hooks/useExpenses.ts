import { createExpense, deleteExpense, listExpenses } from "@/lib/api";
import { Expense, ExpenseCreateInput } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { showToast } from "@/lib/toast";

function extractErrorMessage(err: AxiosError) {
  const detail = err.response?.data?.detail ?? err.response?.data?.message ?? err.message;
  if (typeof detail === "string") return detail;
  if (detail) return JSON.stringify(detail);
  return "Unknown error";
}

export function useExpenses(date?: string, options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  return useQuery<Expense[]>({
    queryKey: ["expenses", date ?? "all"],
    enabled,
    queryFn: () => listExpenses(date),
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ExpenseCreateInput) => createExpense(payload),
    onError: (err) => {
      const message = extractErrorMessage(err as AxiosError);
      showToast(`Failed to save expense: ${message}`);
    },
    onSuccess: (_, variables) => {
      showToast("Expense saved");
      queryClient.invalidateQueries({ queryKey: ["expenses", "all"] });
      queryClient.invalidateQueries({ queryKey: ["expenses", variables.date] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ date, expense_type }: { date: string; expense_type: string }) =>
      deleteExpense(date, expense_type),
    onError: (err) => {
      const message = extractErrorMessage(err as AxiosError);
      showToast(`Failed to remove expense: ${message}`);
    },
    onSuccess: (_, variables) => {
      showToast("Expense removed");
      queryClient.invalidateQueries({ queryKey: ["expenses", "all"] });
      queryClient.invalidateQueries({ queryKey: ["expenses", variables.date] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}
