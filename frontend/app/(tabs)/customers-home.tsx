import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import FilterChipRow from "@/components/add/FilterChipRow";
import NewSectionSearch from "@/components/add/NewSectionSearch";
import { useCustomers } from "@/hooks/useCustomers";
import { useSystems } from "@/hooks/useSystems";
import {
  customerTopFilterOptions,
  CustomerListSubFilter,
  CustomerListTopFilter,
  getCustomerSubFilterOptions,
} from "@/components/customers/customerListFilters";
import { AddCustomerEntryAction, AddCustomersSection } from "./add/index";

export default function CustomersHomeScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const [topFilter, setTopFilter] = useState<CustomerListTopFilter | null>(null);
  const [subFilter, setSubFilter] = useState<CustomerListSubFilter | null>(null);
  const customersQuery = useCustomers();
  const systemsQuery = useSystems();
  const deferredSearch = searchQuery.trim().toLowerCase();
  const systemsByCustomer = useMemo(() => {
    const map = new Map<string, typeof systemsQuery.data>();
    (systemsQuery.data ?? []).forEach((system) => {
      const list = map.get(system.customer_id) ?? [];
      map.set(system.customer_id, [...list, system]);
    });
    return map;
  }, [systemsQuery.data]);
  const searchScopedCustomers = useMemo(() => {
    return (customersQuery.data ?? []).filter((customer) => {
      if (!deferredSearch) return true;
      const haystack = [customer.name, customer.phone, customer.note, customer.address]
        .map((value) => (value ?? "").toLowerCase())
        .join("\n");
      return haystack.includes(deferredSearch);
    });
  }, [customersQuery.data, deferredSearch]);
  const topLevelOptions = useMemo(() => {
    const visible = new Set<CustomerListTopFilter>();
    for (const customer of searchScopedCustomers) {
      const money = Number(customer.money_balance ?? 0);
      const cyl12 = Number(customer.cylinder_balance_12kg ?? 0);
      const cyl48 = Number(customer.cylinder_balance_48kg ?? 0);
      const systems = systemsByCustomer.get(customer.id) ?? [];
      const hasActive = systems.some((system) => system.is_active !== false);
      const requiresCheck = systems.some((system) => system.requires_security_check);
      if (money !== 0) visible.add("money");
      if (cyl12 !== 0) visible.add("cyl12");
      if (cyl48 !== 0) visible.add("cyl48");
      if (systems.length > 0 || !hasActive) visible.add("systems");
      if (requiresCheck || systems.length > 0) visible.add("security_check");
    }
    return customerTopFilterOptions.filter((option) => visible.has(option.id));
  }, [searchScopedCustomers, systemsByCustomer]);
  const secondLevelOptions = useMemo(
    () => (topFilter ? getCustomerSubFilterOptions(topFilter) : []),
    [topFilter]
  );

  useEffect(() => {
    if (topFilter && !topLevelOptions.some((option) => option.id === topFilter)) {
      setTopFilter(null);
      setSubFilter(null);
    }
  }, [topFilter, topLevelOptions]);

  useEffect(() => {
    if (subFilter && !secondLevelOptions.some((option) => option.id === subFilter)) {
      setSubFilter(null);
    }
  }, [secondLevelOptions, subFilter]);

  const handleTopFilterChange = (next: CustomerListTopFilter | null) => {
    setTopFilter(next);
    setSubFilter(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.actionBlock}>
        <AddCustomerEntryAction />
      </View>
      <View style={styles.filtersBlock}>
        <NewSectionSearch
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search customers"
        />
        {topLevelOptions.length > 1 ? (
          <FilterChipRow
            options={topLevelOptions}
            value={topFilter}
            onChange={handleTopFilterChange}
          />
        ) : null}
        {topFilter && secondLevelOptions.length > 1 ? (
          <FilterChipRow
            options={secondLevelOptions}
            value={subFilter}
            onChange={setSubFilter}
            contentContainerStyle={styles.secondaryFilterRow}
          />
        ) : null}
      </View>
      <View style={styles.listBlock}>
        <AddCustomersSection
          searchQuery={searchQuery}
          topFilter={topFilter}
          subFilter={subFilter}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f7f7f8",
  },
  actionBlock: {
    marginTop: 12,
    marginHorizontal: 16,
  },
  filtersBlock: {
    marginHorizontal: 16,
    marginTop: 4,
  },
  secondaryFilterRow: {
    paddingTop: 0,
  },
  listBlock: {
    flex: 1,
    marginHorizontal: 16,
  },
});
