import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";

import { createSystemType, listSystemTypes, updateSystemType } from "@/lib/api";
import { SystemTypeOption } from "@/types/domain";
import { showToast } from "@/lib/toast";

function extractErrorMessage(err: AxiosError) {
  const detail = err.response?.data?.detail ?? err.response?.data?.message ?? err.message;
  if (typeof detail === "string") return detail;
  if (detail) return JSON.stringify(detail);
  return "Unknown error";
}

export function useSystemTypes() {
  return useQuery<SystemTypeOption[]>({
    queryKey: ["system-types"],
    queryFn: listSystemTypes,
    refetchOnMount: "always",
  });
}

export function useCreateSystemType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createSystemType(name),
    onError: (err) => {
      const axiosError = err as AxiosError;
      const message = extractErrorMessage(axiosError);
      console.error("[createSystemType ERROR]", axiosError.response?.status, message);
      showToast(`Failed to add system type: ${message}`);
    },
    onSuccess: () => {
      showToast("System type added");
      queryClient.invalidateQueries({ queryKey: ["system-types"] });
    },
  });
}

export function useUpdateSystemType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Pick<SystemTypeOption, "name" | "is_active">> }) =>
      updateSystemType(id, payload),
    onError: (err) => {
      const axiosError = err as AxiosError;
      const message = extractErrorMessage(axiosError);
      console.error("[updateSystemType ERROR]", axiosError.response?.status, message);
      showToast(`Failed to update system type: ${message}`);
    },
    onSuccess: () => {
      showToast("System type updated");
      queryClient.invalidateQueries({ queryKey: ["system-types"] });
    },
  });
}
