import {
  createCustomer,
  createCustomerAdjustment,
  deleteCustomer,
  getCustomerBalance,
  listCustomerAdjustments,
  listCustomers,
  updateCustomer,
} from "@/lib/api";
import { showToast } from "@/lib/toast";
import {
  Customer,
  CustomerAdjustment,
  CustomerAdjustmentCreateInput,
  CustomerBalance,
  CustomerUpdateInput,
} from "@/types/domain";
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

export function customerBalanceQueryKey(customerId?: string) {
  return ["customers", "balance", customerId] as const;
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

export function useCreateCustomer(options?: { showToast?: boolean }) {
  const queryClient = useQueryClient();
  const showSuccessToast = options?.showToast ?? true;
  return useMutation({
    mutationFn: createCustomer,
    onError: (err) => {
      const axiosError = err as AxiosError;
      const message = extractErrorMessage(axiosError);
      showToast(`Failed to create customer: ${message}`);
      console.error("[createCustomer ERROR]", axiosError.response?.status, message);
    },
    onSuccess: () => {
      if (showSuccessToast) {
        showToast("Customer created");
      }
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useCustomerBalance(customerId?: string) {
  return useQuery<CustomerBalance>({
    queryKey: customerBalanceQueryKey(customerId),
    queryFn: () => getCustomerBalance(customerId ?? ""),
    enabled: Boolean(customerId),
  });
}

export function useCustomerAdjustments(customerId?: string) {
  return useQuery<CustomerAdjustment[]>({
    queryKey: ["customers", "adjustments", customerId],
    queryFn: () => listCustomerAdjustments(customerId ?? ""),
    enabled: Boolean(customerId),
  });
}

export function useAllCustomerAdjustments(customerIds?: string[], options?: { enabled?: boolean }) {
  const ids = Array.isArray(customerIds) ? customerIds : [];
  const enabled = options?.enabled ?? true;
  return useQuery<CustomerAdjustment[]>({
    queryKey: ["customers", "adjustments", "all", ids.join(",")],
    queryFn: async () => {
      const rows = await Promise.all(ids.map((customerId) => listCustomerAdjustments(customerId)));
      return rows.flat();
    },
    enabled: enabled && ids.length > 0,
  });
}

export function useCreateCustomerAdjustment(options?: { showToast?: boolean }) {
  const queryClient = useQueryClient();
  const showSuccessToast = options?.showToast ?? true;
  return useMutation({
    mutationFn: (payload: CustomerAdjustmentCreateInput) => createCustomerAdjustment(payload),
    onError: (err) => {
      const axiosError = err as AxiosError;
      const message = extractErrorMessage(axiosError);
      showToast(`Failed to create adjustment: ${message}`);
      console.error("[createCustomerAdjustment ERROR]", axiosError.response?.status, message);
    },
    onSuccess: (_, variables) => {
      if (showSuccessToast) {
        showToast("Adjustment added");
      }
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: customerBalanceQueryKey(variables.customer_id) });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"] });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"] });
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
    onError: (err) => {
      const axiosError = err as AxiosError;
      const message = extractErrorMessage(axiosError);
      showToast(`Failed to delete customer: ${message}`);
      console.error("[deleteCustomer ERROR]", axiosError.response?.status, message);
    },
    onSuccess: (_, id) => {
      showToast("Customer removed");
      queryClient.setQueryData<Customer[]>(["customers"], (prev) =>
        prev ? prev.filter((c) => c.id !== id) : prev
      );

      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

