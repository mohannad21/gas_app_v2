import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createCompanyBalanceAdjustment,
  deleteCompanyBalanceAdjustment,
  getCompanyBalances,
  listCompanyBalanceAdjustments,
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
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
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
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
    },
  });
}

