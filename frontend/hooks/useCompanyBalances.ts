import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createCompanyBalanceAdjustment, getCompanyBalances } from "@/lib/api";

export function useCompanyBalances() {
  return useQuery({
    queryKey: ["company", "balances"],
    queryFn: () => getCompanyBalances(),
  });
}

export function useCreateCompanyBalanceAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCompanyBalanceAdjustment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company", "balances"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}

