import {
  createInventoryAdjust,
  createInventoryRefill,
  deleteInventoryRefill,
  getInventoryLatest,
  getInventoryRefillDetails,
  getInventorySnapshot,
  initInventory,
  listInventoryRefills,
  updateInventoryRefill,
} from "@/lib/api";
import { InventorySnapshot } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useInventoryLatest() {
  return useQuery<InventorySnapshot | null>({
    queryKey: ["inventory", "latest"],
    queryFn: () => getInventoryLatest(),
  });
}

export function useInventorySnapshot(params?: {
  date?: string | null;
  time?: string | null;
  time_of_day?: "morning" | "evening" | null;
  at?: string | null;
}) {
  const key = params?.at
    ? ["inventory", "snapshot", params.at]
    : ["inventory", "snapshot", params?.date, params?.time, params?.time_of_day];
  return useQuery<InventorySnapshot | null>({
    queryKey: key,
    queryFn: () =>
      getInventorySnapshot({
        date: params?.date ?? undefined,
        time: params?.time ?? undefined,
        time_of_day: params?.time_of_day ?? undefined,
        at: params?.at ?? undefined,
      }),
    enabled: !!(params?.at || (params?.date && (params?.time || params?.time_of_day))),
  });
}

export function useInitInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: initInventory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "latest"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}

export function useCreateRefill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createInventoryRefill,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "refills"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "latest"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}

export function useAdjustInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createInventoryAdjust,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "latest"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "refills"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}

export function useInventoryRefills() {
  return useQuery({
    queryKey: ["inventory", "refills"],
    queryFn: () => listInventoryRefills(),
  });
}

export function useInventoryRefillDetails(refillId?: string | null) {
  return useQuery({
    queryKey: ["inventory", "refill", refillId],
    queryFn: () => getInventoryRefillDetails(refillId as string),
    enabled: !!refillId,
  });
}

export function useUpdateRefill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ refillId, ...payload }: { refillId: string } & Parameters<typeof updateInventoryRefill>[1]) =>
      updateInventoryRefill(refillId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "refills"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "latest"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}

export function useDeleteRefill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (refillId: string) => deleteInventoryRefill(refillId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "refills"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "latest"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["reports-v2"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["reports-day-v2"], exact: false });
    },
  });
}
