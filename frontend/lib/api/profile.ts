import { z } from "zod";

import { api, parse } from "./client";

export const TenantProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  business_name: z.string().nullable(),
  owner_name: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
});

export type TenantProfile = z.infer<typeof TenantProfileSchema>;

export async function getProfile(): Promise<TenantProfile> {
  const { data } = await api.get("/profile");
  return parse(TenantProfileSchema, data);
}

export async function updateProfile(payload: Partial<Omit<TenantProfile, "id" | "name">>): Promise<TenantProfile> {
  const { data } = await api.patch("/profile", payload);
  return parse(TenantProfileSchema, data);
}
