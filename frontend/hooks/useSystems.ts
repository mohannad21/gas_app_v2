import { createSystem, deleteSystem, listSystems, updateSystem } from "@/lib/api";
import { getUserFacingApiError, logApiError } from "@/lib/apiErrors";
import { showToast } from "@/lib/toast";
import { System, SystemCreateInput, SystemUpdateInput } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Normalize customer ID to prevent "" buckets
function normalizeCustomerId(id?: string | null) {
  if (!id || id.trim() === "") return null;
  return id;
}

export function useSystems(customerId?: string, options?: { enabled?: boolean }) {
  const keyId = normalizeCustomerId(customerId);
  const queryKey = ["systems", keyId ?? "all"];
  const enabled = options?.enabled ?? true;

  return useQuery<System[]>({
    queryKey,
    enabled,
    queryFn: () => listSystems(customerId),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export function useCreateSystem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SystemCreateInput) => createSystem(payload),
    onError: (err) => {
      logApiError("[createSystem ERROR]", err);
      showToast(getUserFacingApiError(err, "Failed to add system."));
    },
    onSuccess: (_, variables) => {
      showToast("System added");

      const key = normalizeCustomerId(variables.customer_id);

      queryClient.invalidateQueries({ queryKey: ["systems", key] });
    },
  });
}

export function useUpdateSystem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SystemUpdateInput }) => updateSystem(id, payload),
    onError: (err) => {
      logApiError("[updateSystem ERROR]", err);
      showToast(getUserFacingApiError(err, "Failed to update system."));
    },

    onSuccess: (updated) => {
      showToast("System updated");

      const customerKey = normalizeCustomerId(updated.customer_id);

      // Update cache for this customer's systems
      queryClient.setQueryData<System[]>(["systems", customerKey], (prev) =>
        prev ? prev.map((s) => (s.id === updated.id ? updated : s)) : prev
      );

      queryClient.invalidateQueries({ queryKey: ["systems", customerKey] });
    },
  });
}

export function useDeleteSystem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string; customerId?: string }) => deleteSystem(id),
    onError: (err) => {
      logApiError("[deleteSystem ERROR]", err);
      showToast(getUserFacingApiError(err, "Failed to remove system."));
    },
    onSuccess: (_, variables) => {
      showToast("System removed");

      const key = normalizeCustomerId(variables.customerId);

      queryClient.invalidateQueries({ queryKey: ["systems", key] });
    },
  });
}

