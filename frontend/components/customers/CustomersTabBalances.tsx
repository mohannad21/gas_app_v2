import { StyleSheet } from "react-native";

import CustomerBalancesSection from "@/components/reports/CustomerBalancesSection";
import { useBalancesSummary } from "@/hooks/useBalancesSummary";

export default function CustomersTabBalances() {
  const { balanceSummary } = useBalancesSummary();

  return (
    <CustomerBalancesSection
      balanceSummary={balanceSummary}
      formatMoney={(value) => Number(value || 0).toFixed(0)}
      formatCustomerCount={(count) => `${count} cust`}
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
