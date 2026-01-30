import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const actions = [
  { label: "New Order", icon: "receipt-outline", onPress: () => router.push("/orders/new") },
  { label: "New Customer", icon: "person-add-outline", onPress: () => router.push("/customers/new") },
  { label: "Add Expense", icon: "cash-outline", onPress: () => router.push("/expenses/new") },
  { label: "Inventory", icon: "cube-outline", onPress: () => router.push("/inventory/new") },
  { label: "Daily Reports", icon: "calendar-outline", onPress: () => router.push("/(tabs)/reports") },
];

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Home</Text>
      <Text style={styles.subtitle}>Quick actions</Text>
      <View style={styles.grid}>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            onPress={action.onPress}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <Ionicons name={action.icon as any} size={22} color="#0a7ea4" />
            <Text style={styles.cardText}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f7f7f8",
    gap: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#444",
  },
  grid: {
    gap: 10,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
  cardPressed: {
    opacity: 0.9,
  },
  cardText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
});
