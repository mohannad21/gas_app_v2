import {
  System,
  SystemCreateInput,
  SystemSchema,
  SystemTypeOption,
  SystemTypeOptionSchema,
  SystemUpdateInput,
} from "@/types/domain";

import { api, parse, parseArray } from "./client";

export async function listSystems(customerId?: string): Promise<System[]> {
  const { data } = await api.get("/systems", {
    params: customerId ? { customerId } : undefined,
  });
  return parseArray(SystemSchema, data);
}

export async function createSystem(payload: SystemCreateInput): Promise<System> {
  const { data } = await api.post("/systems", payload);
  return parse(SystemSchema, data);
}

export async function updateSystem(id: string, payload: SystemUpdateInput): Promise<System> {
  const { data } = await api.put(`/systems/${id}`, payload);
  return parse(SystemSchema, data);
}

export async function deleteSystem(id: string): Promise<void> {
  await api.delete(`/systems/${id}`);
}

// System types
export async function listSystemTypes(): Promise<SystemTypeOption[]> {
  const { data } = await api.get("/system/types");
  return parseArray(SystemTypeOptionSchema, data);
}

export async function createSystemType(name: string): Promise<SystemTypeOption> {
  const { data } = await api.post("/system/types", { name });
  return parse(SystemTypeOptionSchema, data);
}

export async function updateSystemType(
  id: string,
  payload: Partial<Pick<SystemTypeOption, "name" | "is_active">>
): Promise<SystemTypeOption> {
  const { data } = await api.put(`/system/types/${id}`, payload);
  return parse(SystemTypeOptionSchema, data);
}
