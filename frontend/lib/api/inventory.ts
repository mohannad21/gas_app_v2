import { fromMinorUnits, toMinorUnits } from "@/lib/money";
import { buildActivityHappenedAt } from "@/lib/date";
import {
  InventorySnapshot,
  InventorySnapshotSchema,
  InventoryRefillSummary,
  InventoryRefillSummarySchema,
  InventoryRefillDetails,
  InventoryRefillDetailsSchema,
} from "@/types/domain";

import { api, parse, parseArray } from "./client";

// Inventory
export async function getInventoryLatest(): Promise<InventorySnapshot | null> {
  try {
    const { data } = await api.get("/inventory/latest");
    if (!data) return null;
    return parse(InventorySnapshotSchema, data);
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

export async function initInventory(payload: {
  date?: string;
  full12: number;
  empty12: number;
  full48: number;
  empty48: number;
  reason?: string;
}): Promise<InventorySnapshot> {
  const { data } = await api.post("/inventory/init", payload);
  return parse(InventorySnapshotSchema, data);
}

export async function createInventoryRefill(payload: {
  date: string;
  time?: string;
  effective_at?: string;
  time_of_day?: "morning" | "evening";
  buy12: number;
  return12: number;
  buy48: number;
  return48: number;
  total_cost?: number;
  paid_now?: number;
  debt_cash?: number;
  debt_cylinders_12?: number;
  debt_cylinders_48?: number;
  reason?: string;
  notes?: string;
}): Promise<InventorySnapshot> {
  const happened_at =
    payload.effective_at ?? buildActivityHappenedAt({ date: payload.date, time: payload.time });
  const { data } = await api.post("/inventory/refill", {
    happened_at,
    buy12: payload.buy12,
    return12: payload.return12,
    buy48: payload.buy48,
    return48: payload.return48,
    total_cost: toMinorUnits(payload.total_cost ?? 0),
    paid_now: toMinorUnits(payload.paid_now ?? 0),
    debt_cash: payload.debt_cash != null ? toMinorUnits(payload.debt_cash) : payload.debt_cash,
    debt_cylinders_12: payload.debt_cylinders_12,
    debt_cylinders_48: payload.debt_cylinders_48,
    note: payload.notes ?? payload.reason,
  });
  return parse(InventorySnapshotSchema, data);
}

export async function listInventoryRefills(includeDeleted?: boolean): Promise<InventoryRefillSummary[]> {
  const { data } = await api.get("/inventory/refills", {
    params: { include_deleted: includeDeleted ?? false, limit: 50 },
  });
  return parseArray(InventoryRefillSummarySchema, data).map((row) => ({
    ...row,
    debt_cash: row.debt_cash != null ? fromMinorUnits(row.debt_cash) : row.debt_cash,
  }));
}

export async function getInventorySnapshot(payload: {
  date?: string;
  time?: string;
  time_of_day?: "morning" | "evening";
  at?: string;
}): Promise<InventorySnapshot | null> {
  const { data } = await api.get("/inventory/snapshot", { params: payload });
  if (!data) return null;
  return parse(InventorySnapshotSchema, data);
}

export async function getInventoryRefillDetails(refillId: string): Promise<InventoryRefillDetails> {
  const { data } = await api.get(`/inventory/refills/${refillId}`);
  const parsed = parse(InventoryRefillDetailsSchema, data);
  return {
    ...parsed,
    total_cost: fromMinorUnits(parsed.total_cost),
    paid_now: fromMinorUnits(parsed.paid_now),
    debt_cash: parsed.debt_cash != null ? fromMinorUnits(parsed.debt_cash) : parsed.debt_cash,
  };
}

export async function updateInventoryRefill(
  refillId: string,
  payload: {
    buy12: number;
    return12: number;
    buy48: number;
    return48: number;
    reason?: string;
    notes?: string;
    allow_negative?: boolean;
    total_cost?: number;
    paid_now?: number;
    debt_cash?: number;
    debt_cylinders_12?: number;
    debt_cylinders_48?: number;
  }
): Promise<InventoryRefillDetails> {
  const body: Record<string, unknown> = {
    buy12: payload.buy12,
    return12: payload.return12,
    buy48: payload.buy48,
    return48: payload.return48,
    total_cost: toMinorUnits(payload.total_cost ?? 0),
    paid_now: toMinorUnits(payload.paid_now ?? 0),
    note: payload.notes ?? payload.reason,
  };
  if (payload.debt_cash != null) {
    body.debt_cash = toMinorUnits(payload.debt_cash);
  }
  if (payload.debt_cylinders_12 != null) {
    body.debt_cylinders_12 = payload.debt_cylinders_12;
  }
  if (payload.debt_cylinders_48 != null) {
    body.debt_cylinders_48 = payload.debt_cylinders_48;
  }
  const { data } = await api.put(`/inventory/refills/${refillId}`, body);
  const parsed = parse(InventoryRefillDetailsSchema, data);
  return {
    ...parsed,
    total_cost: fromMinorUnits(parsed.total_cost),
    paid_now: fromMinorUnits(parsed.paid_now),
    debt_cash: parsed.debt_cash != null ? fromMinorUnits(parsed.debt_cash) : parsed.debt_cash,
  };
}

export async function deleteInventoryRefill(refillId: string): Promise<void> {
  await api.delete(`/inventory/refills/${refillId}`);
}

export async function createInventoryAdjust(payload: {
  date?: string;
  time?: string;
  gas_type: "12kg" | "48kg";
  delta_full: number;
  delta_empty: number;
  reason?: string;
  note?: string;
  group_id?: string;
}): Promise<InventorySnapshot> {
  const happened_at = buildActivityHappenedAt({ date: payload.date, time: payload.time });
  const { data } = await api.post("/inventory/adjust", {
    happened_at,
    gas_type: payload.gas_type,
    delta_full: payload.delta_full,
    delta_empty: payload.delta_empty,
    reason: payload.reason,
    note: payload.note,
    group_id: payload.group_id,
  });
  return parse(InventorySnapshotSchema, data);
}
