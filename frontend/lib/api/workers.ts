import { PendingInviteSchema, WorkerInviteInputSchema, WorkerInviteResultSchema, WorkerMemberSchema, type WorkerInviteInput, type WorkerInviteResult, type WorkerMember, type PendingInvite } from "@/types/workers";

import { api, parse, parseArray } from "./client";

export async function listWorkers(): Promise<WorkerMember[]> {
  const { data } = await api.get("/workers");
  return parseArray(WorkerMemberSchema, data);
}

export async function listPendingInvites(): Promise<PendingInvite[]> {
  const { data } = await api.get("/workers/invites");
  return parseArray(PendingInviteSchema, data);
}

export async function createWorkerInvite(payload: WorkerInviteInput): Promise<WorkerInviteResult> {
  const parsedPayload = parse(WorkerInviteInputSchema, payload);
  const { data } = await api.post("/workers/invite", parsedPayload);
  return parse(WorkerInviteResultSchema, data);
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await api.delete(`/workers/invites/${inviteId}`);
}

export async function revokeWorker(membershipId: string): Promise<void> {
  await api.delete(`/workers/${membershipId}`);
}
