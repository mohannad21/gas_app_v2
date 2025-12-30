import { createSystem, deleteSystem, listSystems, updateSystem } from "@/lib/api";
import { showToast } from "@/lib/toast";
import { System, SystemCreateInput, SystemUpdateInput } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";

// Normalize customer ID to prevent "" buckets
function normalizeCustomerId(id?: string | null) {
  if (!id || id.trim() === "") return null;
  return id;
}

function extractErrorMessage(err: AxiosError) {
  const detail = err.response?.data?.detail ?? err.response?.data?.message ?? err.message;
  if (typeof detail === "string") return detail;
  if (detail) return JSON.stringify(detail);
  return "Unknown error";
}

export function useSystems(customerId?: string, options?: { enabled?: boolean }) {
  const keyId = normalizeCustomerId(customerId);
  const queryKey = ["systems", keyId ?? "all"];
  const enabled = options?.enabled ?? true;

  return useQuery<System[]>({
    queryKey,
    enabled,
    queryFn: async () => {
      console.log("[listSystems CALL]", { customerId });
      const data = await listSystems(customerId);
      console.log("[listSystems RESULT]", {
        customerId,
        count: data.length,
        systems: data.map((s) => ({ id: s.id, active: s.is_active })),
      });
      return data;
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export function useCreateSystem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SystemCreateInput) => {
      console.log("[createSystem CALL]", payload);
      return createSystem(payload);
    },
    onError: (err) => {
      const axiosError = err as AxiosError;
      const message = extractErrorMessage(axiosError);
      console.error("[createSystem ERROR]", axiosError.response?.status, message);
      showToast(`Failed to add system: ${message}`);
    },
    onSuccess: (_, variables) => {
      showToast("System added");

      const key = normalizeCustomerId(variables.customer_id);

      queryClient.invalidateQueries({ queryKey: ["systems", key] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}

export function useUpdateSystem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: SystemUpdateInput }) => {
      console.log("[updateSystem CALL]", { id, payload });
      return updateSystem(id, payload);
    },
    onError: (err) => {
      const axiosError = err as AxiosError;
      const message = extractErrorMessage(axiosError);
      console.error("[updateSystem ERROR]", axiosError.response?.status, message);
      showToast(`Failed to update system: ${message}`);
    },

    onSuccess: (updated) => {
      showToast("System updated");

      const customerKey = normalizeCustomerId(updated.customer_id);

      // Update cache for this customer's systems
      queryClient.setQueryData<System[]>(["systems", customerKey], (prev) =>
        prev ? prev.map((s) => (s.id === updated.id ? updated : s)) : prev
      );

      queryClient.invalidateQueries({ queryKey: ["systems", customerKey] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}

export function useDeleteSystem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string; customerId?: string }) => deleteSystem(id),
    onError: (err) => {
      const axiosError = err as AxiosError;
      const message = extractErrorMessage(axiosError);
      console.error("[deleteSystem ERROR]", axiosError.response?.status, message);
      showToast(`Failed to remove system: ${message}`);
    },
    onSuccess: (_, variables) => {
      showToast("System removed");

      const key = normalizeCustomerId(variables.customerId);

      queryClient.invalidateQueries({ queryKey: ["systems", key] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}
