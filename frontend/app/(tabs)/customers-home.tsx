import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import FilterChipRow from "@/components/add/FilterChipRow";
import NewSectionSearch from "@/components/add/NewSectionSearch";
import {
  customerTopFilterOptions,
  CustomerListSubFilter,
  CustomerListTopFilter,
  getCustomerSubFilterOptions,
} from "@/components/customers/customerListFilters";
import CustomerBalancesSection from "@/components/reports/CustomerBalancesSection";
import { useBalancesSummary } from "@/hooks/useBalancesSummary";
import { AddCustomerEntryAction, AddCustomersSection } from "./add/index";

export default function CustomersHomeScreen() {
  const [balancesCollapsed, setBalancesCollapsed] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [topFilter, setTopFilter] = useState<CustomerListTopFilter>("all");
  const [subFilter, setSubFilter] = useState<CustomerListSubFilter>("all");
  const { balanceSummary } = useBalancesSummary();
  const secondLevelOptions = useMemo(() => getCustomerSubFilterOptions(topFilter), [topFilter]);

  const handleTopFilterChange = (next: CustomerListTopFilter) => {
    setTopFilter(next);
    setSubFilter("all");
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
        <FilterChipRow
          options={customerTopFilterOptions}
          value={topFilter}
          onChange={handleTopFilterChange}
        />
        {topFilter !== "all" ? (
          <FilterChipRow
            options={secondLevelOptions}
            value={subFilter}
            onChange={setSubFilter}
            contentContainerStyle={styles.secondaryFilterRow}
          />
        ) : null}
      </View>
      <CustomerBalancesSection
        balanceSummary={balanceSummary}
        collapsed={balancesCollapsed}
        onToggle={() => setBalancesCollapsed((prev) => !prev)}
        formatMoney={(value) => Number(value || 0).toFixed(0)}
        formatCustomerCount={(count) => `${count} customer${count === 1 ? "" : "s"}`}
        containerStyle={styles.summaryCard}
      />
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
  summaryCard: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
  },
  secondaryFilterRow: {
    paddingTop: 0,
  },
  listBlock: {
    flex: 1,
    marginHorizontal: 16,
  },
});
