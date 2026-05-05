import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createCompanyBalanceAdjustment,
  deleteCompanyBalanceAdjustment,
  getCompanyBalances,
  listCompanyBalanceAdjustments,
  updateCompanyBalanceAdjustment,
} from "@/lib/api";
import { getUserFacingApiError, logApiError } from "@/lib/apiErrors";
import { showToast } from "@/lib/toast";
import { CompanyBalanceAdjustment } from "@/types/domain";

export function useCompanyBalances() {
  return useQuery({
    queryKey: ["company", "balances"],
    queryFn: () => getCompanyBalances(),
  });
}

export function useCompanyBalanceAdjustments(options?: { enabled?: boolean; includeDeleted?: boolean }) {
  const enabled = options?.enabled ?? true;
  return useQuery<CompanyBalanceAdjustment[]>({
    queryKey: ["company", "adjustments", options?.includeDeleted ?? false],
    enabled,
    queryFn: () => listCompanyBalanceAdjustments(options?.includeDeleted),
  });
}

export function useCreateCompanyBalanceAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCompanyBalanceAdjustment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company", "balances"] });
      queryClient.invalidateQueries({ queryKey: ["company", "adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["company", "payments"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "refills"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}

export function useUpdateCompanyBalanceAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateCompanyBalanceAdjustment>[1] }) =>
      updateCompanyBalanceAdjustment(id, payload),
    onError: (err) => {
      showToast(getUserFacingApiError(err, "Failed to update adjustment."));
      logApiError("[updateCompanyBalanceAdjustment ERROR]", err);
    },
    onSuccess: () => {
      showToast("Adjustment updated");
      queryClient.invalidateQueries({ queryKey: ["company", "balances"] });
      queryClient.invalidateQueries({ queryKey: ["company", "adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["company", "payments"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "refills"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}

export function useDeleteCompanyBalanceAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCompanyBalanceAdjustment,
    onError: (err) => {
      showToast(getUserFacingApiError(err, "Failed to delete adjustment."));
      logApiError("[deleteCompanyBalanceAdjustment ERROR]", err);
    },
    onSuccess: () => {
      showToast("Adjustment deleted");
      queryClient.invalidateQueries({ queryKey: ["company", "balances"] });
      queryClient.invalidateQueries({ queryKey: ["company", "adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["company", "payments"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "refills"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}
