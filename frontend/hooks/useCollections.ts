import { createCollection, deleteCollection, listCollections, updateCollection } from "@/lib/api";
import { showToast } from "@/lib/toast";
import { CollectionCreateInput, CollectionUpdateInput } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";

function extractErrorMessage(err: AxiosError) {
  const detail = err.response?.data?.detail ?? err.response?.data?.message ?? err.message;
  if (typeof detail === "string") return detail;
  if (detail) return JSON.stringify(detail);
  return "Unknown error";
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
    onSuccess: () => {
      showToast("Collection saved");
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
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
    onSuccess: () => {
      showToast("Collection updated");
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
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
    onSuccess: () => {
      showToast("Collection deleted");
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["inventory"], exact: false });
    },
  });
}
