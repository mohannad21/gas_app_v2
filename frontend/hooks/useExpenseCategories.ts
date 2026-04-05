import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createExpenseCategory, listExpenseCategories, toggleExpenseCategory } from "@/lib/api";
import { getUserFacingApiError, logApiError } from "@/lib/apiErrors";
import { showToast } from "@/lib/toast";

export function useExpenseCategories() {
  return useQuery({
    queryKey: ["expense-categories"],
    queryFn: listExpenseCategories,
    refetchOnMount: "always",
  });
}

export function useCreateExpenseCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createExpenseCategory(name),
    onError: (err) => {
      logApiError("[createExpenseCategory ERROR]", err);
      showToast(getUserFacingApiError(err, "Failed to add expense category."));
    },
    onSuccess: () => {
      showToast("Expense category added");
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
    },
  });
}

export function useToggleExpenseCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => toggleExpenseCategory(id, isActive),
    onError: (err) => {
      logApiError("[toggleExpenseCategory ERROR]", err);
      showToast(getUserFacingApiError(err, "Failed to update expense category."));
    },
    onSuccess: () => {
      showToast("Expense category updated");
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
    },
  });
}
