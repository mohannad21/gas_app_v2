import { useQuery } from "@tanstack/react-query";

import { getCompanyBalances } from "@/lib/api";

export function useCompanyBalances() {
  return useQuery({
    queryKey: ["company", "balances"],
    queryFn: () => getCompanyBalances(),
  });
}

