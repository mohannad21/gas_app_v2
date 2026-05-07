import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createCompanyPayment, deleteCompanyPayment, listCompanyPayments } from "@/lib/api";
import { getUserFacingApiError, logApiError } from "@/lib/apiErrors";
import { showToast } from "@/lib/toast";
import { CompanyPayment } from "@/types/domain";

export function useCompanyPayments(options?: { enabled?: boolean; includeDeleted?: boolean }) {
  const enabled = options?.enabled ?? true;
  return useQuery<CompanyPayment[]>({
    queryKey: ["company", "payments", options?.includeDeleted ?? false],
    enabled,
    queryFn: () => listCompanyPayments(options?.includeDeleted),
  });
}

export function useCreateCompanyPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCompanyPayment,
    onError: (err) => {
      logApiError("[createCompanyPayment ERROR]", err);
      showToast(getUserFacingApiError(err, "Failed to save company payment."));
    },
    onSuccess: () => {
      showToast("Company payment saved");
      queryClient.invalidateQueries({ queryKey: ["company", "balances"] });
      queryClient.invalidateQueries({ queryKey: ["company", "payments"] });
      queryClient.invalidateQueries({ queryKey: ["company", "adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "refills"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}

export function useDeleteCompanyPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCompanyPayment(id),
    onError: (err) => {
      logApiError("[deleteCompanyPayment ERROR]", err);
      showToast(getUserFacingApiError(err, "Failed to delete company payment."));
    },
    onSuccess: () => {
      showToast("Company payment deleted");
      queryClient.invalidateQueries({ queryKey: ["company", "balances"] });
      queryClient.invalidateQueries({ queryKey: ["company", "payments"] });
      queryClient.invalidateQueries({ queryKey: ["company", "adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "refills"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}

