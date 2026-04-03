import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createCashAdjustment, deleteCashAdjustment, listCashAdjustments, updateCashAdjustment } from "@/lib/api";

export function useCreateCashAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCashAdjustment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash"] });
      queryClient.invalidateQueries({ queryKey: ["cash", "adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["company", "balances"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}

export function useCashAdjustments(date?: string, includeDeleted?: boolean) {
  return useQuery({
    queryKey: ["cash", "adjustments", date, includeDeleted ?? false],
    queryFn: () => listCashAdjustments(date as string, includeDeleted),
  });
}

export function useUpdateCashAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateCashAdjustment>[1] }) =>
      updateCashAdjustment(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash"] });
      queryClient.invalidateQueries({ queryKey: ["cash", "adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["company", "balances"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}

export function useDeleteCashAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCashAdjustment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash"] });
      queryClient.invalidateQueries({ queryKey: ["cash", "adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["company", "balances"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}

