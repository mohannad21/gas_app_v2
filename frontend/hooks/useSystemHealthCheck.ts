import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { getSystemHealthCheck } from "@/lib/api";
import { getUserFacingApiError, logApiError } from "@/lib/apiErrors";
import { showToast } from "@/lib/toast";
import { SystemHealthCheck } from "@/types/domain";

export function useSystemHealthCheck() {
  const query = useQuery<SystemHealthCheck>({
    queryKey: ["system-health-check"],
    queryFn: getSystemHealthCheck,
  });

  useEffect(() => {
    if (!query.error) return;
    showToast(getUserFacingApiError(query.error, "Health check failed."));
    logApiError("[system health check ERROR]", query.error);
  }, [query.error]);

  return query;
}

