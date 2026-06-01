import { ACTIVITY_KIND_META, normalizeEventType } from "../activityKindMeta";

export function formatEventType(type: string, orderMode?: string | null, direction?: string | null): string {
  const kind = normalizeEventType(type, {
    order_mode: orderMode ?? undefined,
    money_direction: direction ?? undefined,
  });
  if (kind) return ACTIVITY_KIND_META[kind].label;
  return type
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
