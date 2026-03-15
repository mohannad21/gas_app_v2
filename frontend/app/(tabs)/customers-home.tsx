import { useState } from "react";
import { StyleSheet, View } from "react-native";

import CustomerBalancesSection from "@/components/reports/CustomerBalancesSection";
import { useBalancesSummary } from "@/hooks/useBalancesSummary";
import { AddCustomerEntryAction, AddCustomersSection } from "./add/index";

export default function CustomersHomeScreen() {
  const [balancesCollapsed, setBalancesCollapsed] = useState(true);
  const { balanceSummary } = useBalancesSummary();

  return (
    <View style={styles.container}>
      <CustomerBalancesSection
        balanceSummary={balanceSummary}
        collapsed={balancesCollapsed}
        onToggle={() => setBalancesCollapsed((prev) => !prev)}
        formatMoney={(value) => Number(value || 0).toFixed(0)}
        formatCustomerCount={(count) => `${count} customer${count === 1 ? "" : "s"}`}
        containerStyle={styles.summaryCard}
      />
      <AddCustomerEntryAction />
      <AddCustomersSection />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  summaryCard: {
    marginTop: 12,
    marginHorizontal: 16,
    marginBottom: 8,
  },
});
