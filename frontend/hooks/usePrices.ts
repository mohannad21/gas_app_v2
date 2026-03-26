import { listPriceSettings, savePriceSetting } from "@/lib/api";
import { getUserFacingApiError, logApiError } from "@/lib/apiErrors";
import { showToast } from "@/lib/toast";
import { PriceSetting } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function usePriceSettings() {
  return useQuery<PriceSetting[]>({
    queryKey: ["prices"],
    queryFn: listPriceSettings,
  });
}

export function useSavePriceSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: savePriceSetting,
    onSuccess: () => {
      showToast("Price saved");
      queryClient.invalidateQueries({ queryKey: ["prices"] });
    },
    onError: (err) => {
      logApiError("[savePriceSetting ERROR]", err);
      showToast(getUserFacingApiError(err, "Unable to save price."));
    },
  });
}

