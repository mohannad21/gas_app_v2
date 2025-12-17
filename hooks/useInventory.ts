import { getInventoryLatest, initInventory } from "@/lib/api";
import { InventorySnapshot } from "@/types/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useInventoryLatest() {
  return useQuery<InventorySnapshot | null>({
    queryKey: ["inventory", "latest"],
    queryFn: () => getInventoryLatest(),
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
    },
  });
}
