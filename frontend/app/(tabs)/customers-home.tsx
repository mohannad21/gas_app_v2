import { StyleSheet, View } from "react-native";

import { AddCustomerEntryAction, AddCustomersSection } from "./add/index";

export default function CustomersHomeScreen() {
  return (
    <View style={styles.container}>
      <AddCustomerEntryAction />
      <AddCustomersSection />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
