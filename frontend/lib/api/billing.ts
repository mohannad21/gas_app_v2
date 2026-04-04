import { fromMinorUnits } from "@/lib/money";
import { PlanBillingStatus, PlanBillingStatusSchema } from "@/types/billing";

import { api, parse } from "./client";

export async function getPlanBillingStatus(): Promise<PlanBillingStatus> {
  const { data } = await api.get("/tenant/billing/status");
  const parsed = parse(PlanBillingStatusSchema, data);
  return {
    ...parsed,
    outstanding_balance: fromMinorUnits(parsed.outstanding_balance),
    recent_events: parsed.recent_events.map((event) => ({
      ...event,
      amount: fromMinorUnits(event.amount),
    })),
  };
}
