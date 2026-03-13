import { listPriceSettings, savePriceSetting } from "@/lib/api";
import { showToast } from "@/lib/toast";
import { PriceSetting } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";

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
      const axiosErr = err as AxiosError;
      const detail =
        axiosErr.response?.data?.detail ?? axiosErr.response?.data ?? axiosErr.message;
      console.error("savePriceSetting failed", axiosErr.response ?? axiosErr.message);
      showToast(
        detail
          ? `Unable to save price${typeof detail === "string" ? `: ${detail}` : ""}`
          : "Unable to save price"
      );
    },
  });
}

