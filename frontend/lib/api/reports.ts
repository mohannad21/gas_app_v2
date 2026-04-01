import { fromMinorUnits } from "@/lib/money";
import {
  DailyReportV2Card,
  DailyReportV2CardSchema,
  DailyReportV2Day,
  DailyReportV2DaySchema,
} from "@/types/domain";

import { api, parse, parseArray, mapBalanceTransitionAmounts } from "./client";

// Daily reports
export async function listDailyReportsV2(params: { from: string; to: string }): Promise<DailyReportV2Card[]> {
  const { data } = await api.get("/reports/daily_v2", { params });
  return parseArray(DailyReportV2CardSchema, data).map((row) => ({
    ...row,
    cash_start: fromMinorUnits(row.cash_start),
    cash_end: fromMinorUnits(row.cash_end),
    net_today: fromMinorUnits(row.net_today),
    cash_math: {
      ...row.cash_math,
      sales: fromMinorUnits(row.cash_math.sales),
      late: fromMinorUnits(row.cash_math.late),
      expenses: fromMinorUnits(row.cash_math.expenses),
      company: fromMinorUnits(row.cash_math.company),
      adjust: fromMinorUnits(row.cash_math.adjust),
      other: row.cash_math.other != null ? fromMinorUnits(row.cash_math.other) : row.cash_math.other,
    },
    company_start: row.company_start != null ? fromMinorUnits(row.company_start) : row.company_start,
    company_end: row.company_end != null ? fromMinorUnits(row.company_end) : row.company_end,
    company_give_start: row.company_give_start != null ? fromMinorUnits(row.company_give_start) : row.company_give_start,
    company_give_end: row.company_give_end != null ? fromMinorUnits(row.company_give_end) : row.company_give_end,
    company_receive_start: row.company_receive_start != null ? fromMinorUnits(row.company_receive_start) : row.company_receive_start,
    company_receive_end: row.company_receive_end != null ? fromMinorUnits(row.company_receive_end) : row.company_receive_end,
    problem_transitions: mapBalanceTransitionAmounts(row.problem_transitions) ?? row.problem_transitions,
  }));
}

export async function getDailyReportV2(date: string): Promise<DailyReportV2Day> {
  const { data } = await api.get("/reports/day_v2", { params: { date } });
  const parsed = parse(DailyReportV2DaySchema, data);
  return {
    ...parsed,
    cash_start: fromMinorUnits(parsed.cash_start),
    cash_end: fromMinorUnits(parsed.cash_end),
    company_start: parsed.company_start != null ? fromMinorUnits(parsed.company_start) : parsed.company_start,
    company_end: parsed.company_end != null ? fromMinorUnits(parsed.company_end) : parsed.company_end,
    company_give_start: parsed.company_give_start != null ? fromMinorUnits(parsed.company_give_start) : parsed.company_give_start,
    company_give_end: parsed.company_give_end != null ? fromMinorUnits(parsed.company_give_end) : parsed.company_give_end,
    company_receive_start: parsed.company_receive_start != null ? fromMinorUnits(parsed.company_receive_start) : parsed.company_receive_start,
    company_receive_end: parsed.company_receive_end != null ? fromMinorUnits(parsed.company_receive_end) : parsed.company_receive_end,
    audit_summary: {
      ...parsed.audit_summary,
      cash_in: fromMinorUnits(parsed.audit_summary.cash_in),
      new_debt: fromMinorUnits(parsed.audit_summary.new_debt),
    },
    events: parsed.events.map((ev) => ({
      ...ev,
      cash_before: ev.cash_before != null ? fromMinorUnits(ev.cash_before) : ev.cash_before,
      cash_after: ev.cash_after != null ? fromMinorUnits(ev.cash_after) : ev.cash_after,
      company_before: ev.company_before != null ? fromMinorUnits(ev.company_before) : ev.company_before,
      company_after: ev.company_after != null ? fromMinorUnits(ev.company_after) : ev.company_after,
      customer_money_before: ev.customer_money_before != null ? fromMinorUnits(ev.customer_money_before) : ev.customer_money_before,
      customer_money_after: ev.customer_money_after != null ? fromMinorUnits(ev.customer_money_after) : ev.customer_money_after,
      total_cost: ev.total_cost != null ? fromMinorUnits(ev.total_cost) : ev.total_cost,
      paid_now: ev.paid_now != null ? fromMinorUnits(ev.paid_now) : ev.paid_now,
      order_total: ev.order_total != null ? fromMinorUnits(ev.order_total) : ev.order_total,
      order_paid: ev.order_paid != null ? fromMinorUnits(ev.order_paid) : ev.order_paid,
      money: ev.money
        ? {
            ...ev.money,
            amount: fromMinorUnits(ev.money.amount),
          }
        : ev.money,
      money_amount: ev.money_amount != null ? fromMinorUnits(ev.money_amount) : ev.money_amount,
      money_delta: ev.money_delta != null ? ev.money_delta : ev.money_delta,
      money_received: ev.money_received != null ? fromMinorUnits(ev.money_received) : ev.money_received,
      open_actions: Array.isArray(ev.open_actions)
        ? ev.open_actions.map((action) =>
            action?.category === "money" && action.amount != null
              ? { ...action, amount: fromMinorUnits(action.amount) }
              : action
          )
        : ev.open_actions,
      remaining_actions: Array.isArray(ev.remaining_actions)
        ? ev.remaining_actions.map((action) =>
            action?.category === "money" && action.amount != null
              ? { ...action, amount: fromMinorUnits(action.amount) }
              : action
          )
        : ev.remaining_actions,
      action_pills: Array.isArray(ev.action_pills)
        ? ev.action_pills.map((action) =>
            action?.category === "money" && action.amount != null
              ? { ...action, amount: fromMinorUnits(action.amount) }
              : action
          )
        : ev.action_pills,
      balance_transitions: mapBalanceTransitionAmounts(ev.balance_transitions) ?? ev.balance_transitions,
    })),
  };
}
