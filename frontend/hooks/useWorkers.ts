import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createWorkerInvite, listPendingInvites, listWorkers, revokeInvite, revokeWorker } from "@/lib/api/workers";
import { getUserFacingApiError, logApiError } from "@/lib/apiErrors";
import { showToast } from "@/lib/toast";
import type { PendingInvite, WorkerInviteInput, WorkerInviteResult, WorkerMember } from "@/types/workers";

function inviteErrorMessage(err: unknown) {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  if (detail === "worker_limit_reached") {
    return "No worker seats are available on this plan.";
  }
  return getUserFacingApiError(err, "Failed to send invite.");
}

export function useWorkers() {
  return useQuery<WorkerMember[]>({
    queryKey: ["workers"],
    queryFn: listWorkers,
  });
}

export function usePendingInvites() {
  return useQuery<PendingInvite[]>({
    queryKey: ["workers", "invites"],
    queryFn: listPendingInvites,
  });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: WorkerInviteInput) => createWorkerInvite(payload),
    onSuccess: () => {
      showToast("Invite created");
      queryClient.invalidateQueries({ queryKey: ["workers"] });
      queryClient.invalidateQueries({ queryKey: ["workers", "invites"] });
    },
    onError: (err) => {
      logApiError("[createWorkerInvite ERROR]", err);
      showToast(inviteErrorMessage(err));
    },
  });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => revokeInvite(inviteId),
    onSuccess: () => {
      showToast("Invite cancelled");
      queryClient.invalidateQueries({ queryKey: ["workers", "invites"] });
    },
    onError: (err) => {
      logApiError("[revokeInvite ERROR]", err);
      showToast(getUserFacingApiError(err, "Failed to cancel invite."));
    },
  });
}

export function useRevokeWorker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) => revokeWorker(membershipId),
    onSuccess: () => {
      showToast("Worker removed");
      queryClient.invalidateQueries({ queryKey: ["workers"] });
    },
    onError: (err) => {
      logApiError("[revokeWorker ERROR]", err);
      showToast(getUserFacingApiError(err, "Failed to remove worker."));
    },
  });
}
