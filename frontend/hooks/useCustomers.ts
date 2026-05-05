import {
  createCustomer,
  createCustomerAdjustment,
  deleteCustomer,
  deleteCustomerAdjustment,
  getCustomerBalance,
  listCustomerAdjustments,
  listCustomers,
  updateCustomer,
} from "@/lib/api";
import { getUserFacingApiError, logApiError } from "@/lib/apiErrors";
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

export const CUSTOMER_DELETE_BLOCKED_MESSAGE =
  "You cannot delete this customer while they still have unreversed transactions. Remove or reverse their transactions first.";

export function isCustomerDeleteBlockedError(err: unknown) {
  const axiosError = err as AxiosError;
  const data = axiosError.response?.data;
  const detail =
    data && typeof data === "object" ? (data as Record<string, unknown>).detail : undefined;
  return detail === "customer_has_transactions" || (axiosError.response?.status === 409 && !detail);
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
      showToast(getUserFacingApiError(err, "Failed to create customer."));
      logApiError("[createCustomer ERROR]", err);
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
      showToast(getUserFacingApiError(err, "Failed to create adjustment."));
      logApiError("[createCustomerAdjustment ERROR]", err);
    },
    onSuccess: (_, variables) => {
      if (showSuccessToast) {
        showToast("Adjustment added");
      }
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: customerBalanceQueryKey(variables.customer_id) });
      queryClient.invalidateQueries({ queryKey: ["customers", "adjustments", variables.customer_id] });
      queryClient.invalidateQueries({ queryKey: ["customers", "adjustments", "all"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
    },
  });
}

export function useDeleteCustomerAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; customerId?: string }) => deleteCustomerAdjustment(id),
    onError: (err) => {
      showToast(getUserFacingApiError(err, "Failed to delete adjustment."));
      logApiError("[deleteCustomerAdjustment ERROR]", err);
    },
    onSuccess: (_, variables) => {
      showToast("Adjustment deleted");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      if (variables.customerId) {
        queryClient.invalidateQueries({ queryKey: customerBalanceQueryKey(variables.customerId) });
        queryClient.invalidateQueries({ queryKey: ["customers", "adjustments", variables.customerId] });
      }
      queryClient.invalidateQueries({ queryKey: ["customers", "adjustments"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
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
      queryClient.invalidateQueries({ queryKey: customerBalanceQueryKey(variables.id) });

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
      const message = isCustomerDeleteBlockedError(axiosError)
        ? CUSTOMER_DELETE_BLOCKED_MESSAGE
        : getUserFacingApiError(axiosError, "Failed to delete customer.");
      showToast(message);
      logApiError("[deleteCustomer ERROR]", err);
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

