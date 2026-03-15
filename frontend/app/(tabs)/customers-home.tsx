import { StyleSheet, View } from "react-native";

import BalancesCard from "@/components/reports/BalancesCard";
import { useBalancesSummary } from "@/hooks/useBalancesSummary";

import { AddCustomerEntryAction, AddCustomersSection } from "./add/index";

const formatMoney = (value: number) => Number(value || 0).toFixed(0);
const formatCount = (value: number) => Number(value || 0).toFixed(0);
const formatCustomerCount = (count: number) => `${count} customer${count === 1 ? "" : "s"}`;

export default function CustomersHomeScreen() {
  const { balanceSummary, companySummary, companyBalancesQuery } = useBalancesSummary();

  return (
    <View style={styles.container}>
      <BalancesCard
        balanceSummary={balanceSummary}
        companySummary={companySummary}
        formatCustomerCount={formatCustomerCount}
        formatMoney={formatMoney}
        formatCount={formatCount}
        companyBalancesReady={companyBalancesQuery.isSuccess}
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
