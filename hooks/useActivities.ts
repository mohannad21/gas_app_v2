import { listActivities } from "@/lib/api";
import { Activity } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";

export function useActivities(search?: string) {
  return useQuery<Activity[]>({
    queryKey: ["activities", search ?? ""],
    queryFn: async () => {
      const all = await listActivities();
      const term = (search ?? "").toLowerCase().trim();
      if (!term) return all;
      return all.filter((a) => a.description.toLowerCase().includes(term));
    },
  });
}
