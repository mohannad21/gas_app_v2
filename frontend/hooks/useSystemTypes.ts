import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createSystemType, listSystemTypes, updateSystemType } from "@/lib/api";
import { getUserFacingApiError, logApiError } from "@/lib/apiErrors";
import { SystemTypeOption } from "@/types/domain";
import { showToast } from "@/lib/toast";

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
      logApiError("[createSystemType ERROR]", err);
      showToast(getUserFacingApiError(err, "Failed to add system type."));
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
      logApiError("[updateSystemType ERROR]", err);
      showToast(getUserFacingApiError(err, "Failed to update system type."));
    },
    onSuccess: () => {
      showToast("System type updated");
      queryClient.invalidateQueries({ queryKey: ["system-types"] });
    },
  });
}

