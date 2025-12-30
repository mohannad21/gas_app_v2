import { listActivities } from "@/lib/api";
import { Activity } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";

export function useActivities() {
  return useQuery<Activity[]>({
    queryKey: ["activities"],
    queryFn: listActivities,
  });
}
