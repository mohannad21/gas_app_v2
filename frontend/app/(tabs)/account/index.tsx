import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/context/AuthContext";

export default function AccountScreen() {
  const { logout } = useAuth();
  const router = useRouter();

  function handleLogout() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Account</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Business</Text>
        <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/business-profile")}>
          <Text style={styles.rowText}>Business Profile</Text>
          <Text style={styles.rowChevron}>{">"}</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Subscription</Text>
        <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/plan-billing")}>
          <Text style={styles.rowText}>Plan & Billing</Text>
          <Text style={styles.rowChevron}>{">"}</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Team</Text>
        <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/workers")}>
          <Text style={styles.rowText}>Workers</Text>
          <Text style={styles.rowChevron}>{">"}</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Configuration</Text>
        <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/configuration/prices")}>
          <Text style={styles.rowText}>Prices</Text>
          <Text style={styles.rowChevron}>{">"}</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/configuration/system-types")}>
          <Text style={styles.rowText}>System Types</Text>
          <Text style={styles.rowChevron}>{">"}</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/configuration/expense-categories")}>
          <Text style={styles.rowText}>Expense Categories</Text>
          <Text style={styles.rowChevron}>{">"}</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>
        <Pressable style={styles.row} onPress={() => router.push("/(tabs)/account/change-password")}>
          <Text style={styles.rowText}>Change Password</Text>
          <Text style={styles.rowChevron}>{">"}</Text>
        </Pressable>
      </View>

      <Pressable style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f7f7f8",
  },
  title: {
    fontSize: 26,
    fontFamily: "NunitoSans-Bold",
    marginBottom: 24,
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 16,
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "NunitoSans-SemiBold",
    color: "#888",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee",
  },
  rowText: {
    fontSize: 16,
    color: "#111",
  },
  rowChevron: {
    fontSize: 20,
    color: "#aaa",
  },
  logoutButton: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  logoutText: {
    fontSize: 16,
    color: "#dc2626",
    fontFamily: "NunitoSans-SemiBold",
  },
});
