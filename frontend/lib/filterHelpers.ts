import { resolveFilterLabel as resolveRegistryFilterLabel } from "@/lib/filterOptions";

type FilterTab = "customer" | "company";

export function resolveFilterLabel(filterId: string, tab?: FilterTab): string {
  return resolveRegistryFilterLabel(filterId, tab);
}

export function isCustomerTabFiltered(state: {
  customerActivityFilter?: string | null;
  customerActivityLevel2?: string | null;
  customerActivityLevel3?: string | null;
  selectedGroup?: string | null;
  selectedKind?: string | null;
  selectedSubFilter?: string | null;
  searchText?: string | null;
}): boolean {
  return !!(
    state.customerActivityFilter ||
    state.customerActivityLevel2 ||
    state.customerActivityLevel3 ||
    state.selectedGroup ||
    state.selectedKind ||
    state.selectedSubFilter
  );
}

export function isCompanyTabFiltered(state: {
  companyActivityFilter?: string | null;
  companyActivityLevel2?: string | null;
  selectedGroup?: string | null;
  selectedKind?: string | null;
  searchText?: string | null;
}): boolean {
  return !!(
    state.companyActivityFilter ||
    state.companyActivityLevel2 ||
    state.selectedGroup ||
    state.selectedKind
  );
}

export function isMoneyTabFiltered(state: {
  expensePrimaryFilter?: string | null;
  expenseCategoryFilter?: string | null;
  selectedKind?: string | null;
  selectedCategory?: string | null;
  searchText?: string | null;
}): boolean {
  return !!(
    state.expensePrimaryFilter ||
    state.expenseCategoryFilter ||
    state.selectedKind ||
    state.selectedCategory
  );
}

export function isLedgerTabFiltered(state: {
  ledgerActivityFilter?: string | null;
  selectedKind?: string | null;
  searchText?: string | null;
}): boolean {
  return !!(state.ledgerActivityFilter || state.selectedKind);
}

export function isCustomerReviewFiltered(state: {
  selectedFilter?: string | null;
  selectedLevel2?: string | null;
  selectedLevel3?: string | null;
  selectedKind?: string | null;
  selectedSubFilter?: string | null;
  searchText?: string | null;
}): boolean {
  return !!(
    state.selectedFilter ||
    state.selectedLevel2 ||
    state.selectedLevel3 ||
    state.selectedKind ||
    state.selectedSubFilter
  );
}

export type ActivityFilterState = {
  groupId: string | null;
  kindId: string | null;
  subFilterId: string | null;
};

export function activityMatchesFilter(
  activity: { filterGroup: string; kind: string; subFilterId?: string | null },
  filter: ActivityFilterState
): boolean {
  if (!filter.groupId && !filter.kindId && !filter.subFilterId) return true;
  if (filter.groupId && activity.filterGroup !== filter.groupId) return false;
  if (filter.kindId && activity.kind !== filter.kindId) return false;
  if (filter.subFilterId && activity.subFilterId !== filter.subFilterId) return false;
  return true;
}
