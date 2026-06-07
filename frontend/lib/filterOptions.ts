import {
  ACTIVITY_KIND_META,
  ACTIVITY_SUBFILTER_META,
  FILTER_GROUP_LABELS,
  getActivityKindsForFilterGroup,
  type ActivityFilterGroup,
} from "@/lib/activityKindMeta";
import type { ActivityKind } from "@/lib/activityKinds";

export type SubFilterOption = {
  id: string;
  label: string;
};

export type KindOption = {
  id: ActivityKind;
  label: string;
  subFilters: SubFilterOption[];
};

export type GroupOption = {
  id: ActivityFilterGroup;
  label: string;
  kinds: KindOption[];
};

export type FilterAliasTab = "customer" | "company";

const GROUP_ORDER: ActivityFilterGroup[] = ["customer", "company", "expenses", "ledger"];

const FILTER_ID_TO_KIND: Record<string, ActivityKind> = {
  late_payment: "payment_from_customer",
  payout: "payment_to_customer",
  return_empties: "customer_return_empties",
  buy_empty: "buy_empty_from_customer",
  buy_full: "buy_full_from_company",
  company_return: "dist_return_empties",
  inventory_adjustment: "adjust_inventory",
};

const ADJUSTMENT_KIND: Record<FilterAliasTab, ActivityKind> = {
  customer: "adjust_customer_balance",
  company: "adjust_company_balance",
};

function isActivityKind(value: string): value is ActivityKind {
  return value in ACTIVITY_KIND_META;
}

export function resolveFilterKind(filterId: string, tab?: FilterAliasTab): ActivityKind | null {
  if (filterId === "adjustment" && tab) {
    return ADJUSTMENT_KIND[tab];
  }
  if (isActivityKind(filterId)) {
    return filterId;
  }
  return FILTER_ID_TO_KIND[filterId] ?? null;
}

export function resolveFilterLabel(filterId: string, tab?: FilterAliasTab): string {
  const kind = resolveFilterKind(filterId, tab);
  return kind ? ACTIVITY_KIND_META[kind].label : filterId;
}

const kind = (id: ActivityKind): KindOption => ({
  id,
  label: ACTIVITY_KIND_META[id].label,
  subFilters: ACTIVITY_KIND_META[id].subFilters.map((subFilterId) => ({
    id: subFilterId,
    label: ACTIVITY_SUBFILTER_META[subFilterId].label,
  })),
});

export const FILTER_HIERARCHY: GroupOption[] = GROUP_ORDER.map((groupId) => ({
  id: groupId,
  label: FILTER_GROUP_LABELS[groupId],
  kinds: getActivityKindsForFilterGroup(groupId, "addEntry").map(kind),
}));

export function getGroupOptions(): GroupOption[] {
  return FILTER_HIERARCHY;
}

export function getKindOptions(groupId: string): KindOption[] {
  return FILTER_HIERARCHY.find((group) => group.id === groupId)?.kinds ?? [];
}

export function getSubFilterOptions(groupId: string, kindId: string): SubFilterOption[] {
  return getKindOptions(groupId).find((option) => option.id === kindId)?.subFilters ?? [];
}
