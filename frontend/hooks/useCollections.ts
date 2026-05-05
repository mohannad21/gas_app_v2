import { createCollection, deleteCollection, listCollections, updateCollection } from "@/lib/api";
import { getUserFacingApiError, logApiError } from "@/lib/apiErrors";
import { customerBalanceQueryKey } from "@/hooks/useCustomers";
import { showToast } from "@/lib/toast";
import { CollectionCreateInput, CollectionEvent, CollectionUpdateInput } from "@/types/domain";
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

export function useCreateCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CollectionCreateInput) => createCollection(payload),
    onError: (err) => {
      logApiError("[createCollection ERROR]", err);
      showToast(getUserFacingApiError(err, "Failed to save collection."));
    },
    onSuccess: (_, variables) => {
      showToast("Collection saved");
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      invalidateCustomerBalance(queryClient, variables.customer_id);
      invalidateCustomerAdjustmentHistory(queryClient, variables.customer_id);
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["inventory"], exact: false });
    },
  });
}

export function useCollections(includeDeleted?: boolean) {
  return useQuery({
    queryKey: ["collections", includeDeleted ?? false],
    queryFn: () => listCollections(includeDeleted),
  });
}

export function useUpdateCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CollectionUpdateInput }) =>
      updateCollection(id, payload),
    onError: (err) => {
      logApiError("[updateCollection ERROR]", err);
      showToast(getUserFacingApiError(err, "Failed to update collection."));
    },
    onSuccess: (_, variables) => {
      showToast("Collection updated");
      const existing = queryClient
        .getQueryData<CollectionEvent[]>(["collections"])
        ?.find((collection) => collection.id === variables.id);
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      invalidateCustomerBalance(queryClient, variables.payload.customer_id ?? existing?.customer_id);
      invalidateCustomerAdjustmentHistory(queryClient, variables.payload.customer_id ?? existing?.customer_id);
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
      logApiError("[deleteCollection ERROR]", err);
      showToast(getUserFacingApiError(err, "Failed to delete collection."));
    },
    onSuccess: (_, id) => {
      showToast("Collection deleted");
      const existing = queryClient
        .getQueryData<CollectionEvent[]>(["collections"])
        ?.find((collection) => collection.id === id);
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      invalidateCustomerBalance(queryClient, existing?.customer_id);
      invalidateCustomerAdjustmentHistory(queryClient, existing?.customer_id);
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["inventory"], exact: false });
    },
  });
}

