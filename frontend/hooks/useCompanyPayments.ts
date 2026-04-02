import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createCompanyPayment, listCompanyPayments } from "@/lib/api";
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company", "balances"] });
      queryClient.invalidateQueries({ queryKey: ["company", "payments"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}

