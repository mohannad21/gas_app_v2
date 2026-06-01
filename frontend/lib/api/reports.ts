import { fromMinorUnits } from "@/lib/money";
import {
  DailyReportCard,
  DailyReportCardSchema,
  DailyReportDay,
  DailyReportDaySchema,
} from "@/types/domain";

import { api, parse, parseArray, mapBalanceTransitionAmounts } from "./client";

// Daily reports
export async function listDailyReports(params: { from: string; to: string }): Promise<DailyReportCard[]> {
  const { data } = await api.get("/reports/daily", { params });
  return parseArray(DailyReportCardSchema, data).map((row) => ({
    ...row,
    wallet_end: fromMinorUnits(row.wallet_end),
    net_today: fromMinorUnits(row.net_today),
    wallet_math: {
      ...row.wallet_math,
      sales: fromMinorUnits(row.wallet_math.sales),
      late: fromMinorUnits(row.wallet_math.late),
      expenses: fromMinorUnits(row.wallet_math.expenses),
      company: fromMinorUnits(row.wallet_math.company),
      adjust: fromMinorUnits(row.wallet_math.adjust),
      other: row.wallet_math.other != null ? fromMinorUnits(row.wallet_math.other) : row.wallet_math.other,
    },
    company_start: row.company_start != null ? fromMinorUnits(row.company_start) : row.company_start,
    company_end: row.company_end != null ? fromMinorUnits(row.company_end) : row.company_end,
    problem_transitions: mapBalanceTransitionAmounts(row.problem_transitions) ?? row.problem_transitions,
  }));
}

export async function getDailyReport(date: string): Promise<DailyReportDay> {
  const { data } = await api.get("/reports/day", { params: { date } });
  const parsed = parse(DailyReportDaySchema, data);
  return {
    ...parsed,
    wallet_end: fromMinorUnits(parsed.wallet_end),
    company_start: parsed.company_start != null ? fromMinorUnits(parsed.company_start) : parsed.company_start,
    company_end: parsed.company_end != null ? fromMinorUnits(parsed.company_end) : parsed.company_end,
    audit_summary: {
      ...parsed.audit_summary,
      wallet_in: fromMinorUnits(parsed.audit_summary.wallet_in),
      new_debt: fromMinorUnits(parsed.audit_summary.new_debt),
    },
    events: parsed.events.map((ev) => ({
      ...ev,
      wallet_before: ev.wallet_before != null ? fromMinorUnits(ev.wallet_before) : ev.wallet_before,
      wallet_after: ev.wallet_after != null ? fromMinorUnits(ev.wallet_after) : ev.wallet_after,
      company_before: ev.company_before != null ? fromMinorUnits(ev.company_before) : ev.company_before,
      company_after: ev.company_after != null ? fromMinorUnits(ev.company_after) : ev.company_after,
      customer_money_before: ev.customer_money_before != null ? fromMinorUnits(ev.customer_money_before) : ev.customer_money_before,
      customer_money_after: ev.customer_money_after != null ? fromMinorUnits(ev.customer_money_after) : ev.customer_money_after,
      total_cost: ev.total_cost != null ? fromMinorUnits(ev.total_cost) : ev.total_cost,
      paid_amount: ev.paid_amount != null ? fromMinorUnits(ev.paid_amount) : ev.paid_amount,
      order_total: ev.order_total != null ? fromMinorUnits(ev.order_total) : ev.order_total,
      order_paid: ev.order_paid != null ? fromMinorUnits(ev.order_paid) : ev.order_paid,
      money: ev.money
        ? {
            ...ev.money,
            amount: fromMinorUnits(ev.money.amount),
          }
        : ev.money,
      money_amount: ev.money_amount != null ? fromMinorUnits(ev.money_amount) : ev.money_amount,
      // The backend already sends event.money_delta in major units.
      money_delta: ev.money_delta,
      money_received: ev.money_received != null ? fromMinorUnits(ev.money_received) : ev.money_received,
      notes: Array.isArray(ev.notes)
        ? ev.notes.map((note) =>
            note?.kind === "money"
              ? {
                  ...note,
                  remaining_after: fromMinorUnits(note.remaining_after),
                  remaining_before:
                    note.remaining_before != null ? fromMinorUnits(note.remaining_before) : note.remaining_before,
                }
              : note
          )
        : ev.notes,
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
