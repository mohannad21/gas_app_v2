import { createCustomer, deleteCustomer, listCustomers, updateCustomer } from "@/lib/api";
import { showToast } from "@/lib/toast";
import { Customer } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Customer> }) =>
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
