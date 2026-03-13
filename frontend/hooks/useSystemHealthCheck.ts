import { useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";

import { getSystemHealthCheck } from "@/lib/api";
import { showToast } from "@/lib/toast";
import { SystemHealthCheck } from "@/types/domain";

function extractErrorMessage(err: AxiosError) {
  const data = err.response?.data;
  if (data && typeof data === "object") {
    const detail = (data as Record<string, unknown>).detail ?? (data as Record<string, unknown>).message;
    if (typeof detail === "string") return detail;
  }
  return err.message || "Unknown error";
}

export function useSystemHealthCheck() {
  return useQuery<SystemHealthCheck>({
    queryKey: ["system-health-check"],
    queryFn: getSystemHealthCheck,
    onError: (err) => {
      const axiosError = err as AxiosError;
      const message = extractErrorMessage(axiosError);
      showToast(`Health check failed: ${message}`);
      console.error("[system health check ERROR]", axiosError.response?.status, message);
    },
  });
}

