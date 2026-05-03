import { createOrder, deleteOrder, listOrders, updateOrder } from "@/lib/api";
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

function invalidateCustomerAdjustmentHistory(
  queryClient: ReturnType<typeof useQueryClient>,
  customerId?: string
) {
  if (customerId) {
    queryClient.invalidateQueries({ queryKey: ["customers", "adjustments", customerId] });
  }
  queryClient.invalidateQueries({ queryKey: ["customers", "adjustments", "all"], exact: false });
}

export function pickBetter(a: Order, b: Order): Order {
  if (a.is_deleted && !b.is_deleted) return b;
  if (!a.is_deleted && b.is_deleted) return a;
  const aTime = new Date(a.delivered_at).getTime();
  const bTime = new Date(b.delivered_at).getTime();
  if (bTime !== aTime) return bTime > aTime ? b : a;
  return new Date(b.created_at).getTime() >= new Date(a.created_at).getTime() ? b : a;
}

export function useOrders(includeDeleted?: boolean) {
  return useQuery<Order[]>({
    queryKey: ["orders", includeDeleted ?? false],
    queryFn: async () => {
      const data = await listOrders(includeDeleted);
      const byId = new Map<string, Order>();
      for (const order of data) {
        const existing = byId.get(order.id);
        byId.set(order.id, existing ? pickBetter(existing, order) : order);
      }
      const deduped = Array.from(byId.values());
      return deduped.sort(
        (a, b) => new Date(b.delivered_at).getTime() - new Date(a.delivered_at).getTime()
      );
    },
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
      invalidateCustomerAdjustmentHistory(queryClient, variables.customer_id);
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
      invalidateCustomerAdjustmentHistory(queryClient, variables.payload.customer_id);
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
      invalidateCustomerAdjustmentHistory(queryClient, existing?.customer_id);
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["inventory"], exact: false });
    },
  });
}

