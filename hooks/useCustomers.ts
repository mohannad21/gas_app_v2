import { createCustomer, deleteCustomer, listCustomers, updateCustomer } from "@/lib/api";
import { showToast } from "@/lib/toast";
import { Customer, CustomerUpdateInput } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";

function extractErrorMessage(err: AxiosError) {
  const data = err.response?.data;
  if (data && typeof data === "object") {
    const detail = (data as Record<string, unknown>).detail ?? (data as Record<string, unknown>).message;
    if (typeof detail === "string") return detail;
  }
  return err.message || "Unknown error";
}

export function useCustomers() {
  return useQuery<Customer[]>({
    queryKey: ["customers"],
    queryFn: async () => {
      const data = await listCustomers();
      return Array.from(new Map(data.map((c) => [c.id, c])).values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCustomer,
    onError: (err) => {
      const axiosError = err as AxiosError;
      const message = extractErrorMessage(axiosError);
      showToast(`Failed to create customer: ${message}`);
      console.error("[createCustomer ERROR]", axiosError.response?.status, message);
    },
    onSuccess: () => {
      showToast("Customer created");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CustomerUpdateInput }) =>
      updateCustomer(id, payload),

    onSuccess: (_, variables) => {
      showToast("Customer updated");

      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });

      // Refresh systems for this customer
      const key = variables.id ?? null;
      queryClient.invalidateQueries({ queryKey: ["systems", key] });
      queryClient.invalidateQueries({ queryKey: ["systems"] });
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCustomer,
    onSuccess: (_, id) => {
      showToast("Customer removed");
      queryClient.setQueryData<Customer[]>(["customers"], (prev) =>
        prev ? prev.filter((c) => c.id !== id) : prev
      );

      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}
