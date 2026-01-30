import { createOrder, deleteOrder, listOrders, listOrdersByDate, updateOrder } from "@/lib/api";
import { showToast } from "@/lib/toast";
import { Order, OrderUpdateInput } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";

function extractErrorMessage(err: AxiosError) {
  const detail = err.response?.data?.detail ?? err.response?.data?.message ?? err.message;
  if (typeof detail === "string") return detail;
  if (detail) return JSON.stringify(detail);
  return "Unknown error";
}

export function useOrders() {
  return useQuery<Order[]>({
    queryKey: ["orders"],
    queryFn: async () => {
      const data = await listOrders();
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
      const axiosError = err as AxiosError;
      console.error("[createOrder ERROR]", axiosError.response?.status, axiosError.response?.data ?? axiosError.message);
      showToast(`Failed to create order: ${extractErrorMessage(axiosError)}`);
    },
    onSuccess: () => {
      showToast("Order created");

      // FIX: remove activities/system/customer invalidations
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders", "day"] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
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
      const axiosError = err as AxiosError;
      console.error("[updateOrder ERROR]", axiosError.response?.status, axiosError.response?.data ?? axiosError.message);
      showToast(`Failed to update order: ${extractErrorMessage(axiosError)}`);
    },

    onSuccess: () => {
      showToast("Order updated");

      // FIX: remove activities/system/customer invalidations
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders", "day"] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
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

      queryClient.setQueryData<Order[]>(["orders"], (prev) =>
        prev ? prev.filter((o) => o.id !== id) : prev
      );

      // FIX: remove activities/system/customer invalidations
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders", "day"] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["inventory"], exact: false });
    },
  });
}
