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
import CustomersTabBalances from "@/components/customers/CustomersTabBalances";
import { AddCustomerEntryAction, AddCustomersSection } from "./add/index";

export default function CustomersHomeScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const [topFilter, setTopFilter] = useState<CustomerListTopFilter>("all");
  const [subFilter, setSubFilter] = useState<CustomerListSubFilter>("all");
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
      <CustomersTabBalances />
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
