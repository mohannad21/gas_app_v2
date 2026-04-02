import { fromMinorUnits, toMinorUnits } from "@/lib/money";
import {
  Order,
  OrderCreateInput,
  OrderSchema,
  OrderUpdateInput,
  OrderImpact,
  OrderImpactSchema,
  WhatsappLink,
  WhatsappLinkSchema,
} from "@/types/domain";

import { api, parse, parseArray } from "./client";

export async function listOrders(includeDeleted?: boolean): Promise<Order[]> {
  const { data } = await api.get("/orders", { params: { limit: 50, include_deleted: includeDeleted ?? false } });
  return parseArray(OrderSchema, data).map((o) => ({
    ...o,
    price_total: fromMinorUnits(o.price_total),
    paid_amount: fromMinorUnits(o.paid_amount ?? 0),
    debt_cash: o.debt_cash != null ? fromMinorUnits(o.debt_cash) : o.debt_cash,
    applied_credit: o.applied_credit != null ? fromMinorUnits(o.applied_credit) : o.applied_credit,
    money_balance_before: o.money_balance_before != null ? fromMinorUnits(o.money_balance_before) : o.money_balance_before,
    money_balance_after: o.money_balance_after != null ? fromMinorUnits(o.money_balance_after) : o.money_balance_after,
  }));
}

export async function createOrder(payload: OrderCreateInput): Promise<Order> {
  const { data } = await api.post("/orders", {
    ...payload,
    happened_at: payload.delivered_at,
    price_total: toMinorUnits(payload.price_total),
    paid_amount: toMinorUnits(payload.paid_amount ?? 0),
    debt_cash: payload.debt_cash != null ? toMinorUnits(payload.debt_cash) : payload.debt_cash,
  });
  const parsed = parse(OrderSchema, data);
  return {
    ...parsed,
    price_total: fromMinorUnits(parsed.price_total),
    paid_amount: fromMinorUnits(parsed.paid_amount ?? 0),
    debt_cash: parsed.debt_cash != null ? fromMinorUnits(parsed.debt_cash) : parsed.debt_cash,
    applied_credit: parsed.applied_credit != null ? fromMinorUnits(parsed.applied_credit) : parsed.applied_credit,
    money_balance_before:
      parsed.money_balance_before != null ? fromMinorUnits(parsed.money_balance_before) : parsed.money_balance_before,
    money_balance_after:
      parsed.money_balance_after != null ? fromMinorUnits(parsed.money_balance_after) : parsed.money_balance_after,
  };
}

export async function updateOrder(id: string, payload: OrderUpdateInput): Promise<Order> {
  const { data } = await api.put(`/orders/${id}`, {
    ...payload,
    happened_at: payload.delivered_at,
    price_total: payload.price_total != null ? toMinorUnits(payload.price_total) : payload.price_total,
    paid_amount: payload.paid_amount != null ? toMinorUnits(payload.paid_amount) : payload.paid_amount,
    debt_cash: payload.debt_cash != null ? toMinorUnits(payload.debt_cash) : payload.debt_cash,
  });
  const parsed = parse(OrderSchema, data);
  return {
    ...parsed,
    price_total: fromMinorUnits(parsed.price_total),
    paid_amount: fromMinorUnits(parsed.paid_amount ?? 0),
    debt_cash: parsed.debt_cash != null ? fromMinorUnits(parsed.debt_cash) : parsed.debt_cash,
    applied_credit: parsed.applied_credit != null ? fromMinorUnits(parsed.applied_credit) : parsed.applied_credit,
    money_balance_before:
      parsed.money_balance_before != null ? fromMinorUnits(parsed.money_balance_before) : parsed.money_balance_before,
    money_balance_after:
      parsed.money_balance_after != null ? fromMinorUnits(parsed.money_balance_after) : parsed.money_balance_after,
  };
}

export async function deleteOrder(id: string): Promise<void> {
  await api.delete(`/orders/${id}`);
}

export async function validateOrderImpact(params: {
  customer_id: string;
  system_id: string;
  order_mode?: "replacement" | "buy_iron" | "sell_iron";
  gas_type: "12kg" | "48kg";
  cylinders_installed: number;
  cylinders_received: number;
  price_total: number;
  paid_amount: number;
  delivered_at?: string;
}): Promise<OrderImpact> {
  const { data } = await api.get("/orders/validate_order_impact", {
    params: {
      ...params,
      order_mode: params.order_mode ?? "replacement",
      happened_at: params.delivered_at,
      price_total: toMinorUnits(params.price_total),
      paid_amount: toMinorUnits(params.paid_amount),
    },
  });
  const parsed = parse(OrderImpactSchema, data);
  return {
    ...parsed,
    gross_paid: fromMinorUnits(parsed.gross_paid),
    applied_credit: fromMinorUnits(parsed.applied_credit),
    unpaid: fromMinorUnits(parsed.unpaid),
    new_balance: fromMinorUnits(parsed.new_balance),
  };
}

export async function getOrderWhatsappLink(orderId: string): Promise<WhatsappLink> {
  const { data } = await api.get(`/orders/whatsapp_link/${orderId}`);
  return parse(WhatsappLinkSchema, data);
}
