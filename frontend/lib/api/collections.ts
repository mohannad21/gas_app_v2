import { fromMinorUnits, toMinorUnits } from "@/lib/money";
import {
  CollectionCreateInput,
  CollectionUpdateInput,
  CollectionEvent,
  CollectionEventSchema,
} from "@/types/domain";

import { api, parse, parseArray } from "./client";

export async function createCollection(payload: CollectionCreateInput): Promise<any> {
  const { data } = await api.post("/collections", {
    ...payload,
    happened_at: payload.effective_at,
    amount_money: payload.amount_money != null ? toMinorUnits(payload.amount_money) : payload.amount_money,
    debt_cash: payload.debt_cash != null ? toMinorUnits(payload.debt_cash) : payload.debt_cash,
  });
  const parsed = CollectionEventSchema.parse(data);
  return {
    ...parsed,
    amount_money: parsed.amount_money != null ? fromMinorUnits(parsed.amount_money) : parsed.amount_money,
    debt_cash: parsed.debt_cash != null ? fromMinorUnits(parsed.debt_cash) : parsed.debt_cash,
    live_debt_cash: parsed.live_debt_cash != null ? fromMinorUnits(parsed.live_debt_cash) : parsed.live_debt_cash,
  };
}

export async function listCollections(includeDeleted?: boolean): Promise<CollectionEvent[]> {
  const { data } = await api.get("/collections", { params: { limit: 50, include_deleted: includeDeleted ?? false } });
  return parseArray(CollectionEventSchema, data).map((ev) => ({
    ...ev,
    amount_money: ev.amount_money != null ? fromMinorUnits(ev.amount_money) : ev.amount_money,
    debt_cash: ev.debt_cash != null ? fromMinorUnits(ev.debt_cash) : ev.debt_cash,
    live_debt_cash: ev.live_debt_cash != null ? fromMinorUnits(ev.live_debt_cash) : ev.live_debt_cash,
  }));
}

export async function updateCollection(id: string, payload: CollectionUpdateInput): Promise<CollectionEvent> {
  const { data } = await api.put(`/collections/${id}`, {
    ...payload,
    happened_at: payload.effective_at,
    amount_money: payload.amount_money != null ? toMinorUnits(payload.amount_money) : payload.amount_money,
    debt_cash: payload.debt_cash != null ? toMinorUnits(payload.debt_cash) : payload.debt_cash,
  });
  const parsed = parse(CollectionEventSchema, data);
  return {
    ...parsed,
    amount_money: parsed.amount_money != null ? fromMinorUnits(parsed.amount_money) : parsed.amount_money,
    debt_cash: parsed.debt_cash != null ? fromMinorUnits(parsed.debt_cash) : parsed.debt_cash,
    live_debt_cash: parsed.live_debt_cash != null ? fromMinorUnits(parsed.live_debt_cash) : parsed.live_debt_cash,
  };
}

export async function deleteCollection(id: string): Promise<void> {
  await api.delete(`/collections/${id}`);
}
