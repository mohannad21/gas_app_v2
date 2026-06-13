import { AppColors } from "@/constants/colors";

import { ACTIVITY_KIND_META, normalizeEventType } from "../activityKindMeta";

export function getEventColor(
  eventType: string,
  ctx: { order_mode?: string; money_direction?: string } = {}
): string {
  const kind = normalizeEventType(eventType, ctx);
  if (kind) return ACTIVITY_KIND_META[kind].color;
  return AppColors.scope.ledger;
}
