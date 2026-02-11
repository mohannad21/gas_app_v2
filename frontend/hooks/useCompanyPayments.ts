import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createCompanyPayment } from "@/lib/api";

export function useCreateCompanyPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCompanyPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company", "balances"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}
