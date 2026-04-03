import { fromMinorUnits, toMinorUnits } from "@/lib/money";
import { buildActivityHappenedAt } from "@/lib/date";
import {
  InventoryAdjustment,
  InventoryAdjustmentSchema,
  InventoryAdjustmentUpdate,
  CashAdjustment,
  CashAdjustmentCreate,
  CashAdjustmentSchema,
  CashAdjustmentUpdate,
} from "@/types/domain";

import { api, parse, parseArray } from "./client";

export async function listInventoryAdjustments(
  date?: string,
  includeDeleted?: boolean
): Promise<InventoryAdjustment[]> {
  const { data } = await api.get("/inventory/adjustments", {
    params: { date, include_deleted: includeDeleted ?? false, limit: 50 },
  });
  return parseArray(InventoryAdjustmentSchema, data);
}

export async function updateInventoryAdjustment(
  deltaId: string,
  payload: InventoryAdjustmentUpdate
): Promise<InventoryAdjustment> {
  const { data } = await api.put(`/inventory/adjust/${deltaId}`, payload);
  return parse(InventoryAdjustmentSchema, data);
}

export async function deleteInventoryAdjustment(deltaId: string): Promise<void> {
  await api.delete(`/inventory/adjust/${deltaId}`);
}

// Cash adjustments
export async function listCashAdjustments(
  date?: string,
  includeDeleted?: boolean
): Promise<CashAdjustment[]> {
  const { data } = await api.get("/cash/adjustments", {
    params: { date, include_deleted: includeDeleted ?? false, limit: 50 },
  });
  return parseArray(CashAdjustmentSchema, data).map((c) => ({
    ...c,
    delta_cash: fromMinorUnits(c.delta_cash),
  }));
}

export async function createCashAdjustment(payload: CashAdjustmentCreate): Promise<CashAdjustment> {
  const happened_at =
    payload.happened_at ?? buildActivityHappenedAt({ date: payload.date, time: payload.time });
  const { data } = await api.post("/cash/adjust", {
    ...payload,
    delta_cash: toMinorUnits(payload.delta_cash),
    happened_at,
  });
  const parsed = parse(CashAdjustmentSchema, data);
  return { ...parsed, delta_cash: fromMinorUnits(parsed.delta_cash) };
}

export async function updateCashAdjustment(
  deltaId: string,
  payload: CashAdjustmentUpdate
): Promise<CashAdjustment> {
  const { data } = await api.put(`/cash/adjust/${deltaId}`, {
    ...payload,
    delta_cash: payload.delta_cash != null ? toMinorUnits(payload.delta_cash) : payload.delta_cash,
  });
  const parsed = parse(CashAdjustmentSchema, data);
  return { ...parsed, delta_cash: fromMinorUnits(parsed.delta_cash) };
}

export async function deleteCashAdjustment(deltaId: string): Promise<void> {
  await api.delete(`/cash/adjust/${deltaId}`);
}
