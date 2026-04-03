import { createExpense, deleteExpense, listExpenses, updateExpense } from "@/lib/api";
import { getUserFacingApiError } from "@/lib/apiErrors";
import { Expense, ExpenseCreateInput, ExpenseUpdateInput } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { showToast } from "@/lib/toast";

export function useExpenses(date?: string, options?: { enabled?: boolean; includeDeleted?: boolean }) {
  const enabled = options?.enabled ?? true;
  return useQuery<Expense[]>({
    queryKey: ["expenses", date ?? "all", options?.includeDeleted ?? false],
    enabled,
    queryFn: () => listExpenses(date, options?.includeDeleted),
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ExpenseCreateInput) => createExpense(payload),
    onError: (err) => {
      showToast(getUserFacingApiError(err, "Failed to save expense."));
    },
    onSuccess: (_, variables) => {
      showToast("Expense saved");
      queryClient.invalidateQueries({ queryKey: ["expenses", "all"] });
      queryClient.invalidateQueries({ queryKey: ["expenses", variables.date] });
      queryClient.invalidateQueries({ queryKey: ["company", "balances"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ExpenseUpdateInput }) => updateExpense(id, payload),
    onError: (err) => {
      showToast(getUserFacingApiError(err, "Failed to update expense."));
    },
    onSuccess: (_, variables) => {
      showToast("Expense updated");
      const existing = queryClient
        .getQueriesData<Expense[]>({ queryKey: ["expenses"] })
        .flatMap(([, expenses]) => expenses ?? [])
        .find((expense) => expense.id === variables.id);
      queryClient.invalidateQueries({ queryKey: ["expenses", "all"] });
      if (existing?.date) {
        queryClient.invalidateQueries({ queryKey: ["expenses", existing.date] });
      }
      if (variables.payload.date) {
        queryClient.invalidateQueries({ queryKey: ["expenses", variables.payload.date] });
      }
      queryClient.invalidateQueries({ queryKey: ["company", "balances"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; date: string }) => deleteExpense(id),
    onError: (err) => {
      showToast(getUserFacingApiError(err, "Failed to remove expense."));
    },
    onSuccess: (_, variables) => {
      showToast("Expense removed");
      queryClient.invalidateQueries({ queryKey: ["expenses", "all"] });
      queryClient.invalidateQueries({ queryKey: ["expenses", variables.date] });
      queryClient.invalidateQueries({ queryKey: ["company", "balances"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}

