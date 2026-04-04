import { useQuery } from "@tanstack/react-query";

import { getPlanBillingStatus } from "@/lib/api/billing";
import { PlanBillingStatus } from "@/types/billing";

export function usePlanBillingStatus() {
  return useQuery<PlanBillingStatus>({
    queryKey: ["tenant", "billing", "status"],
    queryFn: getPlanBillingStatus,
  });
}
