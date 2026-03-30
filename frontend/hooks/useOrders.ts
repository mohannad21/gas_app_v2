import { createOrder, deleteOrder, listOrders, listOrdersByDate, updateOrder } from "@/lib/api";
import { getUserFacingApiError, logApiError } from "@/lib/apiErrors";
import { customerBalanceQueryKey } from "@/hooks/useCustomers";
import { showToast } from "@/lib/toast";
import { Order, OrderUpdateInput } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

function invalidateCustomerBalance(
  queryClient: ReturnType<typeof useQueryClient>,
  customerId?: string
) {
  if (customerId) {
    queryClient.invalidateQueries({ queryKey: customerBalanceQueryKey(customerId) });
    return;
  }
  queryClient.invalidateQueries({ queryKey: customerBalanceQueryKey(), exact: false });
}

export function useOrders(includeDeleted?: boolean) {
  return useQuery<Order[]>({
    queryKey: ["orders", includeDeleted ?? false],
    queryFn: async () => {
      const data = await listOrders(includeDeleted);
      const deduped = Array.from(new Map(data.map((o) => [o.id, o])).values());
      return deduped.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
  });
}

export function useOrdersByDay(date?: string) {
  return useQuery<Order[]>({
    queryKey: ["orders", "day", date],
    queryFn: () => listOrdersByDate(date || ""),
    enabled: Boolean(date),
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createOrder,
    onError: (err) => {
      logApiError("[createOrder ERROR]", err);
      showToast(getUserFacingApiError(err, "Failed to create order."));
    },
    onSuccess: (_, variables) => {
      showToast("Order created");

      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders", "day"] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      invalidateCustomerBalance(queryClient, variables.customer_id);
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["inventory"], exact: false });
    },
  });
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: OrderUpdateInput }) =>
      updateOrder(id, payload),
    onError: (err) => {
      logApiError("[updateOrder ERROR]", err);
      showToast(getUserFacingApiError(err, "Failed to update order."));
    },

    onSuccess: (_, variables) => {
      showToast("Order updated");

      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders", "day"] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      invalidateCustomerBalance(queryClient, variables.payload.customer_id);
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["inventory"], exact: false });
    },
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteOrder,
    onSuccess: (_, id) => {
      showToast("Order removed");

      const existing = queryClient
        .getQueryData<Order[]>(["orders"])
        ?.find((order) => order.id === id);

      queryClient.setQueryData<Order[]>(["orders"], (prev) =>
        prev ? prev.filter((o) => o.id !== id) : prev
      );

      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders", "day"] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      invalidateCustomerBalance(queryClient, existing?.customer_id);
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["inventory"], exact: false });
    },
  });
}

