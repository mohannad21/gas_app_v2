import { useState } from "react";
import { StyleSheet } from "react-native";

import CustomerBalancesSection from "@/components/reports/CustomerBalancesSection";
import { useBalancesSummary } from "@/hooks/useBalancesSummary";

export default function CustomersTabBalances() {
  const [collapsed, setCollapsed] = useState(true);
  const { balanceSummary } = useBalancesSummary();

  return (
    <CustomerBalancesSection
      balanceSummary={balanceSummary}
      collapsed={collapsed}
      onToggle={() => setCollapsed((prev) => !prev)}
      formatMoney={(value) => Number(value || 0).toFixed(0)}
      formatCustomerCount={(count) => `${count} customer${count === 1 ? "" : "s"}`}
      containerStyle={styles.card}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
  },
});
