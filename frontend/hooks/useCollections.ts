import { createCollection, deleteCollection, listCollections, updateCollection } from "@/lib/api";
import { customerBalanceQueryKey } from "@/hooks/useCustomers";
import { showToast } from "@/lib/toast";
import { CollectionCreateInput, CollectionEvent, CollectionUpdateInput } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";

function extractErrorMessage(err: AxiosError) {
  const detail = err.response?.data?.detail ?? err.response?.data?.message ?? err.message;
  if (typeof detail === "string") return detail;
  if (detail) return JSON.stringify(detail);
  return "Unknown error";
}

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

export function useCreateCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CollectionCreateInput) => createCollection(payload),
    onError: (err) => {
      const axiosError = err as AxiosError;
      console.error(
        "[createCollection ERROR]",
        axiosError.response?.status,
        axiosError.response?.data ?? axiosError.message
      );
      showToast(`Failed to save collection: ${extractErrorMessage(axiosError)}`);
    },
    onSuccess: (_, variables) => {
      showToast("Collection saved");
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      invalidateCustomerBalance(queryClient, variables.customer_id);
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["inventory"], exact: false });
    },
  });
}

export function useCollections() {
  return useQuery({
    queryKey: ["collections"],
    queryFn: listCollections,
  });
}

export function useUpdateCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CollectionUpdateInput }) =>
      updateCollection(id, payload),
    onError: (err) => {
      const axiosError = err as AxiosError;
      console.error(
        "[updateCollection ERROR]",
        axiosError.response?.status,
        axiosError.response?.data ?? axiosError.message
      );
      showToast(`Failed to update collection: ${extractErrorMessage(axiosError)}`);
    },
    onSuccess: (_, variables) => {
      showToast("Collection updated");
      const existing = queryClient
        .getQueryData<CollectionEvent[]>(["collections"])
        ?.find((collection) => collection.id === variables.id);
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      invalidateCustomerBalance(queryClient, variables.payload.customer_id ?? existing?.customer_id);
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["inventory"], exact: false });
    },
  });
}

export function useDeleteCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCollection(id),
    onError: (err) => {
      const axiosError = err as AxiosError;
      console.error(
        "[deleteCollection ERROR]",
        axiosError.response?.status,
        axiosError.response?.data ?? axiosError.message
      );
      showToast(`Failed to delete collection: ${extractErrorMessage(axiosError)}`);
    },
    onSuccess: (_, id) => {
      showToast("Collection deleted");
      const existing = queryClient
        .getQueryData<CollectionEvent[]>(["collections"])
        ?.find((collection) => collection.id === id);
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      invalidateCustomerBalance(queryClient, existing?.customer_id);
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["inventory"], exact: false });
    },
  });
}

