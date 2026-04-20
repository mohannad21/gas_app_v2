import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSystemSettings, initializeSystem, updateSystemSettings } from "@/lib/api";
import { getUserFacingApiError, logApiError } from "@/lib/apiErrors";
import { showToast } from "@/lib/toast";
import { SystemInitializeInput, SystemSettings } from "@/types/domain";

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
      showToast(getUserFacingApiError(err, "Failed to initialize system."));
      logApiError("[initializeSystem ERROR]", err);
    },
    onSuccess: () => {
      if (showSuccessToast) {
        showToast("System initialized");
      }
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["cash"] });
    },
  });
}

export function useUpdateSystemSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { currency_code?: string; money_decimals?: number }) =>
      updateSystemSettings(payload),
    onError: (err) => {
      showToast(getUserFacingApiError(err, "Failed to update settings."));
      logApiError("[updateSystemSettings ERROR]", err);
    },
    onSuccess: () => {
      showToast("Settings saved");
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
    },
  });
}
