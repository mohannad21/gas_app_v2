import { z } from "zod";

export const WorkerMemberSchema = z.object({
  membership_id: z.string(),
  user_id: z.string(),
  phone: z.string().nullable(),
  role_name: z.string(),
  joined_at: z.string(),
});

export const PendingInviteSchema = z.object({
  invite_id: z.string(),
  phone: z.string(),
  role_name: z.string(),
  created_at: z.string(),
  expires_at: z.string(),
});

export const WorkerInviteInputSchema = z.object({
  phone: z.string().min(1),
  role_id: z.string().min(1),
});

export const WorkerInviteResultSchema = z.object({
  invite_id: z.string(),
  phone: z.string(),
  role_name: z.string(),
  expires_at: z.string(),
  activation_code: z.string().optional(),
});

export type WorkerMember = z.infer<typeof WorkerMemberSchema>;
export type PendingInvite = z.infer<typeof PendingInviteSchema>;
export type WorkerInviteInput = z.infer<typeof WorkerInviteInputSchema>;
export type WorkerInviteResult = z.infer<typeof WorkerInviteResultSchema>;
