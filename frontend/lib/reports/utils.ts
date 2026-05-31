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

export function getInitInventoryAfter(events: any[]) {
  const out: { full12?: number; empty12?: number; full48?: number; empty48?: number } = {};
  events.forEach((ev) => {
    if (String(ev?.event_type ?? ev?.type ?? ev?.source_type) !== "init") return;
    const after = ev?.inventory_after ?? {};
    if (after.full12 != null) out.full12 = after.full12;
    if (after.empty12 != null) out.empty12 = after.empty12;
    if (after.full48 != null) out.full48 = after.full48;
    if (after.empty48 != null) out.empty48 = after.empty48;
  });
  return Object.keys(out).length ? out : null;
}
