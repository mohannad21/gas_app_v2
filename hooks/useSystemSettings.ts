import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";

import { getSystemSettings, initializeSystem } from "@/lib/api";
import { showToast } from "@/lib/toast";
import { SystemInitializeInput, SystemSettings } from "@/types/domain";

function extractErrorMessage(err: AxiosError) {
  const data = err.response?.data;
  if (data && typeof data === "object") {
    const detail = (data as Record<string, unknown>).detail ?? (data as Record<string, unknown>).message;
    if (typeof detail === "string") return detail;
  }
  return err.message || "Unknown error";
}

export function useSystemSettings() {
  return useQuery<SystemSettings>({
    queryKey: ["system-settings"],
    queryFn: getSystemSettings,
  });
}

export function useInitializeSystem(options?: { showToast?: boolean }) {
  const queryClient = useQueryClient();
  const showSuccessToast = options?.showToast ?? true;
  return useMutation({
    mutationFn: (payload: SystemInitializeInput) => initializeSystem(payload),
    onError: (err) => {
      const axiosError = err as AxiosError;
      const message = extractErrorMessage(axiosError);
      showToast(`Failed to initialize system: ${message}`);
      console.error("[initializeSystem ERROR]", axiosError.response?.status, message);
    },
    onSuccess: () => {
      if (showSuccessToast) {
        showToast("System initialized");
      }
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["cash"] });
    },
  });
}
